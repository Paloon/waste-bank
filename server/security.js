import { randomBytes, createHash } from "node:crypto";
import { policy } from "../shared/policy.js";
import { AppError, assert } from "./errors.js";
const digest = (x) => createHash("sha256").update(x).digest("hex");
export function createSecurity(
  store,
  { secure = false, clock = Date.now } = {},
) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
  };
  const cookie = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("eco_session="))
      ?.slice(12);
  const key = (req) => {
    const token = cookie(req);
    return /^[a-f0-9]{64}$/.test(token || "")
      ? `session:${digest(token)}`
      : null;
  };
  async function actor(
    req,
    { touch = false, required = true, staff = false } = {},
  ) {
    const id = key(req);
    const session = id
      ? await store.control(touch ? "touch" : "get", {
          id,
          idle: policy.idleMs,
        })
      : null;
    let result = null;
    if (session && session.absolute > clock()) {
      const kind = session.role === "staff" ? "staff" : "students";
      const state = await store.read({ [kind]: { ids: [session.id] } });
      const account = state[kind][0];
      if (
        account &&
        (kind === "staff"
          ? account.enabled !== false &&
            (account.authVersion || 0) === session.authVersion
          : account.status === "Active")
      )
        result = {
          role: session.role,
          id: session.id,
          name: account.name,
          sessionKey: id,
        };
    }
    if (!result && id) await store.control("delete", { id });
    if (required && !result)
      throw new AppError(
        "หมดเวลาใช้งาน กรุณาระบุตัวตนใหม่",
        401,
        "SESSION_EXPIRED",
      );
    if (staff && result?.role !== "staff")
      throw new AppError("กรุณาเข้าสู่ระบบเจ้าหน้าที่", 403, "FORBIDDEN");
    return result;
  }
  async function logout(req, res) {
    const id = key(req);
    if (id) await store.control("delete", { id });
    res.clearCookie("eco_session", cookieOptions);
  }
  async function login(req, res, account) {
    await logout(req, res);
    const token = randomBytes(32).toString("hex"),
      now = clock();
    await store.control("put", {
      id: `session:${digest(token)}`,
      value: {
        role: account.role,
        id: account.id,
        authVersion: account.authVersion || 0,
        created: now,
        expires: now + policy.idleMs,
        absolute: now + policy.absoluteMs,
      },
    });
    res.cookie("eco_session", token, {
      ...cookieOptions,
      maxAge: policy.absoluteMs,
    });
  }
  async function limit(
    req,
    kind,
    { account, limit = 60, window = 60_000 } = {},
  ) {
    const buckets = [
      { id: `rate:${kind}:ip:${digest(req.ip || "unknown")}`, limit },
    ];
    if (account)
      buckets.push({
        id: `rate:${kind}:account:${digest(account)}`,
        limit: kind === "login" ? 10 : limit,
      });
    for (const bucket of buckets) {
      const result = await store.control("rate", { ...bucket, window });
      if (!result.allowed) {
        const e = new AppError(
          `ลองหลายครั้งเกินไป กรุณารอ ${result.retryAfter} วินาที`,
          429,
          "RATE_LIMIT",
        );
        e.retryAfter = result.retryAfter;
        throw e;
      }
    }
  }
  return { actor, login, logout, limit, key };
}
