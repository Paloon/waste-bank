import { randomBytes } from "node:crypto";
import { readFile, writeFile, unlink, lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { runtime } from "./runtime.mjs";
import { backup } from "../server/backup.js";
import {
  createBackupSchedule,
  POLL_MS,
  sameLock,
  validLock,
  validateBackupEnvironment,
} from "../server/backup-schedule.js";

// These paths belong only to the protected installed runtime, never to argv/env.
const lockFile = new URL(
  "../.scheduled.backup.scheduler.lock.json",
  import.meta.url,
);
const statusFile = new URL(
  "../.scheduled.backup.scheduler.status.json",
  import.meta.url,
);
const owner = { pid: process.pid, nonce: randomBytes(16).toString("hex") };
let acquired = false,
  stopping = false,
  timer,
  store,
  active;
const startedAt = new Date().toISOString();
async function safeFile(path) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw Error("UNSAFE_RUNTIME_FILE");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
async function readLock() {
  await safeFile(lockFile);
  try {
    return JSON.parse(await readFile(lockFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Error("INVALID_LOCK");
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}
async function acquire() {
  await safeFile(lockFile);
  try {
    await writeFile(lockFile, JSON.stringify(owner), {
      flag: "wx",
      mode: 0o600,
    });
    acquired = true;
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const previous = await readLock();
  if (!validLock(previous) || alive(previous.pid)) return false;
  if (!sameLock(previous, await readLock())) return false;
  await unlink(lockFile);
  try {
    await writeFile(lockFile, JSON.stringify(owner), {
      flag: "wx",
      mode: 0o600,
    });
    acquired = true;
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}
async function status(value) {
  await safeFile(statusFile);
  await writeFile(
    statusFile,
    JSON.stringify(
      {
        startedAt,
        updatedAt: new Date().toISOString(),
        pid: process.pid,
        timezone: "Asia/Bangkok",
        dailyAt: "08:00",
        ...value,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  await active?.catch(() => {});
  await status({ stage: "stopped", ok: false }).catch(() => {});
  store?.close?.();
  if (acquired && sameLock(owner, await readLock().catch(() => null)))
    await unlink(lockFile).catch(() => {});
}
try {
  if (await acquire()) {
    const { keepDays } = validateBackupEnvironment(process.env);
    if (
      !isAbsolute(process.env.BACKUP_DIR) ||
      !isAbsolute(process.env.DATA_DIR)
    )
      throw Error("INVALID_BACKUP_CONFIGURATION");
    await status({ stage: "starting" });
    const context = runtime();
    store = context.store;
    const scheduleStatus = (value) =>
      status({
        ...value,
        lastVerified:
          value.lastVerified === null
            ? null
            : new Date(value.lastVerified).toISOString(),
        retryAt:
          value.retryAt === null ? null : new Date(value.retryAt).toISOString(),
        nextDue: new Date(value.nextDue).toISOString(),
      });
    const schedule = createBackupSchedule({
      run: () =>
        backup(
          store,
          context.drive,
          process.env.BACKUP_DIR,
          process.env.BACKUP_KEY,
          { keepDays },
        ),
      onChange: scheduleStatus,
    });
    const tick = () => {
      if (!stopping && !schedule.snapshot().running) {
        active = (async () => {
          if (!(await schedule.tick())) {
            const value = schedule.snapshot();
            await scheduleStatus({
              ...value,
              stage: value.retryAt ? "retrying" : "ready",
              ok: !value.retryAt,
            });
          }
        })();
        active.catch(() => shutdown());
      }
    };
    process.on("SIGINT", () => {
      shutdown().then(() => process.exit());
    });
    process.on("SIGTERM", () => {
      shutdown().then(() => process.exit());
    });
    tick();
    timer = setInterval(tick, POLL_MS);
  }
} catch {
  if (acquired) {
    await status({
      stage: "failed",
      ok: false,
      code: "SCHEDULER_CONFIGURATION_FAILED",
    }).catch(() => {});
    store?.close?.();
    if (sameLock(owner, await readLock().catch(() => null)))
      await unlink(lockFile).catch(() => {});
  }
  process.exitCode = 1;
}
