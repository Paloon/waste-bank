import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seed, act, balance } from "../server/store.js";
import { promotionVersion, schoolYear } from "../server/state.js";
import { normalizeImage } from "../server/images.js";
import sharp from "sharp";
const staff = { role: "staff", id: "teacher.mali" },
  student = { role: "student", id: "65001" };
const request = (action, payload, key = randomUUID()) => ({
  action,
  payload,
  key,
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
