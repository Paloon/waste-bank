import React, { useEffect, useState } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";
import { api } from "../../api.js";
import { schoolDate } from "../../../shared/time.js";
import { categoryLabel } from "../../RecyclingGuide.jsx";
import Reports from "../../Reports.jsx";
import {
  Donut,
  BarList,
  ColumnChart,
  foldParts,
  seriesColors,
  otherColor,
} from "./charts.jsx";

const dayMs = 86400000;
const fmt = (n) => Number(n || 0).toLocaleString("th-TH");
const thaiDay = (day, options = { day: "numeric", month: "short" }) =>
  new Date(day + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    ...options,
    timeZone: "Asia/Bangkok",
  });
const presets = [
  ["today", "วันนี้"],
  ["week", "7 วัน"],
  ["month", "เดือนนี้"],
  ["days30", "30 วัน"],
];
function presetRange(key) {
  const to = schoolDate(Date.now());
  const from =
    key === "week"
      ? schoolDate(Date.now() - 6 * dayMs)
      : key === "days30"
        ? schoolDate(Date.now() - 29 * dayMs)
        : key === "month"
          ? to.slice(0, 8) + "01"
          : to;
  return { from, to };
}
const kpis = [
  ["pieces", "ขยะที่อนุมัติ", "ชิ้น", (t) => t.pieces],
  ["issued", "Coins ที่แจก", "Coins", (t) => t.issued],
  ["spent", "Coins ที่ใช้แลก", "Coins", (t) => t.spent - t.refunded],
  ["submitters", "นักเรียนที่ส่งขยะ", "คน", (t) => t.submitters],
];
function Change({ now, before }) {
  if (before == null) return null;
  if (!before)
    return (
      <small className="kpi-change">{now ? "ช่วงก่อนไม่มี" : "เท่าเดิม"}</small>
    );
  const change = Math.round(((now - before) / before) * 100);
  return (
    <small
      className={
        "kpi-change" + (change > 0 ? " up" : change < 0 ? " down" : "")
      }
    >
      {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}%
      จากช่วงก่อน
    </small>
  );
}
/** Daily columns, folded into months when the range is long. */
function columnsFor(daily) {
  const days = [...daily].reverse();
  if (days.length <= 62)
    return days.map((d) => ({
      key: d.date,
      label: thaiDay(d.date, {
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
      short: thaiDay(d.date),
      value: d.submitted,
    }));
  const months = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    months.set(key, (months.get(key) || 0) + d.submitted);
  }
  return [...months].map(([key, value]) => ({
    key,
    label: thaiDay(key + "-01", { month: "long", year: "numeric" }),
    short: thaiDay(key + "-01", { month: "short" }),
    value,
  }));
}

/** Staff summary: headline numbers, charts, and the detailed report on demand. */
export default function Summary({ refreshKey = 0 }) {
  const [preset, setPreset] = useState("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [custom, setCustom] = useState(range);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(
      "reports?" +
        new URLSearchParams({ ...range, group: "overview", compare: "1" }),
      undefined,
      { signal: controller.signal },
    )
      .then((value) => active && setReport(value))
      .catch((e) => active && !e.cancelled && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [range, refreshKey, retry]);
  const choose = (key) => {
    setPreset(key);
    if (key !== "custom") setRange(presetRange(key));
  };
  const total = report?.totals;
  const previous = report?.previous?.totals;
  const categories = report
    ? foldParts(
        report.categories.map((c) => ({
          key: c.category,
          label: categoryLabel(c.category),
          value: c.pieces,
        })),
      )
    : [];
  const grades = (report?.grades || []).map((g) => ({
    key: g.grade || "none",
    label: g.grade ? "ม." + g.grade : "ไม่ระบุชั้น",
    value: g.students,
    // Colour follows the grade, so ม.3 keeps its colour whichever grades appear.
    color: seriesColors[Number(g.grade) - 1] || otherColor,
  }));
  const rewards = (report?.rewards || [])
    .filter((r) => r.redeemed)
    .sort((a, b) => b.redeemed - a.redeemed)
    .slice(0, 5)
    .map((r) => ({ key: r.id, label: r.name, value: r.redeemed }));
  return (
    <div className="summary">
      <div className="summary-range" role="group" aria-label="ช่วงเวลาสรุป">
        {[...presets, ["custom", "เลือกวัน"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            className={preset === key ? "active" : ""}
            onClick={() => choose(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <form
          className="summary-custom"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.from && custom.to && custom.from <= custom.to)
              setRange({ ...custom });
            else setError("วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม");
          }}
        >
          <label>
            <span>ตั้งแต่</span>
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              required
            />
          </label>
          <label>
            <span>ถึง</span>
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              required
            />
          </label>
          <button className="btn primary" type="submit">
            <CalendarDays size={18} /> ดูสรุป
          </button>
        </form>
      )}
      {error && (
        <div className="alert" role="alert">
          <AlertCircle size={20} />
          {error}
          <button onClick={() => setRetry((x) => x + 1)}>ลองใหม่</button>
        </div>
      )}
      {report && (
        <p className="summary-period" aria-live="polite">
          {range.from === range.to
            ? thaiDay(range.from, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : `${thaiDay(range.from)} – ${thaiDay(range.to, { day: "numeric", month: "short", year: "numeric" })}`}
          {loading && " · กำลังอัปเดต…"}
        </p>
      )}
      {!report && loading && <p role="status">กำลังสรุปข้อมูล…</p>}
      {report && (
        <>
          <div className="kpi-grid">
            {kpis.map(([key, label, unit, value]) => (
              <div className="kpi" key={key}>
                <span>{label}</span>
                <strong>
                  {fmt(value(total))} <small>{unit}</small>
                </strong>
                <Change
                  now={value(total)}
                  before={previous && value(previous)}
                />
              </div>
            ))}
          </div>
          <div className="summary-charts">
            <section className="panel chart-card">
              <h3>ขยะแต่ละประเภท</h3>
              <p className="chart-note">นับชิ้นที่ครูอนุมัติในช่วงนี้</p>
              <Donut
                parts={categories}
                unit="ชิ้น"
                label="สัดส่วนขยะแต่ละประเภท"
              />
            </section>
            <section className="panel chart-card">
              <h3>นักเรียนที่ร่วมส่งขยะ แยกตามชั้น</h3>
              <p className="chart-note">
                นับคนไม่ซ้ำ ใช้ชั้นปัจจุบันของนักเรียน
              </p>
              <Donut
                parts={grades}
                unit="คน"
                label="นักเรียนที่ส่งขยะแยกตามชั้น"
              />
            </section>
            <section className="panel chart-card wide">
              <h3>
                จำนวนรายการส่งขยะ
                {report.daily.length > 62 ? "รายเดือน" : "รายวัน"}
              </h3>
              <ColumnChart
                columns={columnsFor(report.daily)}
                unit="รายการ"
                label="จำนวนรายการส่งขยะในแต่ละวัน"
              />
            </section>
            <section className="panel chart-card">
              <h3>รางวัลที่แลกมากที่สุด</h3>
              <BarList
                rows={rewards}
                unit="ครั้ง"
                empty="ยังไม่มีการแลกรางวัลในช่วงนี้"
              />
            </section>
          </div>
          <details
            className="summary-details"
            onToggle={(e) => setDetails(e.currentTarget.open)}
          >
            <summary>ดูตารางและรายการละเอียด</summary>
            {details && <Reports refreshKey={refreshKey} range={range} />}
          </details>
        </>
      )}
    </div>
  );
}
