import { policy } from "../shared/policy.js";
import { summary, publicStudent, ranked } from "./views.js";

export const adminTabs = [
  "dashboard",
  "students",
  "reviews",
  "pickups",
  "ledger",
  "audit",
  "rewards",
];
export const studentSearchText = (p) =>
  [p.name, p.id, "ม." + p.grade + "/" + p.room, p.grade, p.room]
    .join(" ")
    .toLowerCase();
export async function adminRead(store, { tab, page, query }) {
  if (store.adminRead) return store.adminRead({ tab, page, query });
  const overview = await summary(store);
  const result = {
    ...overview,
    students: [],
    submissions: [],
    redemptions: [],
    ledger: [],
    audit: [],
    hasMore: false,
  };
  const q = query.toLowerCase();
  const kind = {
    reviews: "submissions",
    pickups: "redemptions",
    ledger: "ledger",
    audit: "audit",
    dashboard: "audit",
  }[tab];
  let selected = [];
  if (tab === "students") {
    const matching = overview.students
      .filter((p) => studentSearchText(p).includes(q))
      .sort((a, b) => a.id.localeCompare(b.id));
    result.hasMore = (page + 1) * policy.pageSize < matching.length;
    selected = matching.slice(
      page * policy.pageSize,
      (page + 1) * policy.pageSize,
    );
  } else if (kind) {
    const filter = {
      limit: tab === "dashboard" ? 5 : policy.pageSize + 1,
      offset: tab === "dashboard" ? 0 : page * policy.pageSize,
      ...(query ? { query } : {}),
      ...(tab === "reviews" ? { status: "Pending" } : {}),
      ...(tab === "pickups" ? { status: "Pending Pickup" } : {}),
    };
    if (tab === "pickups" && query)
      filter.queryStudents = overview.students
        .filter((p) => p.name.toLowerCase().includes(q))
        .map((p) => p.id);
    const detail = await store.read({ [kind]: filter });
    result.hasMore =
      tab !== "dashboard" && detail[kind].length > policy.pageSize;
    result[kind] = detail[kind].slice(
      0,
      tab === "dashboard" ? 5 : policy.pageSize,
    );
    const ids = new Set(
      result[kind]
        .flatMap((p) => [
          p.student,
          p.actorRole === "student" ? p.actorId : undefined,
          kind === "audit" ? p.target : undefined,
        ])
        .filter(Boolean),
    );
    selected = overview.students.filter((p) => ids.has(p.id));
  }
  result.students = selected.map((p) => ({
    ...publicStudent(p),
    balance: p.balance,
  }));
  result.rewards = overview.rewards.filter((r) => !r.deletedAt);
  return result;
}
export async function publicOverview(store) {
  if (store.publicOverview) return store.publicOverview();
  const data = await summary(store);
  return {
    ...data,
    students: ranked(data.students).slice(0, 3),
    rewards: data.rewards.filter((r) => r.enabled && !r.deletedAt),
  };
}
export async function rankSearch(
  store,
  { query, grade = "", room = "", monthly = false },
) {
  if (store.rankSearch)
    return store.rankSearch({ query, grade, room, monthly });
  const data = await summary(store);
  return ranked(
    data.students.filter(
      (p) => (!grade || p.grade === grade) && (!room || p.room === room),
    ),
    monthly,
  )
    .map((p, i) => ({ ...p, rank: i + 1 }))
    .filter((p) => query && (p.id === query || p.name.includes(query)))
    .slice(0, 50)
    .map((p) => ({
      name: p.name.split(" ")[0],
      grade: p.grade,
      room: p.room,
      earned: monthly ? p.monthly : p.earned,
      rank: p.rank,
    }));
}

export const leaderboardName = (name) =>
  name.split(" ")[0] + " " + (name.split(" ")[1]?.slice(0, 1) || "") + ".";
export async function leaderboard(
  store,
  { grade = "", room = "", monthly = false },
) {
  if (store.leaderboard) return store.leaderboard({ grade, room, monthly });
  const data = await summary(store);
  return ranked(
    data.students.filter(
      (p) => (!grade || p.grade === grade) && (!room || p.room === room),
    ),
    monthly,
  )
    .slice(0, 10)
    .map((p, i) => ({
      name: leaderboardName(p.name),
      grade: p.grade,
      room: p.room,
      earned: p.earned,
      monthly: p.monthly,
      rank: i + 1,
    }));
}
