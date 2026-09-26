import { randomUUID } from "node:crypto";
import { pruneReceipts } from "./state.js";
import { report } from "./monitor.js";
import { reconcile } from "./reconcile.js";
export const retentionDays = (status) =>
  Math.max(
    1,
    Number(
      process.env[
        status === "Pending"
          ? "PENDING_RETENTION_DAYS"
          : status === "Approved"
            ? "APPROVED_RETENTION_DAYS"
            : "RETENTION_DAYS"
      ],
    ) || (status === "Pending" ? 90 : status === "Approved" ? 180 : 30),
  );
export const evidenceExpired = (item, now = Date.now()) =>
  now - Date.parse(item.cancelledAt || item.reviewedAt || item.at) >
  retentionDays(item.status) * 86400000;
export function referencedFiles(s) {
  return new Set(
    [
      ...s.submissions.map((x) => x.image),
      ...s.rewards.flatMap((r) =>
        r.images?.length ? r.images.map((x) => x.src) : [r.image],
      ),
    ]
      .filter((x) => x?.startsWith("drive:"))
      .map((x) => x.slice(6)),
  );
}
export async function maintenance(
  store,
  drive,
  { budgetMs = 45_000, now = Date.now() } = {},
) {
  const started = Date.now();
  const lease = await store.control("rate", {
    id: "maintenance:lease",
    limit: 1,
    window: 120000,
  });
  if (!lease.allowed) return { busy: true, retryAfter: lease.retryAfter };
  let failures = 0,
    processed = 0;
  const scope = {
    submissions: {},
    rewards: {},
    mediaJobs: {},
    requests: {},
    audit: {},
    meta: { ids: ["pendingDriveDeletes"] },
  };
  await store.control("prune");
  await store.transact((s) => {
    pruneReceipts(s, now);
    const auditDays = Math.max(
      30,
      Number(process.env.AUDIT_RETENTION_DAYS) || 365,
    );
    s.audit = s.audit.filter(
      (x) => now - Date.parse(x.at) < auditDays * 86400000,
    );
    const queue = (id) => {
      if (!s.mediaJobs.some((j) => j.id === id))
        s.mediaJobs.push({
          id,
          kind: "delete",
          at: new Date(now).toISOString(),
        });
      else s.mediaJobs.find((j) => j.id === id).kind = "delete";
    };
    for (const id of s.pendingDriveDeletes) queue(id);
    s.pendingDriveDeletes = [];
    for (const item of s.submissions)
      if (item.image && evidenceExpired(item, now)) {
        if (item.image.startsWith("drive:")) queue(item.image.slice(6));
        item.image = "";
        item.evidenceRemovedAt = new Date(now).toISOString();
        s.audit.unshift({
          id: randomUUID(),
          staff: "system",
          action: "evidenceExpired",
          target: item.id,
          before: null,
          after: { status: item.status },
          at: new Date(now).toISOString(),
        });
      }
  }, scope);
  let storage = null;
  if (drive.storageInfo && (await drive.connected())) {
    try {
      storage = await drive.storageInfo();
    } catch {
      await report(store, "DRIVE_QUOTA_CHECK_FAILED");
    }
  }
  const snapshot = await store.read();
  const reconciliation = reconcile(snapshot);
  if (!reconciliation.ok) await report(store, "RECONCILIATION_FAILED");
  if (drive.configured) {
    try {
      await drive.verifyFolders();
    } catch {
      await report(store, "DRIVE_PERMISSIONS_FAILED");
      failures++;
    }
  }
  const jobs = snapshot.mediaJobs;
  for (
    let offset = 0;
    offset < jobs.length && Date.now() - started < budgetMs;
    offset += 4
  ) {
    const references = await store.read({ submissions: {}, rewards: {} });
    await Promise.all(
      jobs.slice(offset, offset + 4).map(async (job) => {
        if (job.kind === "upload" && now - Date.parse(job.at) < 86400000)
          return;
        try {
          const s = references,
            referenced = referencedFiles(s).has(job.id);
          if (referenced) {
            const approved = s.submissions.find(
              (x) => x.image === `drive:${job.id}` && x.status === "Approved",
            );
            if (approved) await drive.moveToWaste(job.id);
          } else await drive.remove(job.id);
          await store.transact(
            (s) => {
              s.mediaJobs = s.mediaJobs.filter((x) => x.id !== job.id);
            },
            { mediaJobs: { ids: [job.id] } },
          );
          processed++;
        } catch {
          failures++;
          await report(store, "DRIVE_CLEANUP_FAILED");
        }
      }),
    );
  }
  const pending = (await store.read({ mediaJobs: {} })).mediaJobs;
  const health = {
    at: new Date().toISOString(),
    processed,
    failures,
    reconciliation,
    storage,
    pending: pending.length,
    overdue: pending.filter((j) => now - Date.parse(j.at) > 86400000).length,
    expires: Date.now() + 30 * 86400000,
  };
  await store.control("put", { id: "health:maintenance", value: health });
  return health;
}
