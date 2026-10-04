import { emptyState, delta, records } from "./state.js";
import { AppError, assert } from "./errors.js";
import { reportFields, reportLimit } from "./reports.js";
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
  async function reportRows(kind, range, { ids } = {}) {
    const fields = reportFields[kind];
    const params = new URLSearchParams({
      kind: "eq." + kind,
      select: fields.map((f) => f + ":data->" + f).join(","),
      order: "id.asc",
      limit: "500",
    });
    if (ids) params.set("id", "in.(" + ids.join(",") + ")");
    else if (kind !== "students") {
      const dates = {
        submissions: ["at", "reviewedAt", "cancelledAt"],
        redemptions: ["at", "completedAt", "cancelledAt"],
        ledger: ["at"],
        audit: ["at"],
      }[kind];
      params.set(
        "or",
        "(" +
          dates
            .map((f) => {
              const field = f === "at" ? "at" : "data->>" + f;
              return `and(${field}.gte.${range.start},${field}.lt.${range.end})`;
            })
            .join(",") +
          ")",
      );
      if (kind === "audit") {
        params.set("data->>action", "in.(login,register)");
        params.set("data->>staff", "like.นักเรียน *");
      }
    }
    const rows = [];
    for (let offset = 0; ;) {
      params.set("offset", String(offset));
      const batch = await request("waste_bank_records?" + params);
      rows.push(...batch);
      assert(
        rows.length <= reportLimit,
        "ข้อมูลช่วงนี้มากเกินไป กรุณาเลือกช่วงวันที่สั้นลง",
        422,
      );
      if (!batch.length) return rows;
      offset += batch.length;
    }
  }
  async function relatedReportRows(kind, rows, ids, range) {
    const existing = new Set(rows.map((x) => x.id));
    const missing = [...new Set(ids)].filter(
      (id) => id && !existing.has(id) && /^[A-Za-z0-9_-]+$/.test(id),
    );
    for (let i = 0; i < missing.length; i += 100)
      rows.push(
        ...(await reportRows(kind, range, { ids: missing.slice(i, i + 100) })),
      );
  }
  return {
    read: async (scope) => (await snapshot(scope)).value,
    summary: () => rpc("wb_summary"),
    async reportSource(range) {
      // A version check prevents totals assembled from different concurrent snapshots.
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = (await snapshot({})).version;
        const entries = await Promise.all(
          Object.keys(reportFields).map(async (kind) => [
            kind,
            await reportRows(kind, range),
          ]),
        );
        const source = Object.fromEntries(entries);
        await relatedReportRows(
          "submissions",
          source.submissions,
          source.ledger
            .filter((x) => x.type === "recycle")
            .map((x) => x.related),
          range,
        );
        await relatedReportRows(
          "redemptions",
          source.redemptions,
          source.ledger
            .filter((x) => x.type === "refund")
            .map((x) => x.related),
          range,
        );
        if ((await snapshot({})).version === before) return source;
      }
      throw new AppError("ข้อมูลเปลี่ยนระหว่างสร้างรายงาน กรุณาลองใหม่", 409);
    },
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
