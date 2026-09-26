import { emptyState, delta, records } from "./state.js";
import { AppError, assert } from "./errors.js";
export function createCloudStore({
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY,
  fetcher = fetch,
} = {}) {
  if (!url || !key)
    throw new Error(
      "ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ก่อนเปิดเว็บ",
    );
  const base = url.replace(/\/$/, "") + "/rest/v1/";
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetcher(base + path, {
        ...options,
        signal: AbortSignal.timeout(15_000),
        headers: {
          apikey: key,
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
    } catch {
      throw new AppError(
        "ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองรายการเดิมอีกครั้ง",
        503,
        "COMMIT_UNKNOWN",
      );
    }
    if (!response.ok)
      throw new AppError(
        "ฐานข้อมูลยังไม่พร้อม กรุณาลองอีกครั้งหรือติดต่อเจ้าหน้าที่",
        503,
        "DATABASE_UNAVAILABLE",
      );
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name, args = {}) =>
    request("rpc/" + name, { method: "POST", body: JSON.stringify(args) });
  const snapshot = async (scope) => {
    const s = await rpc("wb_snapshot", { scope: scope || null });
    return { ...s, value: { ...emptyState(), ...s.value } };
  };
  return {
    read: async (scope) => (await snapshot(scope)).value,
    summary: () => rpc("wb_summary"),
    initialized: async () =>
      Boolean((await request("waste_bank_state?id=eq.1&select=id")).length),
    async initialize(value) {
      return rpc("wb_initialize", { initial_rows: records(value) });
    },
    async transact(fn, scope) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { version, value } = await snapshot(scope),
          next = structuredClone(value),
          result = fn(next);
        assert(!result?.then, "Transaction callback must be synchronous");
        const changes = delta(value, next);
        if (!changes.upserts.length && !changes.deletes.length) return result;
        if (
          (await rpc("wb_commit", { expected_version: version, changes })) ===
          true
        )
          return result;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            10 + Math.random() * Math.min(200, 20 * 2 ** attempt),
          ),
        );
      }
      throw new AppError(
        "มีการบันทึกพร้อมกันมาก กรุณาลองรายการเดิมอีกครั้ง",
        409,
        "CONCURRENT_CHANGE",
      );
    },
    control: (op, args = {}) => rpc("wb_control", { op, args }),
    refreshDriveToken: (expected, value) =>
      rpc("wb_refresh_drive", {
        expected_refresh: expected,
        next_value: value,
      }),
    async getSecret(name) {
      const rows = await request(
        `waste_bank_secrets?name=eq.${encodeURIComponent(name)}&select=value`,
      );
      return rows[0]?.value || null;
    },
    setSecret: (name, value) =>
      request("waste_bank_secrets?on_conflict=name", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ name, value }),
      }),
  };
}
