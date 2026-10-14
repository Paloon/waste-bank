import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createStore } from "../server/store.js";
import { readBackup, restoreLocal } from "../server/backup.js";
import { reconcile } from "../server/reconcile.js";
import { evidenceExpired } from "../server/maintenance.js";
import assert from "node:assert/strict";

// Restoration always targets a new private SQLite directory. Recording only a
// health receipt is opt-in; it never restores or changes the live student data.
const file = process.argv[2];
const recordHealth = process.argv.slice(3).includes("--record-health");
if (!file)
  throw Error(
    "Usage: node scripts/verify-recovery.mjs SNAPSHOT.wb (BACKUP_KEY required)",
  );
const started = Date.now(),
  source = resolve(file),
  key = process.env.BACKUP_KEY;
const bundle = await readBackup(source, key);
const directory = await mkdtemp(join(tmpdir(), "wb-isolated-recovery-"));
let store;
try {
  store = createStore(directory, { demo: false });
  await restoreLocal(bundle, source, key, store);
  const state = store.read(),
    reconciliation = reconcile(state);
  assert.equal(
    reconciliation.ok,
    true,
    "Restored balances/stock do not reconcile",
  );
  for (const name of [
    "students",
    "staff",
    "ledger",
    "rewards",
    "submissions",
    "redemptions",
  ])
    assert.equal(
      state[name].length,
      bundle.state[name].length,
      `${name} count mismatch`,
    );
  assert.deepEqual(
    state.ledger,
    bundle.state.ledger,
    "Ledger differs from authenticated backup",
  );
  let images = 0,
    expired = 0;
  for (const item of state.submissions) {
    if (evidenceExpired(item)) {
      assert.ok(
        !item.image && !item.disposalImage,
        "Expired evidence was restored",
      );
      expired++;
    } else
      for (const field of ["image", "disposalImage"]) {
        const original = bundle.state.submissions.find(
          (x) => x.id === item.id,
        )?.[field];
        if (original) {
          assert.match(
            item[field],
            /^data:image\//,
            "Evidence not restored inline",
          );
          images++;
        }
      }
  }
  const result = {
    ok: true,
    isolated: true,
    snapshotAt: bundle.at,
    recoveryMs: Date.now() - started,
    evidenceImages: images,
    expiredSubmissions: expired,
    students: state.students.length,
    ledgerEntries: state.ledger.length,
    reconciliation,
    at: new Date().toISOString(),
    verified: true,
    method: "isolated-sqlite",
    cloudRestoreVerified: false,
  };
  if (recordHealth) {
    const { runtime } = await import("./runtime.mjs");
    const { store: healthStore } = runtime();
    try {
      await healthStore.control("put", {
        id: "health:restore",
        value: {
          ...result,
          expires: Date.now() + 90 * 86400000,
        },
      });
    } finally {
      healthStore.close?.();
    }
  }
  console.log(JSON.stringify(result));
} finally {
  store?.close();
  // Only the private directory created above is removed, never a supplied path.
  await rm(directory, { recursive: true, force: true });
}
