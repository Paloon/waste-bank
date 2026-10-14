export const POLL_MS = 60_000;
export const RETRY_MS = 15 * 60_000;
const DAY_MS = 86_400_000;
const BANGKOK_OFFSET = 7 * 60 * 60_000;

// Bangkok has no DST: 08:00 Bangkok is 01:00 UTC on the same date.
export function latestDailyDue(now) {
  const local = new Date(now + BANGKOK_OFFSET);
  const today = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    1,
  );
  return now >= today ? today : today - DAY_MS;
}
export function nextDue(now, lastVerified = null, retryAt = null) {
  if (Number.isFinite(retryAt)) return Math.max(now, retryAt);
  const daily = latestDailyDue(now);
  return Number.isFinite(lastVerified) && lastVerified >= daily
    ? daily + DAY_MS
    : now;
}
export function validLock(value) {
  return (
    value &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.nonce === "string" &&
    /^[a-f0-9]{32}$/.test(value.nonce)
  );
}
export function sameLock(a, b) {
  return Boolean(
    validLock(a) && validLock(b) && a.pid === b.pid && a.nonce === b.nonce,
  );
}
export function validateBackupEnvironment(env) {
  if (
    !/^[a-f0-9]{64}$/i.test(env.BACKUP_KEY || "") ||
    !env.BACKUP_DIR ||
    !env.DATA_DIR
  )
    throw new Error("INVALID_BACKUP_CONFIGURATION");
  const keepDays =
    env.BACKUP_KEEP_DAYS === undefined ? 7 : Number(env.BACKUP_KEEP_DAYS);
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 30)
    throw new Error("INVALID_BACKUP_CONFIGURATION");
  return { keepDays };
}
export function createBackupSchedule({
  run,
  now = Date.now,
  lastVerified = null,
  onChange = async () => {},
}) {
  let busy = false,
    retryAt = null,
    started = false;
  const snapshot = () => ({
    running: busy,
    lastVerified,
    retryAt,
    nextDue: nextDue(now(), lastVerified, retryAt),
  });
  return {
    snapshot,
    async tick() {
      if (busy || (started && nextDue(now(), lastVerified, retryAt) > now()))
        return false;
      started = true;
      busy = true;
      try {
        await onChange({ ...snapshot(), stage: "backing-up" });
        await run();
        lastVerified = now();
        retryAt = null;
        await onChange({
          ...snapshot(),
          running: false,
          stage: "ready",
          ok: true,
        });
      } catch {
        retryAt = now() + RETRY_MS;
        await onChange({
          ...snapshot(),
          running: false,
          stage: "retrying",
          ok: false,
          code: "BACKUP_FAILED",
        });
      } finally {
        busy = false;
      }
      return true;
    },
  };
}
