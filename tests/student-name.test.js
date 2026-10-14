import test from "node:test";
import assert from "node:assert/strict";
import { studentName, studentTitles } from "../shared/student-name.js";
import { registerStudent } from "../server/domain.js";
import { emptyState } from "../server/state.js";

test("all four titles are persisted in the existing name with no separate title field", () => {
  for (const title of studentTitles) {
    const student = registerStudent(emptyState(), {
      id: "54321",
      name: studentName(title, "  สมชาย ใจดี  "),
      number: 1,
      grade: 1,
      room: 1,
    });
    assert.equal(student.name, title + "สมชาย ใจดี");
    assert.equal("title" in student, false);
  }
});
test("combined name accepts 80 characters and rejects overflow without truncating", () => {
  assert.equal(
    studentName("เด็กหญิง", "ก".repeat(80 - "เด็กหญิง".length)).length,
    80,
  );
  assert.throws(
    () => studentName("เด็กหญิง", "ก".repeat(81 - "เด็กหญิง".length)),
    /80/,
  );
  assert.throws(() => studentName("นาง", "สมชาย ใจดี"), /คำนำหน้า/);
  assert.throws(() => studentName("นาย", "  "), /ชื่อ/);
});
