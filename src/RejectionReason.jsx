import React, { useState } from "react";
import {
  ImageOff,
  Hash,
  MapPinOff,
  Trash2,
  Copy,
  MessageSquare,
} from "lucide-react";
import { Field } from "./components.jsx";
const presets = [
  [ImageOff, "ภาพไม่ชัด", "ภาพไม่ชัด กรุณาถ่ายใหม่ให้เห็นขยะและจำนวนชัดเจน"],
  [
    Hash,
    "นับจำนวนไม่ได้",
    "นับจำนวนขยะจากภาพไม่ได้ กรุณาจัดขยะให้เห็นครบก่อนถ่าย",
  ],
  [
    MapPinOff,
    "ไม่เห็นจุดทิ้ง",
    "ไม่เห็นถังหรือจุดทิ้ง กรุณาแนบภาพที่เห็นจุดทิ้งตามประเภทขยะ",
  ],
  [
    Trash2,
    "ทิ้งผิดประเภท",
    "ทิ้งขยะผิดประเภท กรุณาทิ้งตามป้ายที่จุดทิ้งของโรงเรียน",
  ],
  [
    Copy,
    "หลักฐานซ้ำ",
    "หลักฐานซ้ำกับรายการที่ส่งแล้ว ขยะชุดเดิมรับ Coins ได้ครั้งเดียว",
  ],
];
export default function RejectionReason() {
  const [reason, setReason] = useState("");
  return (
    <>
      <div
        className="rejection-presets"
        role="group"
        aria-label="เลือกเหตุผลไม่ผ่านแบบเร็ว"
      >
        {presets.map(([Icon, label, value]) => (
          <button
            type="button"
            key={label}
            aria-pressed={reason === value}
            onClick={() => setReason(value)}
          >
            <Icon size={18} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <p className="muted">
        <MessageSquare size={16} aria-hidden="true" />{" "}
        เลือกเหตุผลเพื่อเติมข้อความ แล้วแก้หรือเพิ่มรายละเอียดได้
        นักเรียนจะเห็นข้อความนี้
      </p>
      <Field label="เหตุผลที่ไม่อนุมัติ">
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={150}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เลือกเหตุผลด้านบน หรือเขียนเหตุผลอื่น"
        />
      </Field>
    </>
  );
}
