import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestDatabase } from "./pglite.mjs";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createStore } from "../server/store.js";
import { createCloudStore } from "../server/cloud-store.js";
import { backup, readBackup, restoreLocal } from "../server/backup.js";
import { importRecovery } from "../server/recovery-import.js";

test("encrypted backup -> isolated SQLite -> empty PostgreSQL verifies both photos, ledger and stock", async () => {
  const directory = mkdtempSync(join(tmpdir(), "wb-cloud-recovery-")),
    source = createStore(directory, { demo: true }),
    local = createStore(join(directory, "restored"), { demo: false }),
    db = await createTestDatabase(),
    key = "ab".repeat(32);
  const files = new Map();
  let uploads = 0;
  const drive = {
    connected: async () => true,
    verifyFolders: async () => {},
    allocateId: async () => randomUUID(),
    upload: async (folder, uri, name, id) => {
      uploads++;
      files.set(id, Buffer.from(uri.split(",")[1], "base64"));
    },
    download: async (id) =>
      new Response(files.get(id), {
        status: files.has(id) ? 200 : 404,
        headers: { "content-type": "image/png" },
      }),
  };
  try {
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#abcdef" },
    })
      .png()
      .toBuffer();
    files.set("primary123", png);
    files.set("disposal123", png);
    source.transact((s) => {
      for (const item of s.submissions)
        item.image = `data:image/png;base64,${png.toString("base64")}`;
      s.submissions[0].image = "drive:primary123";
      s.submissions[0].disposalImage = "drive:disposal123";
      s.submissions[0].submittedCount = 3;
      s.submissions[0].count = 3;
      s.submissions[0].coinRate = 5;
      s.submissions[1].evidenceDeletionPending = ["staleDelete123"];
      s.mediaJobs.push({
        id: "staleDelete123",
        kind: "delete",
        at: new Date().toISOString(),
      });
    });
    const file = await backup(source, drive, join(directory, "backups"), key),
      bundle = await readBackup(file, key);
    await restoreLocal(bundle, file, key, local);
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;",
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    const cloud = createCloudStore({
      url: "https://isolated.invalid",
      key: "test",
      fetcher: async (url, options) => {
        if (url.includes("waste_bank_state?"))
          return Response.json(
            (await db.query("select id from waste_bank_state where id=1")).rows,
          );
        const args = JSON.parse(options.body),
          fn = url.split("/").at(-1);
        const queries = {
          wb_initialize: [
            "select wb_initialize($1) result",
            [args.initial_rows],
          ],
          wb_snapshot: ["select wb_snapshot($1) result", [args.scope]],
          wb_control: ["select wb_control($1,$2) result", [args.op, args.args]],
        };
        assert.ok(queries[fn], fn);
        return Response.json((await db.query(...queries[fn])).rows[0].result);
      },
    });
    const result = await importRecovery({
      local,
      cloud,
      drive,
      allowDemo: true,
      scope: "isolated-rehearsal",
    });
    assert.equal(result.cloudRestoreVerified, true);
    assert.equal(result.scope, "isolated-rehearsal");
    const state = await cloud.read(),
      item = state.submissions.find(
        (s) => s.id === bundle.state.submissions[0].id,
      );
    assert.match(item.image, /^drive:/);
    assert.match(item.disposalImage, /^drive:/);
    assert.notEqual(item.image, item.disposalImage);
    assert.equal(item.submittedCount, 3);
    assert.equal(item.count, 3);
    assert.equal(item.coinRate, 5);
    assert.deepEqual(
      [...state.ledger].sort((a, b) => a.id.localeCompare(b.id)),
      [...bundle.state.ledger].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(
      state.rewards.map((x) => [x.id, x.stock]).sort(),
      bundle.state.rewards.map((x) => [x.id, x.stock]).sort(),
    );
    assert.equal(state.mediaJobs.length, 0);
    assert.equal(
      state.submissions.some((x) => x.evidenceDeletionPending),
      false,
    );
    assert.equal(
      (await cloud.control("get", { id: "health:recovery-import" }))
        .cloudRestoreVerified,
      true,
    );
    const before = uploads;
    await assert.rejects(
      importRecovery({ local, cloud, drive, allowDemo: true }),
      /not empty/,
    );
    assert.equal(uploads, before);
  } finally {
    local.close();
    source.close();
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("changing initialized target stops uploads and never initializes again", async () => {
  let checked = 0,
    uploaded = 0,
    initialized = 0;
  const { seed } = await import("../server/store.js");
  const { s } = seed();
  const cloud = {
    initialized: async () => ++checked > 1,
    initialize: async () => {
      initialized++;
      return true;
    },
  };
  await assert.rejects(
    importRecovery({
      local: { read: () => s },
      cloud,
      allowDemo: true,
      drive: {
        connected: async () => true,
        verifyFolders: async () => {},
        upload: async () => uploaded++,
      },
    }),
    /Target changed/,
  );
  assert.equal(uploaded, 0);
  assert.equal(initialized, 0);
});
