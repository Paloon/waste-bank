import { policy } from "../shared/policy.js";
import { totals } from "./state.js";
export async function summary(store) {
  if (store.summary) return store.summary();
  const s = await store.read(),
    scores = totals(s),
    date = (x) =>
      new Date(x).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
    today = date(Date.now());
  return {
    students: s.students.map((p) => ({ ...p, ...scores.get(p.id) })),
    rewards: s.rewards,
    counts: Object.fromEntries(
      Object.entries(s)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length]),
    ),
    stats: {
      pending: s.submissions.filter((x) => x.status === "Pending").length,
      pickups: s.redemptions.filter((x) => x.status === "Pending Pickup")
        .length,
      weight: s.submissions
        .filter((x) => x.status === "Approved")
        .reduce((n, x) => n + (x.weight || 0), 0),
      coins: s.ledger
        .filter((x) => x.type === "recycle")
        .reduce((n, x) => n + x.amount, 0),
      students: s.students.filter((x) => x.status === "Active").length,
      submissions: s.submissions.filter((x) => x.status === "Approved").length,
      approvedToday: s.submissions.filter(
        (x) => x.status === "Approved" && date(x.reviewedAt || x.at) === today,
      ).length,
      coinsToday: s.ledger
        .filter((x) => x.type === "recycle" && date(x.at) === today)
        .reduce((n, x) => n + x.amount, 0),
      categories: s.submissions
        .filter((x) => x.status === "Approved")
        .reduce(
          (acc, x) => ((acc[x.category] = (acc[x.category] || 0) + 1), acc),
          {},
        ),
    },
  };
}
export const publicStudent = (p) => ({
  id: p.id,
  name: p.name,
  number: p.number,
  grade: p.grade,
  room: p.room,
  status: p.status,
});
export const rewardImages = (r) =>
  r.images?.length
    ? r.images
    : r.image
      ? [{ src: r.image, zoom: 1, x: 0, y: 0 }]
      : [];
export const rewardView = (r) => {
  const images = rewardImages(r).map((item, index) => ({
    ...item,
    src: item.src?.startsWith("drive:")
      ? `/api/media/reward/${encodeURIComponent(r.id)}?index=${index}`
      : item.src,
  }));
  return { ...r, version: r.version || 0, image: images[0]?.src || "", images };
};
export const submissionView = ({ evidenceDeletionPending, ...s }) => ({
  ...s,
  evidenceDeletionPendingCount: evidenceDeletionPending?.length || 0,
  disposalImage: s.disposalImage?.startsWith("drive:")
    ? `/api/media/submission/${encodeURIComponent(s.id)}?index=1`
    : s.disposalImage,
  image: s.image?.startsWith("drive:")
    ? `/api/media/submission/${encodeURIComponent(s.id)}`
    : s.image,
});
export const ranked = (students, monthly = false) =>
  students
    .filter((x) => x.status === "Active")
    .sort(
      (a, b) =>
        (monthly ? b.monthly - a.monthly : b.earned - a.earned) ||
        a.id.localeCompare(b.id),
    );

export async function studentHistory(store, id, options) {
  if (store.studentHistory) return store.studentHistory(id, options);
  const { page, submissionPage, submissionStatus } = options;
  const s = await summary(store),
    student = s.students.find((p) => p.id === id);
  if (!student) return { student: null };
  const scope = {
    students: [id],
    limit: policy.pageSize + 1,
    offset: page * policy.pageSize,
  };
  const history = await store.read({
    ledger: scope,
    redemptions: scope,
    submissions: { students: [id] },
  });
  const all = [...history.submissions].sort(
    (a, b) =>
      (b.at || "").localeCompare(a.at || "") || a.id.localeCompare(b.id),
  );
  const counts = Object.fromEntries(
    ["Pending", "Approved", "Rejected", "Cancelled"].map((status) => [
      status,
      all.filter((x) => x.status === status).length,
    ]),
  );
  return {
    ...history,
    student,
    rank: ranked(s.students).findIndex((p) => p.id === id) + 1,
    submissionStatusCounts: { All: all.length, ...counts },
    submissions: all
      .filter((x) => !submissionStatus || x.status === submissionStatus)
      .slice(
        submissionPage * policy.pageSize,
        submissionPage * policy.pageSize + policy.pageSize + 1,
      ),
  };
}
