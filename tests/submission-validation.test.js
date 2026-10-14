import test from "node:test";
import assert from "node:assert/strict";
import { submissionErrors } from "../src/features/student/submissionValidation.js";
const draft = {
  photo: "data:image/png;base64,fixture",
  category: "ขวดพลาสติก",
  count: "2",
  note: "",
};
test("reject incomplete proof, invalid category and fractional or out-of-range counts before submit", () => {
  const categories = [draft.category];
  for (const count of ["", "0", "-1", "1.5", "1001", "abc"])
    assert.ok(submissionErrors({ ...draft, count }, categories).count);
  assert.deepEqual(
    Object.keys(
      submissionErrors(
        { ...draft, photo: "", category: "unknown", count: "0" },
        categories,
      ),
    ),
    ["photo", "category", "count"],
  );
  assert.deepEqual(submissionErrors(draft, categories), {});
  assert.deepEqual(
    submissionErrors({ ...draft, count: "1000" }, categories),
    {},
  );
});
test("reject oversized notes without discarding draft fields", () => {
  const value = { ...draft, note: "ก".repeat(151) };
  const before = structuredClone(value);
  assert.ok(submissionErrors(value, [draft.category]).note);
  assert.deepEqual(value, before);
});
