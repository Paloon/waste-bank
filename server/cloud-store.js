import {
  adminRead,
  publicOverview,
  rankSearch,
  leaderboard,
} from "./read-queries.js";
import { policy } from "../shared/policy.js";
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
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new AppError(
        "ฐานข้อมูลยังไม่พร้อม กรุณาลองอีกครั้งหรือติดต่อเจ้าหน้าที่",
        503,
        "DATABASE_UNAVAILABLE",
      );
      error.databaseCode = payload.code;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name, args = {}) =>
    request("rpc/" + name, { method: "POST", body: JSON.stringify(args) });
  const snapshot = async (scope) => {
    const s = await rpc("wb_snapshot", { scope: scope || null });
    return { ...s, value: { ...emptyState(), ...s.value } };
  };
  async function tailoredRead(name, args, fallback) {
    try {
      return await rpc(name, args);
    } catch (error) {
      if (error.databaseCode !== "PGRST202" && error.databaseCode !== "42883")
        throw error;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = (await snapshot({})).version;
      assert(
        before !== undefined && before !== null,
        "ฐานข้อมูลยังไม่พร้อม กรุณาลองอีกครั้ง",
        503,
      );
      const data = await fallback({
        read: async (scope) => (await snapshot(scope)).value,
        summary: () => rpc("wb_summary"),
      });
      if ((await snapshot({})).version === before) return data;
    }
    throw new AppError(
      "ข้อมูลเปลี่ยนระหว่างอ่าน กรุณาลองใหม่",
      409,
      "HISTORY_CHANGED",
    );
  }
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
    adminRead: (options) =>
      tailoredRead(
        "wb_admin_read",
        {
          selected_tab: options.tab,
          page_number: options.page,
          search_query: options.query,
          page_size: policy.pageSize,
        },
        (store) => adminRead(store, options),
      ),
    publicOverview: () =>
      tailoredRead("wb_public_overview", {}, (store) => publicOverview(store)),
    leaderboard: (options) =>
      tailoredRead(
        "wb_leaderboard",
        {
          selected_grade: options.grade,
          selected_room: options.room,
          monthly: options.monthly,
        },
        (store) => leaderboard(store, options),
      ),
    rankSearch: (options) =>
      tailoredRead(
        "wb_rank_search",
        {
          search_query: options.query,
          selected_grade: options.grade,
          selected_room: options.room,
          monthly: options.monthly,
        },
        (store) => rankSearch(store, options),
      ),
    studentHistory: async (id, { page, submissionPage, submissionStatus }) => {
      try {
        return await rpc("wb_student_history", {
          student_id: id,
          wallet_page: page,
          submission_page: submissionPage,
          submission_status: submissionStatus,
          page_size: policy.pageSize,
        });
      } catch (error) {
        if (error.databaseCode !== "PGRST202" && error.databaseCode !== "42883")
          throw error;
      }
      // Compatibility with deployed schema v2: count projected statuses in bounded
      // batches, never fetch evidence from the student's entire history.
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = (await snapshot({})).version;
        assert(
          before !== undefined && before !== null,
          "ฐานข้อมูลยังไม่พร้อม กรุณาลองอีกครั้ง",
          503,
        );
        const overview = await rpc("wb_summary");
        const student = overview.students.find((x) => x.id === id);
        if (!student) {
          if ((await snapshot({})).version === before) return { student: null };
          continue;
        }
        const submissionStatusCounts = {
          All: 0,
          Pending: 0,
          Approved: 0,
          Rejected: 0,
          Cancelled: 0,
        };
        const params = new URLSearchParams({
          kind: "eq.submissions",
          student: "eq." + id,
          select: "status",
          order: "id.asc",
          limit: "500",
        });
        for (let offset = 0; ;) {
          params.set("offset", String(offset));
          const batch = await request("waste_bank_records?" + params);
          for (const row of batch) {
            submissionStatusCounts.All++;
            if (Object.hasOwn(submissionStatusCounts, row.status))
              submissionStatusCounts[row.status]++;
          }
          if (!batch.length) break;
          offset += batch.length;
        }
        const wallet = {
          students: [id],
          limit: policy.pageSize + 1,
          offset: page * policy.pageSize,
        };
        const history = (
          await snapshot({
            ledger: wallet,
            redemptions: wallet,
            submissions: {
              students: [id],
              limit: policy.pageSize + 1,
              offset: submissionPage * policy.pageSize,
              ...(submissionStatus ? { status: submissionStatus } : {}),
            },
          })
        ).value;
        if ((await snapshot({})).version !== before) continue;
        const active = overview.students
          .filter((x) => x.status === "Active")
          .sort((a, b) => b.earned - a.earned || a.id.localeCompare(b.id));
        return {
          ...history,
          student,
          submissionStatusCounts,
          rank: active.findIndex((x) => x.id === id) + 1,
        };
      }
      throw new AppError(
        "ข้อมูลเปลี่ยนระหว่างอ่าน กรุณาลองใหม่",
        409,
        "HISTORY_CHANGED",
      );
    },
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
