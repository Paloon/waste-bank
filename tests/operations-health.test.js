import test from "node:test";
import assert from "node:assert/strict";
import {
  operationsHealth,
  readOperationsHealth,
} from "../server/operations-health.js";

const now = Date.parse("2026-10-14T10:00:00Z");
const good = () => ({
  backup: { at: new Date(now - 3600000).toISOString() },
  maintenance: {
    at: new Date(now - 3600000).toISOString(),
    failures: 0,
    overdue: 0,
    reconciliation: { ok: true },
  },
  restore: { at: new Date(now - 3600000).toISOString(), verified: true },
});
test("operations warns for missing/stale runs and does not infer scheduler from config", () => {
  assert.equal(operationsHealth(good(), now).ok, true);
  const missing = operationsHealth({}, now).alerts.map((x) => x.code);
  assert.deepEqual(missing, [
    "BACKUP_STALE",
    "MAINTENANCE_STALE",
    "RESTORE_UNVERIFIED",
  ]);
  const health = good();
  health.backup.at = "2026-10-12T10:00:00Z";
  health.restore.at = "2026-06-01T10:00:00Z";
  health.maintenance.overdue = 2;
  health.maintenance.reconciliation.ok = false;
  assert.deepEqual(
    operationsHealth(health, now).alerts.map((x) => x.code),
    [
      "BACKUP_STALE",
      "MEDIA_CLEANUP_PENDING",
      "RECONCILIATION_FAILED",
      "RESTORE_UNVERIFIED",
    ],
  );
  health.backup.at = "2027-01-01T00:00:00Z";
  assert.ok(
    operationsHealth(health, now).alerts.some((x) => x.code === "BACKUP_STALE"),
  );
});
test("operations status reads health only and reports recent errors", async () => {
  const requested = [];
  const health = await readOperationsHealth({
    control: async (op, args) => {
      assert.equal(op, "get");
      requested.push(args.id);
      return null;
    },
  });
  assert.equal(requested.length, 5);
  assert.equal(health.status.ok, false);
  assert.ok(
    operationsHealth(
      {
        ...good(),
        error: {
          at: new Date(now).toISOString(),
          code: "DRIVE_CLEANUP_FAILED",
        },
      },
      now,
    ).alerts.some((x) => x.code === "RECENT_ERROR"),
  );
  assert.ok(
    operationsHealth(
      {
        ...good(),
        backupAttempt: { at: new Date(now).toISOString(), ok: false },
      },
      now,
    ).alerts.some((x) => x.code === "BACKUP_FAILED"),
  );
});
