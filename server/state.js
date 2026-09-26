import { createHash } from "node:crypto";
import { policy } from "../shared/policy.js";
import { assert } from "./errors.js";
import { schoolMonth } from "../shared/time.js";

export const collections = [
  "students",
  "staff",
  "rewards",
  "submissions",
  "redemptions",
  "ledger",
  "audit",
  "mediaJobs",
];
export function emptyState() {
  return {
    ...Object.fromEntries(collections.map((k) => [k, []])),
    requests: {},
    promotedYears: [],
    pendingDriveDeletes: [],
  };
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const fingerprint = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export const promotionVersion = (s) =>
  fingerprint(
    s.students
      .map(({ id, grade, room, number, status }) => ({
        id,
        grade,
        room,
        number,
        status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
export const schoolYear = () =>
  Number(process.env.SCHOOL_YEAR) ||
  Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
    }).format(new Date()),
  );
export const rewardVersion = (r) => r.version || 0;
export function requestResult(s, actor, body) {
  const entry = s.requests?.[`${actor.role}:${actor.id}:${body.key}`];
  if (!entry) return undefined;
  // Legacy receipts have no fingerprint: reject rather than silently replay a different action.
  assert(
    entry.fingerprint &&
      entry.fingerprint ===
        (body.fingerprint ||
          fingerprint({ action: body.action, payload: body.payload || {} })),
    "คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาเริ่มรายการใหม่",
    409,
  );
  return entry.result;
}
export function pruneReceipts(s, at = Date.now()) {
  for (const [key, value] of Object.entries(s.requests || {})) {
    // API accepts at most five minutes of future client clock skew. Keep receipts
    // through that grace period so a still-valid key can never be charged twice.
    if (
      !value.at ||
      at - Date.parse(value.at) > policy.requestDays * 86400000 + 300000
    )
      delete s.requests[key];
  }
}
export function totals(s) {
  const values = new Map(
    s.students.map((x) => [x.id, { balance: 0, earned: 0, monthly: 0 }]),
  );
  const month = schoolMonth(Date.now());
  for (const x of s.ledger) {
    const total = values.get(x.student);
    if (!total) continue;
    total.balance += x.amount;
    if (["recycle", "adjustment", "opening"].includes(x.type)) {
      total.earned += x.amount;
      if (schoolMonth(x.at) === month) total.monthly += x.amount;
    }
  }
  return values;
}
// Only loaded records participate in a delta. Unloaded history is never deleted.
export function records(s) {
  const rows = [];
  for (const kind of collections)
    for (const item of s[kind] || [])
      rows.push({ kind, id: item.id, data: item });
  for (const [id, data] of Object.entries(s.requests || {}))
    rows.push({ kind: "requests", id, data });
  for (const id of ["promotedYears", "pendingDriveDeletes"])
    if (id in s) rows.push({ kind: "meta", id, data: s[id] });
  return rows;
}
export function delta(before, after) {
  const old = new Map(records(before).map((r) => [`${r.kind}:${r.id}`, r]));
  const upserts = [];
  for (const row of records(after)) {
    const key = `${row.kind}:${row.id}`,
      prior = old.get(key);
    if (JSON.stringify(prior?.data) !== JSON.stringify(row.data))
      upserts.push(row);
    old.delete(key);
  }
  return {
    upserts,
    deletes: [...old.values()].map(({ kind, id }) => ({ kind, id })),
  };
}
export function selectState(state, scope) {
  if (!scope) return structuredClone(state);
  const result = {};
  for (const [kind, filter] of Object.entries(scope)) {
    if (kind === "meta") {
      for (const id of filter.ids || ["promotedYears", "pendingDriveDeletes"])
        result[id] = structuredClone(state[id] || []);
      continue;
    }
    let rows =
      kind === "requests"
        ? Object.entries(state.requests || {}).map(([id, data]) => ({
            id,
            ...data,
          }))
        : state[kind] || [];
    if (filter.ids) rows = rows.filter((r) => filter.ids.includes(r.id));
    if (filter.students)
      rows = rows.filter((r) => filter.students.includes(r.student));
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.query)
      rows = rows.filter(
        (r) =>
          JSON.stringify(r)
            .toLowerCase()
            .includes(filter.query.toLowerCase()) ||
          filter.queryStudents?.includes(r.student),
      );
    if (filter.limit !== undefined)
      rows = [...rows]
        .sort(
          (a, b) =>
            (b.at || "").localeCompare(a.at || "") || a.id.localeCompare(b.id),
        )
        .slice(filter.offset || 0, (filter.offset || 0) + filter.limit);
    result[kind] =
      kind === "requests"
        ? Object.fromEntries(rows.map(({ id, ...data }) => [id, data]))
        : structuredClone(rows);
  }
  return result;
}
