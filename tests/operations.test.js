import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createStore } from "../server/store.js";
import { performAction } from "../server/actions.js";
import { maintenance } from "../server/maintenance.js";
import { backup, readBackup, restoreLocal, unseal } from "../server/backup.js";
import { reconcile } from "../server/reconcile.js";
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-ops-"));
  return { dir, store: createStore(dir, { demo: true }) };
};
async function picture() {
  return (
    "data:image/png;base64," +
    (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: "#00ff00" },
      })
        .png()
        .toBuffer()
    ).toString("base64")
  );
}
function fakeDrive() {
  const files = new Map(),
    removed = [];
  return {
    files,
    removed,
    configured: true,
    connected: async () => true,
    verifyFolders: async () => {},
    allocateId: async () => randomUUID(),
    upload: async (kind, uri, name, id) => {
      files.set(id, Buffer.from(uri.split(",")[1], "base64"));
      return id;
    },
    download: async (id) => {
      assert.ok(files.has(id));
      return new Response(files.get(id), {
        headers: { "content-type": "image/jpeg" },
      });
    },
    moveToWaste: async () => {},
    remove: async (id) => {
      removed.push(id);
      files.delete(id);
    },
  };
}
test("ambiguous commit never deletes a committed image; retry returns original result", async () => {
  const { dir, store } = fixture(),
    drive = fakeDrive(),
    original = store.transact.bind(store);
  let once = true;
  const actor = { role: "student", id: "65001" },
    body = {
      action: "submit",
      key: randomUUID(),
      payload: { image: await picture(), category: "กระดาษ" },
    };
  store.transact = (fn, scope) => {
    const result = original(fn, scope);
    if (scope?.requests && once) {
      once = false;
      throw Error("lost response after commit");
    }
    return result;
  };
  try {
    await assert.rejects(
      performAction(store, drive, actor, structuredClone(body)),
      /lost response/,
    );
    assert.equal(drive.removed.length, 0);
    const saved = store.read().submissions.at(-1);
    assert.deepEqual(
      await performAction(store, drive, actor, structuredClone(body)),
      { ok: true, id: saved.id },
    );
    assert.equal(drive.files.size, 1);
    await assert.rejects(
      performAction(store, drive, actor, {
        ...structuredClone(body),
        key: randomUUID(),
      }),
      /ภาพนี้เคยส่ง/,
    );
    await maintenance(store, drive, { now: Date.now() + 2 * 86400000 });
    assert.equal(drive.files.size, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("retention retries deletes, removes abandoned uploads and preserves referenced images", async () => {
  const { dir, store } = fixture(),
    drive = fakeDrive(),
    old = new Date(Date.now() - 40 * 86400000).toISOString();
  try {
    store.transact((s) => {
      s.submissions[0] = {
        ...s.submissions[0],
        status: "Rejected",
        image: "drive:rejectedImage123",
        reviewedAt: old,
      };
      s.submissions[1] = {
        ...s.submissions[1],
        status: "Cancelled",
        image: "drive:recentCancel123",
        at: old,
        cancelledAt: new Date().toISOString(),
      };
      s.mediaJobs.push({ id: "abandonedImage123", kind: "upload", at: old });
    });
    let failed = true;
    const remove = drive.remove;
    drive.remove = async (id) => {
      if (id === "rejectedImage123" && failed) throw Error("temporary");
      return remove(id);
    };
    const first = await maintenance(store, drive);
    assert.equal(first.failures, 1);
    assert.ok(store.read().mediaJobs.some((x) => x.id === "rejectedImage123"));
    assert.equal(store.read().submissions[0].image, "");
    assert.ok(drive.removed.includes("abandonedImage123"));
    assert.ok(!drive.removed.includes("recentCancel123"));
    failed = false;
    await store.control("delete", { id: "maintenance:lease" });
    await maintenance(store, drive);
    assert.ok(drive.removed.includes("rejectedImage123"));
    assert.equal(store.read().mediaJobs.length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("encrypted backup restores balances, stock and images into an empty target", async () => {
  const { dir, store } = fixture(),
    drive = fakeDrive(),
    key = randomBytes(32).toString("hex"),
    target = createStore(join(dir, "restored"), { demo: false });
  try {
    drive.files.set(
      "backupImage123",
      Buffer.from((await picture()).split(",")[1], "base64"),
    );
    store.transact((s) => {
      s.submissions[0].image = "drive:backupImage123";
    });
    const file = await backup(store, drive, join(dir, "backups"), key);
    const bundle = await readBackup(file, key);
    await assert.rejects(readBackup(file, randomBytes(32).toString("hex")));
    await restoreLocal(bundle, file, key, target);
    const restored = target.read();
    assert.deepEqual(restored.ledger, store.read().ledger);
    assert.deepEqual(restored.rewards, store.read().rewards);
    assert.match(restored.submissions[0].image, /^data:image/);
    assert.equal(reconcile(restored).ok, true);
    await assert.rejects(restoreLocal(bundle, file, key, target), /empty/);
  } finally {
    target.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
