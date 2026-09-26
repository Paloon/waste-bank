import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, act, balance } from "../server/store.js";
import { promotionVersion, schoolYear } from "../server/state.js";
import { normalizeImage } from "../server/images.js";
import sharp from "sharp";
import { actionScope } from "../server/actions.js";
const staff = { role: "staff", id: "teacher.mali" },
  student = { role: "student", id: "65001" };
const request = (action, payload, key = randomUUID()) => ({
  action,
  payload,
  key,
});

test("reward deletion preserves pending pickups and refunds, rejects stale edits and student deletion", async () => {
  const { s } = seed(),
    reward = s.rewards[0],
    before = balance(s, student.id);
  act(s, student, request("redeem", { id: reward.id }));
  const pickup = s.redemptions.at(-1);
  reward.images = [{ src: "drive:tracked-reward-image" }];
  const deletion = request("deleteReward", {
    id: reward.id,
    version: reward.version,
    confirm: true,
  });
  assert.throws(() => act(s, student, deletion));
  assert.throws(
    () =>
      act(
        s,
        staff,
        request("deleteReward", { ...deletion.payload, version: 0 }),
      ),
    /สต็อกเปลี่ยน/,
  );
  const staleForm = structuredClone(reward);
  act(s, staff, deletion);
  act(s, staff, deletion);
  assert.equal(reward.enabled, false);
  assert.ok(reward.deletedAt);
  assert.equal(s.redemptions.at(-1).id, pickup.id);
  assert.deepEqual(s.pendingDriveDeletes, ["tracked-reward-image"]);
  assert.throws(() => act(s, student, request("redeem", { id: reward.id })));
  assert.throws(
    () =>
      act(
        s,
        staff,
        request("reward", { ...staleForm, version: reward.version }),
      ),
    /ถูกลบ/,
  );
  act(
    s,
    staff,
    request("cancelReward", { id: pickup.id, reason: "คืนของที่เลิกจำหน่าย" }),
  );
  assert.equal(balance(s, student.id), before);
  assert.equal(reward.enabled, false);
  const scope = await actionScope(null, staff, deletion);
  assert.deepEqual(scope.rewards, { ids: [reward.id] });
  assert.deepEqual(scope.meta, { ids: ["pendingDriveDeletes"] });
});
test("stale reward forms cannot undo stock reservations or refunds", () => {
  const { s } = seed(),
    r = structuredClone(s.rewards[0]);
  act(s, student, request("redeem", { id: r.id }));
  assert.throws(
    () =>
      act(s, staff, request("reward", { ...r, version: 0, name: "Changed" })),
    /สต็อกเปลี่ยน/,
  );
  assert.equal(s.rewards[0].stock, r.stock - 1);
  const version = s.rewards[0].version;
  act(
    s,
    staff,
    request("cancelReward", {
      id: s.redemptions.at(-1).id,
      reason: "คืนรางวัล",
    }),
  );
  assert.equal(s.rewards[0].version, version + 1);
});
test("idempotency binds keys to payload; same key never charges twice", () => {
  const { s } = seed(),
    key = randomUUID(),
    before = balance(s, student.id),
    r = request("redeem", { id: "r1" }, key);
  const first = act(s, student, r);
  assert.deepEqual(act(s, student, r), first);
  assert.throws(
    () => act(s, student, request("redeem", { id: "r2" }, key)),
    /ข้อมูลอื่น/,
  );
  assert.equal(balance(s, student.id), before - 150);
});
test("promotion rejects empty, incomplete, stale, wrong-year and duplicate-seat plans", () => {
  const { s } = seed();
  const p = {
    year: schoolYear(),
    previewVersion: promotionVersion(s),
    confirm: true,
    students: structuredClone(s.students),
  };
  for (const plan of [
    { ...p, students: [] },
    { ...p, students: p.students.slice(1) },
    { ...p, previewVersion: "0".repeat(64) },
    { ...p, year: schoolYear() + 1 },
  ])
    assert.throws(() =>
      act(structuredClone(s), staff, request("promote", plan)),
    );
  p.students[1] = {
    ...p.students[1],
    grade: p.students[0].grade,
    room: p.students[0].room,
    number: p.students[0].number,
  };
  assert.throws(() => act(s, staff, request("promote", p)), /เลขที่ซ้ำ/);
  assert.deepEqual(s.promotedYears, []);
});
test("server rejects fake images and removes metadata from real images", async () => {
  await assert.rejects(
    normalizeImage("data:image/png;base64,aGVsbG8="),
    /เปิดรูปไม่ได้/,
  );
  const png = await sharp({
    create: { width: 24, height: 24, channels: 3, background: "#ff0000" },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const uri = await normalizeImage(
    "data:image/png;base64," + png.toString("base64"),
  );
  const result = await sharp(
    Buffer.from(uri.split(",")[1], "base64"),
  ).metadata();
  assert.equal(result.format, "jpeg");
  assert.equal(result.exif, undefined);
});
