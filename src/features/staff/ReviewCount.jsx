import React, { useState } from "react";
import { Coins } from "lucide-react";
import { Field } from "../../components.jsx";
import { estimateCoins, maxRecyclingCount } from "../../../shared/recycling.js";
export default function ReviewCount({ item, rates }) {
  const [category, setCategory] = useState(item.category);
  const [count, setCount] = useState(String(item.count || ""));
  const rate =
    category === item.submittedCategory && item.coinRate
      ? item.coinRate
      : rates[category].coins;
  const amount = estimateCoins(category, count, {
    [category]: { coins: rate },
  });
  return (
    <>
      <p>
        นักเรียนแจ้ง: {item.submittedCategory || item.category} ·{" "}
        {item.submittedCount ?? "ไม่ได้ระบุจำนวน"}
        {item.submittedCount
          ? ` ${rates[item.submittedCategory || item.category].unit}`
          : ""}
      </p>
      <Field label="ประเภทขยะที่ครูตรวจพบ">
        <select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {Object.keys(rates)
            .filter((c) => !rates[c].legacy || c === item.category)
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
      </Field>
      <Field label="จำนวนที่ครูตรวจพบ">
        <input
          name="count"
          type="number"
          inputMode="numeric"
          min="1"
          max={maxRecyclingCount}
          step="1"
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </Field>
      <Field label="หมายเหตุการตรวจ (ไม่บังคับ)">
        <textarea
          name="reason"
          maxLength={150}
          placeholder="เช่น ในรูปเห็นขวด 2 ขวด จึงแก้จำนวนจาก 3 เป็น 2"
        />
      </Field>
      <div className="coin-estimate" aria-live="polite">
        <strong>
          <Coins className="gold-coin-icon" size={25} aria-hidden="true" />{" "}
          มอบให้ {amount ?? "—"} Coins
        </strong>
        <p>
          {count || "—"} {rates[category].unit} × {rate} Coins
        </p>
        <small>
          {rates[category].rule} · แก้ประเภทหรือจำนวนให้ตรงกับหลักฐานก่อนยืนยัน
        </small>
      </div>
    </>
  );
}
