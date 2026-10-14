import { normalizeImage } from "./images.js";
import { reconcile } from "./reconcile.js";
import { assert } from "./errors.js";
import { fingerprint } from "./state.js";
import { evidenceExpired, referencedFiles } from "./maintenance.js";
import { createHash } from "node:crypto";

export async function importRecovery({
  local,
  cloud,
  drive,
  allowDemo = false,
  scope = "target",
  normalize = normalizeImage,
}) {
  const started = Date.now();
  assert(
    !(await cloud.initialized()),
    "Target is not empty; import never overwrites existing data",
  );
  let state = await local.read();
  assert(
    allowDemo ||
      !state.staff.some((x) => x.id === "teacher.mali" && x.enabled !== false),
    "Disable demo staff and create real staff before migration",
  );
  assert(
    reconcile(state).ok,
    "Reconciliation failed; repair source before migration",
  );
  const targets = [
    ...state.submissions.flatMap((item) =>
      ["image", "disposalImage"].map((field) => ({
        kind: "submissions",
        id: item.id,
        field,
        value: item[field],
        folder: "evidence",
      })),
    ),
    ...state.rewards.flatMap((item) =>
      item.images?.length
        ? item.images.map((image, index) => ({
            kind: "rewards",
            id: item.id,
            index,
            value: image.src,
            folder: "rewards",
          }))
        : [
            {
              kind: "rewards",
              id: item.id,
              field: "image",
              value: item.image,
              folder: "rewards",
            },
          ],
    ),
  ];
  const inline = targets.filter(
    (x) =>
      x.value?.startsWith("data:") &&
      (x.kind !== "submissions" ||
        !evidenceExpired(state.submissions.find((s) => s.id === x.id))),
  );
  if (inline.length) {
    assert(
      await drive.connected(),
      "Connect Drive locally before migrating inline images",
    );
    await drive.verifyFolders();
  }
  const uploadedHashes = new Map();
  for (const target of inline) {
    // Check before each upload as well as before import; never start work on initialized target.
    assert(
      !(await cloud.initialized()),
      "Target changed during import; stop before uploading more files",
    );
    const uri = await normalize(target.value),
      id = await drive.allocateId();
    await local.transact((s) =>
      s.mediaJobs.push({ id, kind: "upload", at: new Date().toISOString() }),
    );
    await drive.upload(target.folder, uri, `migration-${id}.jpg`, id);
    uploadedHashes.set(
      id,
      createHash("sha256")
        .update(Buffer.from(uri.split(",")[1], "base64"))
        .digest("hex"),
    );
    await local.transact((s) => {
      const item = s[target.kind].find((x) => x.id === target.id);
      if (target.index !== undefined) {
        item.images[target.index].src = `drive:${id}`;
        item.image = item.images[0].src;
      } else item[target.field] = `drive:${id}`;
    });
  }
  state = structuredClone(await local.read());
  state.requests = {};
  state.mediaJobs = [];
  state.pendingDriveDeletes = [];
  for (const item of state.submissions) {
    delete item.evidenceDeletionPending;
    if (evidenceExpired(item)) {
      item.image = "";
      item.disposalImage = "";
      item.evidenceDetachedAt ||= new Date().toISOString();
    }
  }
  assert(
    await cloud.initialize(state),
    "Target changed during import; source retains migrated references for recovery",
  );
  const restored = await cloud.read();
  assert(reconcile(restored).ok, "Imported target does not reconcile");
  for (const name of [
    "students",
    "staff",
    "ledger",
    "rewards",
    "submissions",
    "redemptions",
  ]) {
    const sorted = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    assert(
      fingerprint(sorted(restored[name])) === fingerprint(sorted(state[name])),
      `Imported ${name} differs from source`,
    );
  }
  // Verify all target image references can actually be downloaded, including both evidence fields.
  let imagesVerified = 0;
  for (const id of referencedFiles(restored)) {
    const response = await drive.download(id);
    assert(response.ok, "Imported image is unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 0, "Imported image is empty");
    if (uploadedHashes.has(id))
      assert(
        createHash("sha256").update(bytes).digest("hex") ===
          uploadedHashes.get(id),
        "Imported image checksum mismatch",
      );
    imagesVerified++;
  }
  const result = {
    at: new Date().toISOString(),
    cloudRestoreVerified: true,
    scope,
    imagesVerified,
    recoveryMs: Date.now() - started,
    expires: Date.now() + 30 * 86400000,
  };
  await cloud.control("put", { id: "health:recovery-import", value: result });
  return result;
}
