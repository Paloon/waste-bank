import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { act, registerStudent, studentView } from "../server/domain.js";
import * as compatibility from "../server/store.js";
import { emptyState } from "../server/state.js";
import { policy } from "../shared/policy.js";

const request = (action, payload) => ({ action, payload, key: randomUUID() });
const student = (id, number) => ({
  id,
  name: `Synthetic ${id}`,
  grade: "1",
  room: "1",
  number,
  status: "Active",
});

test("domain functions remain compatible with established store imports", () => {
  assert.equal(compatibility.act, act);
  assert.equal(compatibility.registerStudent, registerStudent);
  assert.equal(compatibility.studentView, studentView);
  const state = emptyState();
  const registered = registerStudent(state, {
    id: "54321",
    name: "Synthetic Student",
    grade: policy.maxGrade,
    room: policy.maxRoom,
    number: policy.maxNumber,
  });
  assert.equal(registered.grade, String(policy.maxGrade));
  assert.equal(registered.room, String(policy.maxRoom));
  assert.equal(registered.number, policy.maxNumber);
  assert.equal("pin" in registered, false);
  assert.equal(state.audit[0].actorId, registered.id);
  assert.equal(state.audit[0].actorRole, "student");
  assert.equal(studentView(state, registered.id).balance, 0);
  for (const [field, value] of [
    ["grade", policy.maxGrade + 1],
    ["room", policy.maxRoom + 1],
    ["number", policy.maxNumber + 1],
  ])
    assert.throws(
      () =>
        registerStudent(emptyState(), {
          id: "54322",
          name: "Synthetic Student",
          grade: 1,
          room: 1,
          number: 1,
          [field]: value,
        }),
      /จำนวนไม่ถูกต้อง/,
    );
});

test("deleting students removes their audit actor identifiers and preserves other identities", () => {
  const state = emptyState();
  state.students = [student("54321", 1), student("54322", 2)];
  state.staff = [{ id: "teacher.synthetic", name: "Synthetic Teacher" }];
  state.ledger = [
    {
      id: "opening",
      student: "54321",
      type: "opening",
      amount: 100,
      at: new Date().toISOString(),
    },
  ];
  state.audit = [
    {
      id: "own-event",
      actorId: "54321",
      actorRole: "student",
      staff: "นักเรียน 54321",
      target: "unrelated-target",
      before: { name: "private" },
      after: { id: "54321" },
      reason: "private",
    },
    {
      id: "staff-event",
      actorId: "teacher.synthetic",
      actorRole: "staff",
      staff: "Synthetic Teacher",
      target: "54321",
      before: { name: "private" },
      after: { id: "54321" },
    },
    {
      id: "other-event",
      actorId: "54322",
      actorRole: "student",
      staff: "นักเรียน 54322",
      target: "untouched",
      after: { ok: true },
    },
    {
      id: "legacy-student-event",
      actorId: "54321",
      staff: "นักเรียน 54321",
      target: "legacy-target",
    },
  ];
  state.requests["student:54321:old-request"] = { result: { ok: true } };
  const otherBefore = structuredClone(state.audit[2]);
  const deletion = request("deleteStudents", { ids: ["54321"], confirm: true });
  act(state, { role: "staff", id: "teacher.synthetic" }, deletion);
  const own = state.audit.find((event) => event.id === "own-event");
  assert.equal(Object.hasOwn(own, "actorId"), false);
  assert.equal(own.staff, "นักเรียนที่ลบบัญชีแล้ว");
  assert.equal(own.target, "deleted-record");
  assert.equal(own.before, null);
  assert.equal(own.after, null);
  assert.equal(own.reason, "ลบข้อมูลส่วนบุคคลแล้ว");
  assert.equal(
    Object.hasOwn(
      state.audit.find((event) => event.id === "legacy-student-event"),
      "actorId",
    ),
    false,
  );
  assert.equal(
    state.audit.find((event) => event.id === "staff-event").actorId,
    "teacher.synthetic",
  );
  assert.deepEqual(
    state.audit.find((event) => event.id === "other-event"),
    otherBefore,
  );
  assert.equal(state.students.length, 1);
  assert.equal(state.ledger.length, 0);
  assert.equal(
    Object.hasOwn(state.requests, "student:54321:old-request"),
    false,
  );
  assert.deepEqual(
    act(state, { role: "staff", id: "teacher.synthetic" }, deletion),
    { deleted: 1, driveFiles: [] },
  );
});
