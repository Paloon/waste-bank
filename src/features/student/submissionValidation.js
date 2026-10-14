import { maxRecyclingCount, validCount } from "../../../shared/recycling.js";
export function submissionErrors({ photo, category, count, note }, categories) {
  const errors = {};
  if (!photo) errors.photo = "เพิ่มรูปขยะก่อนส่งให้คุณครูตรวจ";
  if (!categories.includes(category)) errors.category = "เลือกประเภทขยะที่ส่ง";
  if (!validCount(count))
    errors.count = `กรอกจำนวนเต็มตั้งแต่ 1 ถึง ${maxRecyclingCount}`;
  if (note.length > 150) errors.note = "ฝากข้อความได้ไม่เกิน 150 ตัวอักษร";
  return errors;
}
