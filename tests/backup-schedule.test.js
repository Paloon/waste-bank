import test from "node:test";
import assert from "node:assert/strict";
import {
  latestDailyDue,
  nextDue,
  RETRY_MS,
  sameLock,
  validLock,
  validateBackupEnvironment,
  createBackupSchedule,
} from "../server/backup-schedule.js";
const at = (value) => Date.parse(value);
test("Bangkok 08:00 boundary uses UTC and handles date/year rollover", () => {
  assert.equal(
    latestDailyDue(at("2026-12-31T23:30:00Z")),
    at("2026-12-31T01:00:00Z"),
  );
  assert.equal(
    latestDailyDue(at("2027-01-01T01:00:00Z")),
    at("2027-01-01T01:00:00Z"),
  );
  assert.equal(
    nextDue(at("2027-01-01T00:59:59Z"), at("2026-12-31T01:10:00Z")),
    at("2027-01-01T01:00:00Z"),
  );
});
test("resume catches up after missed daily backup, verified today waits until tomorrow", () => {
  const now = at("2026-10-14T09:00:00Z");
  assert.equal(nextDue(now, at("2026-10-13T01:05:00Z")), now);
  assert.equal(
    nextDue(now, at("2026-10-14T01:05:00Z")),
    at("2026-10-15T01:00:00Z"),
  );
  assert.equal(nextDue(now, null, now + RETRY_MS), now + RETRY_MS);
});
test("startup verifies even when today's backup is current; no overlap and daily resume catchup", async () => {
  let now = at("2026-10-14T02:00:00Z"),
    calls = 0,
    finish;
  const schedule = createBackupSchedule({
    now: () => now,
    lastVerified: now,
    run: async () => {
      calls++;
      await new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const first = schedule.tick();
  await Promise.resolve();
  assert.equal(await schedule.tick(), false);
  finish();
  await first;
  assert.equal(calls, 1);
  assert.equal(await schedule.tick(), false);
  now = at("2026-10-16T06:00:00Z");
  const resumed = schedule.tick();
  await Promise.resolve();
  finish();
  await resumed;
  assert.equal(calls, 2);
  assert.equal(schedule.snapshot().lastVerified, now);
});
test("failure is redacted, preserves verified timestamp and retries in 15 minutes", async () => {
  let now = at("2026-10-14T02:00:00Z"),
    fail = true;
  const statuses = [],
    previous = now - 86400000;
  const schedule = createBackupSchedule({
    now: () => now,
    lastVerified: previous,
    onChange: async (value) => statuses.push(value),
    run: async () => {
      if (fail) throw Error("private token and student name");
    },
  });
  await schedule.tick();
  assert.equal(schedule.snapshot().lastVerified, previous);
  assert.equal(schedule.snapshot().retryAt, now + RETRY_MS);
  assert.equal(JSON.stringify(statuses).includes("private"), false);
  now += RETRY_MS - 1;
  assert.equal(await schedule.tick(), false);
  now++;
  fail = false;
  await schedule.tick();
  assert.equal(schedule.snapshot().retryAt, null);
  assert.equal(schedule.snapshot().lastVerified, now);
});
test("ownership requires matching valid PID and nonce; reject malformed env/retention", () => {
  const owner = { pid: 123, nonce: "a".repeat(32) };
  assert.ok(validLock(owner));
  assert.ok(sameLock(owner, { ...owner }));
  assert.equal(sameLock(owner, { ...owner, nonce: "b".repeat(32) }), false);
  assert.equal(sameLock(owner, { ...owner, pid: 124 }), false);
  assert.equal(Boolean(validLock({ pid: -1, nonce: owner.nonce })), false);
  const env = {
    BACKUP_KEY: "a".repeat(64),
    BACKUP_DIR: "fixture",
    DATA_DIR: "fixture",
  };
  assert.deepEqual(validateBackupEnvironment(env), { keepDays: 7 });
  for (const override of [
    { BACKUP_KEY: "wrong" },
    { BACKUP_KEEP_DAYS: "0" },
    { BACKUP_KEEP_DAYS: "31" },
    { DATA_DIR: "" },
  ])
    assert.throws(
      () => validateBackupEnvironment({ ...env, ...override }),
      /INVALID_BACKUP_CONFIGURATION/,
    );
});
test("status publication remains serialized with backup completion", async () => {
  let finishStatus, reachedStatus;
  const reached = new Promise((resolve) => {
    reachedStatus = resolve;
  });
  let calls = 0;
  const schedule = createBackupSchedule({
    run: async () => {
      calls++;
    },
    onChange: async (value) => {
      if (value.stage === "ready") {
        reachedStatus();
        await new Promise((resolve) => {
          finishStatus = resolve;
        });
      }
    },
  });
  const first = schedule.tick();
  await reached;
  assert.equal(await schedule.tick(), false);
  assert.equal(calls, 1);
  finishStatus();
  await first;
  assert.equal(schedule.snapshot().running, false);
});
