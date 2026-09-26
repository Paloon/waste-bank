import { act } from "./store.js";
import { fingerprint, requestResult } from "./state.js";
import { assert } from "./errors.js";
import { normalizeImage } from "./images.js";
import { rewardImages } from "./views.js";
import { verifyAsync } from "./credentials.js";
import { createHash } from "node:crypto";

export async function actionScope(store, actor, body) {
  const { action, payload: p, key } = body;
  const scope = {
    staff: { ids: [actor.id] },
    students: { ids: [actor.id] },
    requests: { ids: [`${actor.role}:${actor.id}:${key}`] },
    audit: { limit: 0 },
  };
  if (["profile", "promote", "deleteStudents"].includes(action))
    scope.students = {};
  if (action === "submit") scope.submissions = { students: [actor.id] };
  if (["cancelSubmission", "review"].includes(action))
    scope.submissions = { ids: [p.id] };
  if (["handover", "cancelReward"].includes(action))
    scope.redemptions = { ids: [p.id] };
  if (["redeem", "reward"].includes(action))
    scope.rewards = { ids: p.id ? [p.id] : [] };
  if (action === "redeem") scope.ledger = { students: [actor.id] };
  if (action === "adjust") {
    scope.students = { ids: [p.id] };
    scope.ledger = { students: [p.id] };
  }
  if (["review", "cancelReward"].includes(action)) {
    const kind = action === "review" ? "submissions" : "redemptions";
    const item = (await store.read({ [kind]: { ids: [p.id] } }))[kind][0];
    scope.ledger = { students: item ? [item.student] : [] };
    if (item?.reward) scope.rewards = { ids: [item.reward] };
  }
  if (["reward", "deleteStudents"].includes(action))
    scope.meta = { ids: ["pendingDriveDeletes"] };
  if (action === "promote") scope.meta = { ids: ["promotedYears"] };
  if (action === "deleteStudents")
    Object.assign(scope, {
      submissions: { students: p.ids },
      redemptions: { students: p.ids },
      ledger: { students: p.ids },
      rewards: {},
      audit: {},
      requests: {},
    });
  return scope;
}
export async function performAction(
  store,
  drive,
  actor,
  body,
  { production = false } = {},
) {
  const p = body.payload;
  // PIN changes must not alter a retry fingerprint; never persist a PIN in a receipt.
  const { pin, ...safePayload } = p;
  body.fingerprint = fingerprint({ action: body.action, payload: safePayload });
  const scope = await actionScope(store, actor, body),
    snapshot = await store.read(scope);
  if (body.action === "deleteStudents")
    assert(
      await verifyAsync(
        pin,
        snapshot.staff.find((x) => x.id === actor.id)?.pin,
      ),
      "PIN ไม่ถูกต้อง",
      403,
    );
  delete p.pin;
  const previous = requestResult(snapshot, actor, body);
  if (previous !== undefined) return previous;
  if (body.action === "reward") {
    const existing = snapshot.rewards.find((x) => x.id === p.id),
      old = existing ? rewardImages(existing) : [];
    p.images = (p.images ?? (p.image ? [{ src: p.image }] : [])).map((item) => {
      const index = old.findIndex(
        (_, i) =>
          item.src ===
            `/api/media/reward/${encodeURIComponent(p.id)}?index=${i}` ||
          (i === 0 &&
            item.src === `/api/media/reward/${encodeURIComponent(p.id)}`),
      );
      const src = index >= 0 ? old[index].src : item.src;
      assert(
        !src.startsWith("drive:") || old.some((x) => x.src === src),
        "รูปภาพไม่ถูกต้อง",
      );
      return { ...item, src };
    });
    delete p.image;
  }
  assert(!p.image?.startsWith("drive:"), "รูปภาพไม่ถูกต้อง");
  if (p.image?.startsWith("data:"))
    p.digest = createHash("sha256").update(p.image).digest("hex");
  act(structuredClone(snapshot), actor, body); // Reject invalid/unauthorized work before image decoding or uploads.
  if (p.image?.startsWith("data:")) {
    p.image = await normalizeImage(p.image);
  }
  if (body.action === "reward")
    for (const item of p.images)
      if (item.src.startsWith("data:"))
        item.src = await normalizeImage(item.src);
  const pictures =
    body.action === "submit"
      ? [
          {
            get: () => p.image,
            set: (value) => (p.image = value),
            kind: "evidence",
          },
        ]
      : body.action === "reward"
        ? p.images.map((item) => ({
            get: () => item.src,
            set: (value) => (item.src = value),
            kind: "rewards",
          }))
        : [];
  for (const picture of pictures)
    if (picture.get().startsWith("data:")) {
      assert(
        !production || drive.configured,
        "กรุณาตั้งค่า Google Drive ก่อนรับรูปจริง",
        503,
      );
      if (!drive.configured) continue;
      assert(
        await drive.connected(),
        "กรุณาให้เจ้าหน้าที่เชื่อม Google Drive ก่อน",
      );
      const id = await drive.allocateId();
      // Persist the file ID BEFORE uploading. An ambiguous upload/commit never triggers immediate deletion.
      await store.transact(
        (s) => {
          s.mediaJobs.push({
            id,
            kind: "upload",
            at: new Date().toISOString(),
          });
        },
        { mediaJobs: { ids: [id] } },
      );
      await drive.upload(
        picture.kind,
        picture.get(),
        `${picture.kind}-${id}.jpg`,
        id,
      );
      picture.set(`drive:${id}`);
    }
  return store.transact(
    (s) => {
      const result = act(s, actor, body);
      if (body.action === "review" && p.status === "Approved") {
        const item = s.submissions.find((x) => x.id === p.id);
        if (item?.image?.startsWith("drive:")) {
          const id = item.image.slice(6);
          if (!s.mediaJobs.some((x) => x.id === id))
            s.mediaJobs.push({
              id,
              kind: "move",
              at: new Date().toISOString(),
            });
        }
      }
      return result;
    },
    { ...scope, mediaJobs: { limit: 0 } },
  );
}
