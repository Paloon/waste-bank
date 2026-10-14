export const studentTitles = Object.freeze([
  "เด็กชาย",
  "เด็กหญิง",
  "นาย",
  "นางสาว",
]);
export function studentName(title, name) {
  if (!studentTitles.includes(title))
    throw new Error("เลือกคำนำหน้าก่อนสมัครสมาชิก");
  const value = String(name || "").trim();
  if (value.length < 2) throw new Error("กรอกชื่อ–นามสกุลอย่างน้อย 2 ตัวอักษร");
  const combined = title + value;
  if (combined.length > 80)
    throw new Error("ชื่อรวมคำนำหน้าต้องไม่เกิน 80 ตัวอักษร");
  return combined;
}
