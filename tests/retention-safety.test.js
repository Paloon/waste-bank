import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { seed, act, balance, createStore } from "../server/store.js";
import { maintenance } from "../server/maintenance.js";
import { backup, readBackup, restoreLocal } from "../server/backup.js";

test("approval rejects missing, detached, invalid-date and 90-day evidence without credit", () => {
  for (const change of [
    { image: "" },
    { evidenceRemovedAt: new Date().toISOString() },
    { at: "invalid" },
    { at: new Date(Date.now() - 90 * 86400000).toISOString() },
  ]) {
    const { s } = seed(),
      item = s.submissions[0];
    Object.assign(item, change);
    const before = balance(s, item.student),
      ledger = s.ledger.length;
    assert.throws(
      () =>
        act(
          s,
          { role: "staff", id: "teacher.mali" },
          {
            action: "review",
            key: randomUUID(),
            payload: { id: item.id, status: "Approved", count: 2 },
          },
        ),
      /หลักฐาน/,
    );
    assert.equal(balance(s, item.student), before);
    assert.equal(s.ledger.length, ledger);
    assert.equal(item.status, "Pending");
  }
});

test("approval with primary evidence and optional disposal image omitted credits once", () => {
  const { s } = seed(),
    item = s.submissions[0],
    before = balance(s, item.student);
  item.disposalImage = "";
  const body = {
    action: "review",
    key: randomUUID(),
    payload: {
      id: item.id,
      status: "Approved",
      count: 2,
    },
  };
  act(s, { role: "staff", id: "teacher.mali" }, body);
  act(s, { role: "staff", id: "teacher.mali" }, body);
  assert.equal(balance(s, item.student), before + item.coins);
  assert.equal(s.ledger.filter((x) => x.related === item.id).length, 1);
});

test("disposal-only retention distinguishes detachment from successful deletion and retries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-retention-")),
    store = createStore(dir, { demo: true });
  let fail = true;
  const drive = {
    remove: async () => {
      if (fail) throw Error("offline");
    },
  };
  try {
    store.transact((s) =>
      Object.assign(s.submissions[0], {
        image: "",
        disposalImage: "drive:bin123",
        at: new Date(Date.now() - 91 * 86400000).toISOString(),
      }),
    );
    const first = await maintenance(store, drive);
    let item = store.read().submissions[0];
    assert.ok(item.evidenceDetachedAt);
    assert.equal(item.evidenceDeletedAt, undefined);
    assert.deepEqual(item.evidenceDeletionPending, ["bin123"]);
    assert.equal(first.deletionFailed, 1);
    assert.equal(store.read().mediaJobs[0].attempts, 1);
    fail = false;
    await store.control("delete", { id: "maintenance:lease" });
    await maintenance(store, drive);
    item = store.read().submissions[0];
    assert.ok(item.evidenceDeletedAt);
    assert.deepEqual(item.evidenceDeletionPending, []);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed backup records failure and authenticated restore rejects altered manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-recovery-")),
    store = createStore(dir, { demo: true }),
    target = createStore(join(dir, "target"), { demo: false }),
    key = "ab".repeat(32);
  try {
    store.transact((s) => {
      s.submissions[0].image = "drive:photo123";
    });
    await assert.rejects(
      backup(
        store,
        {
          download: async () => {
            throw Error("offline");
          },
        },
        join(dir, "backups"),
        key,
      ),
    );
    assert.equal(
      (await store.control("get", { id: "health:backupAttempt" })).ok,
      false,
    );
    const file = await backup(
      store,
      { download: async () => new Response(Buffer.from("image")) },
      join(dir, "backups"),
      key,
    );
    const bundle = await readBackup(file, key);
    const changed = structuredClone(bundle);
    changed.state.ledger[0].amount++;
    await assert.rejects(
      restoreLocal(changed, file, key, target),
      /manifest mismatch/,
    );
    await restoreLocal(bundle, file, key, target);
    assert.deepEqual(target.read().ledger, store.read().ledger);
    assert.match(target.read().submissions[0].image, /^data:/);
    await assert.rejects(readBackup(file, "cd".repeat(32)));
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["scripts/verify-recovery.mjs", file, "--record-health"],
      {
        env: {
          ...process.env,
          BACKUP_KEY: key,
          DATA_DIR: dir,
          SUPABASE_URL: "",
          VERCEL: "",
        },
      },
    );
    assert.equal(JSON.parse(stdout).isolated, true);
    assert.equal(JSON.parse(stdout).ledgerEntries, store.read().ledger.length);
    const proof = store.control("get", { id: "health:restore" });
    assert.equal(proof.verified, true);
    assert.equal(proof.method, "isolated-sqlite");
    assert.equal(proof.cloudRestoreVerified, false);
  } finally {
    target.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
