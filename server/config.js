// Fail closed on mistyped retention values instead of silently deleting too early.
export function validateConfig(env = process.env) {
  for (const name of [
    "RETENTION_DAYS",
    "PENDING_RETENTION_DAYS",
    "APPROVED_RETENTION_DAYS",
    "AUDIT_RETENTION_DAYS",
  ])
    if (env[name]) {
      const n = Number(env[name]);
      if (!Number.isInteger(n) || n < 1 || n > 3650)
        throw Error(`${name} must be an integer from 1 to 3650`);
    }
  if (
    env.SCHOOL_YEAR &&
    (!Number.isInteger(Number(env.SCHOOL_YEAR)) ||
      Number(env.SCHOOL_YEAR) < 2000 ||
      Number(env.SCHOOL_YEAR) > 2200)
  )
    throw Error("SCHOOL_YEAR must be a Gregorian year from 2000 to 2200");
}
