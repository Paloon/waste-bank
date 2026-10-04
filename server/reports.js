import { assert } from "./errors.js";
import { schoolDate } from "../shared/time.js";
import { policy } from "../shared/policy.js";

export const reportFields = {
  students: ["id", "name", "grade", "room"],
  submissions: [
    "id",
    "student",
    "at",
    "category",
    "status",
    "weight",
    "coins",
    "reviewedAt",
    "cancelledAt",
  ],
  redemptions: [
    "id",
    "student",
    "at",
    "reward",
    "name",
    "cost",
    "status",
    "completedAt",
    "cancelledAt",
  ],
  ledger: ["id", "student", "at", "type", "amount", "related", "reason"],
  audit: ["id", "at", "staff", "action", "target"],
};
export const reportLimit = 20000;
const dayMs = 86400000;
export function reportRange(from, to) {
  const valid = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  assert(valid(from) && valid(to), "เลือกวันเริ่มและวันสิ้นสุดให้ถูกต้อง");
  assert(from <= to, "วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม");
  assert(
    (Date.parse(to) - Date.parse(from)) / dayMs < 366,
    "เลือกช่วงเวลาไม่เกิน 366 วันต่อครั้ง",
  );
  const start = new Date(from + "T00:00:00+07:00").toISOString();
  const end = new Date(
    Date.parse(to + "T00:00:00+07:00") + dayMs,
  ).toISOString();
  return { from, to, start, end };
}
const within = (at, range) =>
  Number.isFinite(Date.parse(at)) &&
  Date.parse(at) >= Date.parse(range.start) &&
  Date.parse(at) < Date.parse(range.end);
export function selectReportSource(source, range) {
  const ledger = source.ledger.filter((x) => within(x.at, range));
  const refunds = new Set(
    ledger.filter((x) => x.type === "refund").map((x) => x.related),
  );
  const recycled = new Set(
    ledger.filter((x) => x.type === "recycle").map((x) => x.related),
  );
  const selected = {
    students: source.students,
    ledger,
    submissions: source.submissions.filter(
      (x) =>
        [x.at, x.reviewedAt, x.cancelledAt].some((at) => within(at, range)) ||
        recycled.has(x.id),
    ),
    redemptions: source.redemptions.filter(
      (x) =>
        [x.at, x.completedAt, x.cancelledAt].some((at) => within(at, range)) ||
        refunds.has(x.id),
    ),
    audit: source.audit.filter(
      (x) =>
        ["login", "register"].includes(x.action) &&
        within(x.at, range) &&
        /^นักเรียน \d{5,10}$/.test(x.staff),
    ),
  };
  return Object.fromEntries(
    Object.entries(selected).map(([kind, rows]) => [
      kind,
      rows.map((x) =>
        Object.fromEntries(
          reportFields[kind]
            .filter((k) => x[k] !== undefined)
            .map((k) => [k, x[k]]),
        ),
      ),
    ]),
  );
}
const blank = () => ({
  submitted: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  weight: 0,
  issued: 0,
  adjustmentPlus: 0,
  adjustmentMinus: 0,
  spent: 0,
  refunded: 0,
  opening: 0,
  redeemed: 0,
  pendingRewards: 0,
  completed: 0,
  rewardCancelled: 0,
  logins: 0,
  submitters: new Set(),
  approvers: new Set(),
  redeemers: new Set(),
  collectors: new Set(),
  visitors: new Set(),
});
const cleanMetrics = (m) =>
  Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, v instanceof Set ? v.size : v]),
  );
const labels = {
  submitted: "ส่งขยะ",
  approved: "อนุมัติขยะ",
  rejected: "ไม่อนุมัติขยะ",
  cancelled: "ยกเลิกส่งขยะ",
  issued: "Coins จากขยะ",
  adjustmentPlus: "เจ้าหน้าที่เพิ่ม Coins",
  adjustmentMinus: "เจ้าหน้าที่ลด Coins",
  spent: "ใช้ Coins แลกรางวัล",
  refunded: "คืน Coins",
  opening: "ยอดยกมา",
  redeemed: "แลกรางวัล",
  completed: "รับรางวัลแล้ว",
  rewardCancelled: "ยกเลิกรางวัล",
  logins: "เข้าสู่ระบบ/สมัครสมาชิก",
};

export function buildReport(
  source,
  range,
  { group = "overview", day = "", page = 0 } = {},
) {
  if (day) reportRange(day, day);
  assert(
    ["overview", "waste", "coins", "students", "rewards"].includes(group),
    "หมวดรายงานไม่ถูกต้อง",
  );
  assert(
    !day ||
      (day >= range.from && day <= range.to && /^\d{4}-\d{2}-\d{2}$/.test(day)),
    "วันที่รายละเอียดอยู่นอกช่วงรายงาน",
  );
  assert(
    Number.isSafeInteger(page) && page >= 0 && page <= 100000,
    "หน้ารายงานไม่ถูกต้อง",
  );
  assert(
    Object.values(source).reduce((n, rows) => n + rows.length, 0) <=
      reportLimit,
    "ข้อมูลช่วงนี้มากเกินไป กรุณาเลือกช่วงวันที่สั้นลง",
    422,
  );
  const total = blank(),
    daily = new Map(),
    students = new Map(),
    categories = new Map(),
    rewards = new Map(),
    events = [];
  const profiles = new Map(source.students.map((p) => [p.id, p]));
  for (let t = Date.parse(range.from); t <= Date.parse(range.to); t += dayMs)
    daily.set(new Date(t).toISOString().slice(0, 10), blank());
  const studentRow = (id) => {
    if (!students.has(id))
      students.set(id, {
        ...blank(),
        id,
        name: profiles.get(id)?.name || "ไม่พบข้อมูลนักเรียน",
        grade: profiles.get(id)?.grade,
        room: profiles.get(id)?.room,
      });
    return students.get(id);
  };
  const add = (at, kind, student, extra = {}) => {
    if (!within(at, range)) return;
    const date = schoolDate(at),
      person = studentRow(student);
    const rows = [total, daily.get(date), person];
    for (const row of rows) {
      row[kind] += extra.amount ?? 1;
      if (kind === "approved") row.weight += Number(extra.weight || 0);
      const set = {
        submitted: "submitters",
        approved: "approvers",
        redeemed: "redeemers",
        completed: "collectors",
        logins: "visitors",
      }[kind];
      if (set) row[set].add(student);
    }
    events.push({
      at,
      day: date,
      kind,
      label: labels[kind],
      student,
      studentName: person.name,
      ...extra,
    });
  };
  let unknownReviewDates = 0;
  const cohort = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
  for (const s of source.submissions) {
    if (!categories.has(s.category))
      categories.set(s.category, {
        category: s.category,
        submitted: 0,
        approved: 0,
        weight: 0,
        coins: 0,
      });
    const category = categories.get(s.category);
    if (within(s.at, range)) {
      category.submitted++;
      cohort[s.status] = (cohort[s.status] || 0) + 1;
    }
    add(s.at, "submitted", s.student, {
      category: s.category,
      status: s.status,
    });
    if (["Approved", "Rejected"].includes(s.status)) {
      if (!s.reviewedAt && within(s.at, range)) unknownReviewDates++;
      add(
        s.reviewedAt,
        s.status === "Approved" ? "approved" : "rejected",
        s.student,
        { category: s.category, weight: Number(s.weight || 0) },
      );
      if (s.status === "Approved" && within(s.reviewedAt, range)) {
        category.approved++;
        category.weight += Number(s.weight || 0);
      }
    }
    if (s.status === "Cancelled")
      add(s.cancelledAt, "cancelled", s.student, { category: s.category });
  }
  const submissionById = new Map(source.submissions.map((s) => [s.id, s]));
  for (const l of source.ledger) {
    const kind =
      {
        recycle: "issued",
        redemption: "spent",
        refund: "refunded",
        opening: "opening",
      }[l.type] ||
      (l.type === "adjustment"
        ? l.amount > 0
          ? "adjustmentPlus"
          : "adjustmentMinus"
        : null);
    if (!kind) continue;
    add(l.at, kind, l.student, {
      amount: Math.abs(l.amount),
      reason: l.reason,
    });
    const s = submissionById.get(l.related);
    if (l.type === "recycle" && s && within(l.at, range))
      categories.get(s.category).coins += l.amount;
  }
  const refundDates = new Map(
    source.ledger
      .filter((l) => l.type === "refund")
      .map((l) => [l.related, l.at]),
  );
  for (const r of source.redemptions) {
    if (!rewards.has(r.reward))
      rewards.set(r.reward, {
        id: r.reward,
        name: r.name,
        redeemed: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
      });
    const reward = rewards.get(r.reward);
    if (within(r.at, range)) {
      reward.redeemed++;
      if (r.status === "Pending Pickup") {
        reward.pending++;
        total.pendingRewards++;
        daily.get(schoolDate(r.at)).pendingRewards++;
      }
    }
    add(r.at, "redeemed", r.student, { reward: r.name, status: r.status });
    if (r.status === "Completed" && within(r.completedAt, range)) {
      reward.completed++;
      add(r.completedAt, "completed", r.student, { reward: r.name });
    }
    const cancelledAt = r.cancelledAt || refundDates.get(r.id);
    if (r.status === "Cancelled" && within(cancelledAt, range)) {
      reward.cancelled++;
      add(cancelledAt, "rewardCancelled", r.student, { reward: r.name });
    }
  }
  for (const a of source.audit) {
    const id = /^นักเรียน (\d{5,10})$/.exec(a.staff)?.[1];
    if (id && ["login", "register"].includes(a.action)) add(a.at, "logins", id);
  }
  // Events and people are paginated after aggregation, so totals never depend on the current page.
  events.sort(
    (a, b) =>
      Date.parse(b.at) - Date.parse(a.at) ||
      a.student.localeCompare(b.student) ||
      a.kind.localeCompare(b.kind),
  );
  const kinds = {
    waste: ["submitted", "approved", "rejected", "cancelled"],
    coins: [
      "issued",
      "spent",
      "refunded",
      "opening",
      "adjustmentPlus",
      "adjustmentMinus",
    ],
    rewards: ["redeemed", "completed", "rewardCancelled"],
  };
  const matches = events.filter(
    (e) =>
      (!day || e.day === day) &&
      (!kinds[group] || kinds[group].includes(e.kind)),
  );
  let people = [...students.values()].map(cleanMetrics);
  if (group === "students" && day) {
    const selected = new Map();
    for (const e of events.filter((e) => e.day === day)) {
      if (!selected.has(e.student))
        selected.set(e.student, {
          ...blank(),
          ...profiles.get(e.student),
          id: e.student,
          name: e.studentName,
        });
      const row = selected.get(e.student);
      row[e.kind] += e.amount ?? 1;
      if (e.kind === "approved") row.weight += e.weight || 0;
    }
    people = [...selected.values()].map(cleanMetrics);
  }
  people.sort((a, b) => a.id.localeCompare(b.id));
  const rows = group === "students" ? people : matches;
  return {
    range: { from: range.from, to: range.to },
    generatedAt: new Date().toISOString(),
    group,
    day,
    page,
    totals: cleanMetrics(total),
    cohort,
    categories: [...categories.values()],
    rewards: [...rewards.values()],
    daily: [...daily]
      .map(([date, metrics]) => ({ date, ...cleanMetrics(metrics) }))
      .reverse(),
    rows: rows.slice(page * policy.pageSize, (page + 1) * policy.pageSize),
    rowCount: rows.length,
    hasMore: (page + 1) * policy.pageSize < rows.length,
    coverage: { loginHistoryOnly: true, unknownReviewDates },
  };
}
