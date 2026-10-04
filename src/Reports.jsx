import React, { useEffect, useState } from "react";
import { CalendarDays, ArrowRight, AlertCircle } from "lucide-react";
import { api } from "./api.js";
import { schoolDate } from "../shared/time.js";

const fmt = (n) =>
  Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });
const dayLabel = (day) =>
  new Date(day + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
const timeLabel = (at) =>
  new Date(at).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
const groups = [
  ["overview", "สรุป"],
  ["waste", "ขยะ"],
  ["coins", "Coins"],
  ["students", "นักเรียน"],
  ["rewards", "รางวัล"],
];
const statusLabels = {
  Pending: "รอตรวจ",
  Approved: "อนุมัติ",
  Rejected: "ไม่ผ่าน",
  Cancelled: "ยกเลิก",
  "Pending Pickup": "รอรับ",
  Completed: "รับแล้ว",
};
function Table({ headers, children, label }) {
  return (
    <div
      className="table-wrap report-table"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <table>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Metrics({ items, total }) {
  return (
    <div className="report-metrics">
      {items.map(([key, label, unit]) => (
        <div className="report-metric" key={key}>
          <span>{label}</span>
          <strong>
            {fmt(total[key])} <small>{unit}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
export default function Reports({ refreshKey = 0 }) {
  const today = schoolDate(Date.now());
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today);
  const [range, setRange] = useState({
    from: today.slice(0, 8) + "01",
    to: today,
  });
  const [group, setGroup] = useState("overview"),
    [day, setDay] = useState(""),
    [page, setPage] = useState(0);
  const [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);
    api("reports?" + new URLSearchParams({ ...range, group, day, page }))
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((e) => {
        if (active && !e.cancelled) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, group, day, page, refreshKey, retry]);
  const apply = (start, end) => {
    if (!start || !end || start > end) {
      setError(
        "วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม และต้องเลือกให้ครบทั้งสองวัน",
      );
      return;
    }
    setFrom(start);
    setTo(end);
    setDay("");
    setPage(0);
    setRange({ from: start, to: end });
  };
  const shortcut = (key) => {
    const end = schoolDate(Date.now());
    const start =
      key === "week"
        ? schoolDate(Date.now() - 6 * 86400000)
        : key === "month"
          ? end.slice(0, 8) + "01"
          : end;
    apply(start, end);
  };
  const chooseDay = (date) => {
    setDay(date);
    setPage(0);
  };
  const total = report?.totals;
  const metrics = {
    overview: [
      ["submitted", "รายการส่งขยะ", "ครั้ง"],
      ["weight", "น้ำหนักอนุมัติ", "กก."],
      ["issued", "Coins จากขยะ", "Coins"],
      ["spent", "Coins ใช้แลก", "Coins"],
      ["submitters", "นักเรียนที่ส่ง", "คน"],
      ["visitors", "นักเรียนที่พบประวัติเข้าใช้", "คน"],
    ],
    waste: [
      ["submitted", "ส่งขยะ", "ครั้ง"],
      ["approved", "อนุมัติในช่วงนี้", "ครั้ง"],
      ["rejected", "ไม่ผ่านในช่วงนี้", "ครั้ง"],
      ["cancelled", "ยกเลิกในช่วงนี้", "ครั้ง"],
      ["weight", "น้ำหนักอนุมัติ", "กก."],
      ["submitters", "นักเรียนที่ส่ง", "คน"],
    ],
    coins: [
      ["issued", "แจกจากขยะ", "Coins"],
      ["adjustmentPlus", "เจ้าหน้าที่เพิ่ม", "Coins"],
      ["adjustmentMinus", "เจ้าหน้าที่ลด", "Coins"],
      ["spent", "ใช้แลกรางวัล", "Coins"],
      ["refunded", "คืนจากการยกเลิก", "Coins"],
      ["opening", "ยอดยกมา", "Coins"],
    ],
    students: [
      ["visitors", "พบประวัติเข้าใช้", "คน"],
      ["logins", "เข้าใช้/สมัครสมาชิก", "ครั้ง"],
      ["submitters", "นักเรียนที่ส่งขยะ", "คน"],
      ["approvers", "นักเรียนที่ได้รับอนุมัติ", "คน"],
      ["redeemers", "นักเรียนที่แลกรางวัล", "คน"],
      ["collectors", "นักเรียนที่รับของแล้ว", "คน"],
    ],
    rewards: [
      ["redeemed", "รายการแลก", "รายการ"],
      ["pendingRewards", "ยังรอรับจากยอดแลกช่วงนี้", "รายการ"],
      ["completed", "รับของในช่วงนี้", "รายการ"],
      ["rewardCancelled", "ยกเลิกในช่วงนี้", "รายการ"],
      ["redeemers", "นักเรียนที่แลก", "คน"],
      ["collectors", "นักเรียนที่รับของ", "คน"],
      ["refunded", "Coins ที่คืน", "Coins"],
    ],
  };
  const dailyColumns = metrics[group];
  return (
    <div className="reports">
      <div className="panel report-controls">
        <p>
          เลือกช่วงวันเพื่อดูรายการขยะ Coins นักเรียน และรางวัล ·
          ใช้เวลาโรงเรียน (ประเทศไทย)
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(from, to);
          }}
          className="report-date-form"
        >
          <label className="field">
            <span>วันเริ่มรายงาน</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>วันสิ้นสุดรายงาน</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>
          <button className="btn primary" type="submit">
            <CalendarDays size={18} /> ดูรายงาน
          </button>
        </form>
        <div className="report-shortcuts">
          {[
            ["today", "วันนี้"],
            ["week", "7 วันล่าสุด"],
            ["month", "เดือนนี้"],
          ].map(([key, label]) => (
            <button
              className="btn secondary"
              key={key}
              onClick={() => shortcut(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tabs report-tabs" aria-label="หมวดรายงาน">
        {groups.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={group === key}
            className={group === key ? "active" : ""}
            onClick={() => {
              setGroup(key);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="alert" role="alert">
          <AlertCircle size={20} />
          {error}
          <button onClick={() => setRetry((x) => x + 1)}>ลองใหม่</button>
        </div>
      )}
      {loading && <p role="status">กำลังสร้างรายงาน…</p>}
      {report && (
        <>
          <h2 className="report-range">
            {dayLabel(report.range.from)} – {dayLabel(report.range.to)}
          </h2>
          <p className="report-note">
            ยอดสรุปเป็นทั้งช่วงวันที่เลือก
            จำนวนคนแต่ละกลุ่มนับคนไม่ซ้ำและบวกข้ามกลุ่มไม่ได้
            ข้อมูลมาจากรายการที่ยังเก็บในระบบ
          </p>
          <Metrics items={metrics[group]} total={total} />
          {report.coverage.unknownReviewDates > 0 && (
            <p className="report-note" role="status">
              มีรายการส่งในช่วงนี้ {fmt(report.coverage.unknownReviewDates)}{" "}
              รายการที่ไม่ระบุวันตรวจ จึงยังรวมเป็นน้ำหนักและผลตรวจรายวันไม่ได้
            </p>
          )}
          <details className="report-explanation">
            <summary>ตัวเลขแต่ละกลุ่มนับตามวันไหน?</summary>
            <p>
              รายการส่งขยะและคนที่ส่ง: วันส่ง · น้ำหนักและผลตรวจ:
              วันอนุมัติ/ไม่ผ่าน · Coins: วันที่บันทึกในบัญชี · รางวัล: วันแลก
              วันรับ หรือวันยกเลิกตามกิจกรรม
            </p>
            <p>
              การเข้าใช้นับจากบันทึก login และสมัครสมาชิกที่ยังเก็บไว้
              ไม่ใช่ยอดผู้เข้าชมเว็บ
              ประวัติย้อนหลังอาจไม่ครบตามระยะเวลาเก็บรักษา
              หากไม่มีประวัติจะหมายถึง “ไม่พบข้อมูล” ไม่ยืนยันว่าไม่มีผู้ใช้งาน
            </p>
            <p>
              รายการขยะนับเป็นจำนวนครั้งที่ส่ง ไม่ใช่จำนวนขวดหรือชิ้น
              ข้อมูลชั้น/ห้องเป็นข้อมูลนักเรียนปัจจุบัน ไม่ใช่ชั้น/ห้องย้อนหลัง
            </p>
            {report.coverage.unknownReviewDates > 0 && (
              <p>
                มีรายการส่งในช่วงนี้ {fmt(report.coverage.unknownReviewDates)}{" "}
                รายการที่ไม่ระบุวันตรวจ จึงไม่นำมารวมเป็นผลตรวจและน้ำหนักรายวัน
              </p>
            )}
          </details>
          {group === "waste" && (
            <section className="panel">
              <h3>ขยะแยกประเภท</h3>
              <Table
                label="ขยะแยกประเภท"
                headers={[
                  "ประเภท",
                  "ส่ง (ครั้ง)",
                  "อนุมัติ (ครั้ง)",
                  "น้ำหนัก (กก.)",
                  "Coins จากขยะ",
                ]}
              >
                {report.categories.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td>{fmt(c.submitted)}</td>
                    <td>{fmt(c.approved)}</td>
                    <td>{fmt(c.weight)}</td>
                    <td>{fmt(c.coins)}</td>
                  </tr>
                ))}
              </Table>
              <p className="report-note">
                สถานะปัจจุบันของรายการที่ส่งในช่วงนี้: รอตรวจ{" "}
                {fmt(report.cohort.Pending)} · อนุมัติ{" "}
                {fmt(report.cohort.Approved)} · ไม่ผ่าน{" "}
                {fmt(report.cohort.Rejected)} · ยกเลิก{" "}
                {fmt(report.cohort.Cancelled)} ผลตรวจอาจเกิดนอกช่วงที่เลือก
              </p>
            </section>
          )}
          {group === "coins" && (
            <p className="report-note">
              ใช้สุทธิหลังหักคืน: {fmt(total.spent - total.refunded)} Coins ·
              ยอดคืนอาจเป็นรายการแลกจากช่วงก่อนหน้า จึงอาจติดลบได้
            </p>
          )}
          {group === "rewards" && (
            <section className="panel">
              <h3>รางวัลแต่ละชนิด</h3>
              <Table
                label="รางวัลแต่ละชนิด"
                headers={[
                  "รางวัล",
                  "แลกในช่วงนี้",
                  "ยังรอรับจากยอดแลกนี้",
                  "รับในช่วงนี้",
                  "ยกเลิกในช่วงนี้",
                ]}
              >
                {report.rewards.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{fmt(r.redeemed)}</td>
                    <td>{fmt(r.pending)}</td>
                    <td>{fmt(r.completed)}</td>
                    <td>{fmt(r.cancelled)}</td>
                  </tr>
                ))}
              </Table>
              <p className="report-note">
                ยอดรับและยกเลิกอาจมาจากรายการที่แลกก่อนช่วงวันที่เลือก
              </p>
            </section>
          )}
          <details className="panel report-daily" open={group === "overview"}>
            <summary>สรุปรายวัน · กดวันที่เพื่อดูรายละเอียด</summary>
            <Table
              label="รายงานรายวัน"
              headers={[
                "วันที่",
                ...dailyColumns.map(([, label, unit]) => `${label} (${unit})`),
              ]}
            >
              {report.daily.map((d) => (
                <tr
                  key={d.date}
                  className={day === d.date ? "selected-day" : ""}
                >
                  <td>
                    <button
                      className="text-button"
                      aria-label={"ดูรายละเอียดวันที่ " + dayLabel(d.date)}
                      onClick={() => chooseDay(d.date)}
                    >
                      {dayLabel(d.date)} <ArrowRight size={14} />
                    </button>
                  </td>
                  {dailyColumns.map(([key]) => (
                    <td key={key}>
                      {["visitors", "logins"].includes(key) && !d[key]
                        ? "ไม่พบประวัติ"
                        : fmt(d[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
          </details>
          <section className="panel report-details">
            <div className="section-heading">
              <h3>
                {group === "students"
                  ? "นักเรียนแยกกิจกรรม"
                  : "รายละเอียดกิจกรรม"}
                {day ? " · " + dayLabel(day) : " · ทั้งช่วง"}
              </h3>
              {day && (
                <button className="text-button" onClick={() => chooseDay("")}>
                  ดูทั้งช่วง
                </button>
              )}
            </div>
            {!report.rowCount ? (
              <p className="empty">ไม่พบรายการในช่วงที่เลือก</p>
            ) : group === "students" ? (
              <Table
                label="นักเรียนแยกกิจกรรม"
                headers={[
                  "นักเรียน",
                  "ชั้น/ห้องปัจจุบัน",
                  "เข้าใช้ที่พบ (ครั้ง)",
                  "ส่ง (ครั้ง)",
                  "อนุมัติ (ครั้ง)",
                  "น้ำหนัก (กก.)",
                  "Coins รับจากขยะ",
                  "Coins ใช้",
                  "แลก (ครั้ง)",
                  "รับแล้ว (ครั้ง)",
                ]}
              >
                {report.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <small className="report-student-id">{p.id}</small>
                    </td>
                    <td>{p.grade ? `ม.${p.grade}/${p.room}` : "—"}</td>
                    <td>{p.logins ? fmt(p.logins) : "ไม่พบประวัติ"}</td>
                    <td>{fmt(p.submitted)}</td>
                    <td>{fmt(p.approved)}</td>
                    <td>{fmt(p.weight)}</td>
                    <td>{fmt(p.issued)}</td>
                    <td>{fmt(p.spent)}</td>
                    <td>{fmt(p.redeemed)}</td>
                    <td>{fmt(p.completed)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table
                label="รายละเอียดกิจกรรมตามเวลา"
                headers={[
                  "วันเวลา",
                  "กิจกรรม",
                  "นักเรียน",
                  "รายละเอียด",
                  "น้ำหนัก / Coins",
                ]}
              >
                {report.rows.map((e, i) => (
                  <tr key={`${e.at}-${e.student}-${e.kind}-${i}`}>
                    <td>{timeLabel(e.at)}</td>
                    <td>{e.label}</td>
                    <td>
                      {e.studentName}
                      <small className="report-student-id">{e.student}</small>
                    </td>
                    <td>
                      {e.category || e.reward || e.reason || "—"}
                      {e.status && (
                        <small className="report-student-id">
                          สถานะปัจจุบัน: {statusLabels[e.status] || e.status}
                        </small>
                      )}
                    </td>
                    <td>
                      {e.amount !== undefined
                        ? fmt(e.amount) + " Coins"
                        : e.kind === "approved"
                          ? fmt(e.weight) + " กก."
                          : "—"}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <div className="pagination">
              <button
                className="btn secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                หน้าก่อน
              </button>
              <span>
                หน้า {page + 1} · {fmt(report.rowCount)}{" "}
                {group === "students" ? "คน" : "รายการ"}
              </span>
              <button
                className="btn secondary"
                disabled={!report.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                หน้าถัดไป
              </button>
            </div>
          </section>
          <p className="report-note">
            สร้างรายงานเมื่อ {timeLabel(report.generatedAt)}
          </p>
        </>
      )}
    </div>
  );
}
