import React, { useState } from "react";
import {
  Coins,
  Milk,
  CupSoda,
  Cylinder,
  FileText,
  Package,
  GlassWater,
  Candy,
  ShoppingBag,
  Recycle,
  Camera,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { recyclingRates } from "../shared/recycling.js";
export const categoryLabel = (c) =>
  ({
    แก้วพลาสติก: "แก้วน้ำพลาสติก",
    แก้ว: "ขวดและภาชนะแก้ว",
    กล่องเครื่องดื่ม: "กล่องนม / น้ำผลไม้",
  })[c] || c;
const icons = {
  ขวดพลาสติก: Milk,
  แก้วพลาสติก: CupSoda,
  กระป๋องอะลูมิเนียม: Cylinder,
  กระดาษ: FileText,
  กล่องอาหารพลาสติก: Package,
  กล่องเครื่องดื่ม: Milk,
  แก้ว: GlassWater,
  ซองขนม: Candy,
  ถุงพลาสติก: ShoppingBag,
};
export function WasteIcon({ category, size = 22 }) {
  const Icon = icons[category] || Recycle;
  return <Icon size={size} aria-hidden="true" />;
}
const examples = {
  ขวดพลาสติก: "ขวดน้ำดื่มหรือขวดเครื่องดื่มพลาสติก",
  แก้วพลาสติก: "แก้วน้ำหรือแก้วเครื่องดื่มพลาสติก ไม่ใช่ภาชนะแก้ว",
  กระป๋องอะลูมิเนียม: "กระป๋องน้ำอัดลมหรือเครื่องดื่มอะลูมิเนียม",
  กระดาษ: "กระดาษแบบฝึกหัดหรือเอกสารที่ใช้แล้วเต็มแผ่น",
  กล่องอาหารพลาสติก: "กล่องอาหารหรือกล่องขนมพลาสติก ไม่รวมกล่องโฟม",
  กล่องเครื่องดื่ม: "กล่องนมหรือกล่องน้ำผลไม้ ไม่รวมขวดพลาสติก",
  แก้ว: "ขวดหรือภาชนะที่ทำจากแก้ว ไม่แตก ไม่ใช่พลาสติก",
  ซองขนม: "ซองขนมกรุบกรอบหรือห่อขนมที่ใช้แล้ว",
  ถุงพลาสติก: "ถุงใสหรือถุงหิ้วที่ใช้แล้ว ไม่รวมซองขนม",
};
export default function RecyclingGuide({ data }) {
  const rates = data.recyclingRates || recyclingRates;
  const [expanded, setExpanded] = useState("");
  return (
    <section
      className="panel home-coin-rates"
      aria-labelledby="coin-rates-title"
    >
      <div className="section-heading">
        <h2 id="coin-rates-title">
          <Recycle size={22} aria-hidden="true" /> ทิ้งอะไร ได้กี่ Coins?
        </h2>
      </div>
      <p className="muted">
        เลือกประเภท กรอกจำนวน และถ่ายรูปการทิ้งให้ถูกที่ ·
        กดชื่อขยะเพื่อดูตัวอย่างและวิธีนับ
      </p>
      <table>
        <caption className="sr-only">อัตรา Coins และคู่มือทิ้งขยะ</caption>
        <thead>
          <tr>
            <th scope="col">ประเภทขยะ</th>
            <th scope="col">นับต่อ</th>
            <th scope="col">
              <span className="coin-column-title">
                <Coins size={18} aria-hidden="true" /> Coins
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.categories
            .filter((c) => rates[c] && !rates[c].legacy)
            .map((c) => (
              <React.Fragment key={c}>
                <tr>
                  <th scope="row">
                    <button
                      type="button"
                      className="waste-guide-toggle"
                      aria-expanded={expanded === c}
                      aria-controls={`waste-guide-${c}`}
                      onClick={() => setExpanded(expanded === c ? "" : c)}
                    >
                      <WasteIcon category={c} />
                      <span>{categoryLabel(c)}</span>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </th>
                  <td>1 {rates[c].unit}</td>
                  <td>
                    <strong className="coin-badge">
                      <Coins size={18} aria-hidden="true" />
                      <span>{rates[c].coins}</span>
                    </strong>
                  </td>
                </tr>
                {expanded === c && (
                  <tr>
                    <td colSpan={3} id={`waste-guide-${c}`}>
                      <div className="waste-guide-content">
                        <p>
                          <b>ตัวอย่าง:</b> {examples[c]}
                        </p>
                        <p>
                          <b>วิธีนับ:</b> {rates[c].rule}
                        </p>
                        <p>
                          <Trash2 size={16} aria-hidden="true" />{" "}
                          ทิ้งตามป้ายประเภทขยะที่ถังหรือจุดทิ้งของโรงเรียน
                          หากไม่แน่ใจให้ถามครู ไม่วางขยะข้างถัง
                        </p>
                        <p>
                          <Camera size={16} aria-hidden="true" />{" "}
                          รูปต้องเห็นขยะและจำนวน พร้อมถังหรือจุดทิ้ง
                          หากรูปเดียวเห็นไม่ครบ แนบรูปที่สองได้
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
        </tbody>
      </table>
      <p className="home-rates-note">
        ได้รับ Coins หลังครูตรวจหลักฐานและอนุมัติ ครูแก้ประเภทหรือจำนวนได้
        ไม่นับเศษที่ฉีกแบ่งเพิ่มแต้ม ใช้ขยะที่เกิดขึ้นแล้ว
        ไม่ต้องซื้อของเพิ่มเพื่อสะสมแต้ม
      </p>
    </section>
  );
}
