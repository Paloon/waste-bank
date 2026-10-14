// Initial school incentive rates, not resale prices. One submission per category.
export const recyclingRates = Object.freeze({
  ขวดพลาสติก: { coins: 5, unit: "ขวด", rule: "ขวดเปล่าที่ล้างแล้ว" },
  แก้วพลาสติก: { coins: 2, unit: "ใบ", rule: "แก้วเปล่าที่ล้างแล้ว" },
  กระป๋องอะลูมิเนียม: {
    coins: 5,
    unit: "กระป๋อง",
    rule: "กระป๋องเปล่าที่ล้างแล้ว",
  },
  กล่องอาหารพลาสติก: {
    coins: 2,
    unit: "กล่อง",
    rule: "กล่องเปล่า ไม่มีเศษอาหาร นับกล่องพร้อมฝาเป็นหนึ่งชุด",
  },
  กล่องเครื่องดื่ม: {
    coins: 2,
    unit: "กล่อง",
    rule: "กล่องนมหรือน้ำผลไม้เปล่า นับกล่องพร้อมหลอดเป็นหนึ่งชุด",
  },
  กระดาษ: {
    coins: 1,
    unit: "แผ่น",
    rule: "แผ่นเต็มประมาณ A4 ไม่รวมเศษที่ฉีกแบ่ง",
  },
  กระดาษลัง: {
    legacy: true,
    coins: 3,
    unit: "ชิ้น",
    rule: "กล่องหรือแผ่นเต็ม ไม่รวมเศษที่ฉีกแบ่ง",
  },
  แก้ว: { coins: 3, unit: "ชิ้น", rule: "ขวดหรือภาชนะแก้วสมบูรณ์ ไม่แตก" },
  ขยะอิเล็กทรอนิกส์: {
    legacy: true,
    coins: 5,
    unit: "ชิ้น",
    rule: "อุปกรณ์หนึ่งชิ้น ไม่แยกอะไหล่เพิ่มแต้ม ให้ครูตรวจความเหมาะสม",
  },
  ซองขนม: {
    coins: 1,
    unit: "ซอง",
    rule: "ซองขนมเปล่า สะอาดและแห้ง แยกจากถุงพลาสติก ถ่ายรูปจำนวนและจุดทิ้งตามป้ายของโรงเรียน",
  },
  ถุงพลาสติก: {
    coins: 1,
    unit: "ถุง",
    rule: "ถุงใสหรือถุงหิ้วสะอาดและแห้ง ไม่รวมซองขนม ถ่ายรูปจำนวนและจุดทิ้งตามป้ายของโรงเรียน",
  },
  "อื่น ๆ": {
    legacy: true,
    coins: 1,
    unit: "ชิ้น",
    rule: "สิ่งของหนึ่งชิ้นที่ครูยืนยันว่ารับรีไซเคิลได้",
  },
});
export const maxRecyclingCount = 1000;
export function estimateCoins(category, count, rates = recyclingRates) {
  const n = Number(count);
  return Number.isInteger(n) &&
    n >= 1 &&
    n <= maxRecyclingCount &&
    rates[category] &&
    Number.isInteger(rates[category].coins)
    ? n * rates[category].coins
    : null;
}

export const activeCategories = Object.keys(recyclingRates).filter(
  (c) => !recyclingRates[c].legacy,
);
export function validCount(count) {
  const n = Number(count);
  return Number.isInteger(n) && n >= 1 && n <= maxRecyclingCount;
}
