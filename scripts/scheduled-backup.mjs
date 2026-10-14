import { writeFile } from "node:fs/promises";
import { backup } from "../server/backup.js";
import { runtime } from "./runtime.mjs";

const statusFile = new URL("../scheduled.backup.status.json", import.meta.url);
const startedAt = new Date().toISOString();
const status = (value) =>
  writeFile(statusFile, JSON.stringify({ startedAt, ...value }, null, 2));
let store;
try {
  await status({ stage: "starting" });
  const context = runtime();
  store = context.store;
  await status({ stage: "backing-up" });
  await backup(
    store,
    context.drive,
    process.env.BACKUP_DIR,
    process.env.BACKUP_KEY,
    {
      keepDays: Number(process.env.BACKUP_KEEP_DAYS) || 7,
    },
  );
  await status({
    stage: "verified",
    finishedAt: new Date().toISOString(),
    ok: true,
  });
} catch (error) {
  // Never persist credentials, upstream bodies, photos, names or exception text.
  await status({
    stage: "failed",
    finishedAt: new Date().toISOString(),
    ok: false,
    code:
      typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : "BACKUP_FAILED",
  }).catch(() => {});
  process.exitCode = 1;
} finally {
  store?.close?.();
}
