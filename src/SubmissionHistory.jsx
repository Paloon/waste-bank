import React, { useState } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Coins,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Photo } from "./components.jsx";
import { categoryLabel, WasteIcon } from "./RecyclingGuide.jsx";
import { recyclingRates } from "../shared/recycling.js";
const statuses = {
  Pending: { label: "รอตรวจ", Icon: Clock },
  Approved: { label: "อนุมัติแล้ว", Icon: CheckCircle2 },
  Rejected: { label: "ไม่ผ่าน", Icon: XCircle },
  Cancelled: { label: "ยกเลิกแล้ว", Icon: Ban },
};
const fmt = (n) => Number(n || 0).toLocaleString("th-TH");
const date = (at) =>
  new Date(at).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
export default function SubmissionHistory({
  student,
  rates = recyclingRates,
  onPhoto,
  onCancel,
  onRefresh,
  busy,
}) {
  const [filter, setFilter] = useState("");
  const items = student.submissions.filter(
    (s) => !filter || s.status === filter,
  );
  return (
    <section aria-label="สถานะรายการส่งของฉัน">
      <div className="section-heading">
        <h2>สถานะรายการของฉัน</h2>
        <button className="btn secondary" disabled={busy} onClick={onRefresh}>
          <RefreshCw size={17} aria-hidden="true" /> อัปเดตสถานะ
        </button>
      </div>
      <p className="muted">
        จำนวนด้านล่างนับเฉพาะรายการในหน้านี้ · Coins เข้าบัญชีเมื่อครูอนุมัติ
      </p>
      <div
        className="submission-status-filters"
        aria-label="กรองสถานะรายการในหน้านี้"
      >
        <button
          type="button"
          aria-pressed={!filter}
          onClick={() => setFilter("")}
        >
          ทั้งหมด {student.submissions.length}
        </button>
        {Object.entries(statuses).map(([key, { label, Icon }]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            <Icon size={17} aria-hidden="true" /> {label}{" "}
            {student.submissions.filter((s) => s.status === key).length}
          </button>
        ))}
      </div>
      {!items.length && (
        <p className="submission-empty">
          {student.submissions.length
            ? "ไม่มีรายการสถานะนี้ในหน้านี้"
            : "ยังไม่มีรายการส่งรูปการทิ้งขยะ"}
        </p>
      )}
      {items.map((s) => {
        const state = statuses[s.status] || {
          label: s.status,
          Icon: AlertCircle,
        };
        const Icon = state.Icon;
        const corrected =
          s.status === "Approved" &&
          s.submittedCount !== undefined &&
          (s.submittedCount !== s.count || s.submittedCategory !== s.category);
        return (
          <article
            className={`student-submission ${s.status.toLowerCase()}`}
            key={s.id}
          >
            <div className="submission-card-heading">
              <h3>
                <WasteIcon category={s.category} /> {categoryLabel(s.category)}
              </h3>
              <span className="submission-status">
                <Icon size={18} aria-hidden="true" /> {state.label}
              </span>
            </div>
            <div className="submission-card-body">
              <div className="evidence-pair">
                <Photo src={s.image} onClick={onPhoto} />
                {s.disposalImage && (
                  <Photo src={s.disposalImage} onClick={onPhoto} />
                )}
              </div>
              <div className="grow">
                <p>
                  {s.count
                    ? `${fmt(s.count)} ${rates[s.category]?.unit || "ชิ้น"}`
                    : "รายการเก่าไม่ได้ระบุจำนวน"}
                </p>
                <small>ส่งเมื่อ {date(s.at)}</small>
                {s.reviewedAt && <small>ตรวจเมื่อ {date(s.reviewedAt)}</small>}
                {s.status === "Pending" && (
                  <p className="submission-result">
                    <Clock size={16} aria-hidden="true" /> รอครูตรวจรูป
                    {Number.isFinite(s.estimatedCoins)
                      ? ` · คาดว่าจะได้ ${fmt(s.estimatedCoins)} Coins`
                      : ""}{" "}
                    · ยังไม่ได้รับ Coins
                  </p>
                )}
                {s.status === "Approved" && (
                  <p className="submission-result">
                    <span className="coin-badge">
                      <Coins size={18} aria-hidden="true" /> +{fmt(s.coins)}{" "}
                      Coins
                    </span>{" "}
                    เข้าบัญชีแล้ว
                  </p>
                )}
                {s.status === "Rejected" && (
                  <div className="submission-rejection">
                    <b>เหตุผลที่ไม่ผ่าน</b>
                    <p>
                      {s.reason || "ไม่พบเหตุผลในรายการเก่า กรุณาสอบถามครู"}
                    </p>
                    <small>
                      รายการนี้ไม่ได้รับ Coins ถ้าต้องแก้หลักฐาน
                      ให้ถ่ายรูปใหม่ตามคำแนะนำก่อนส่งอีกครั้ง
                    </small>
                  </div>
                )}
                {s.status === "Cancelled" && (
                  <p className="submission-result">
                    ยกเลิกแล้ว · รายการนี้ไม่ได้รับ Coins
                  </p>
                )}
                {corrected && (
                  <p className="review-correction">
                    นักเรียนแจ้ง {s.submittedCount}{" "}
                    {categoryLabel(s.submittedCategory)} → ครูยืนยัน {s.count}{" "}
                    {categoryLabel(s.category)}
                  </p>
                )}
                {s.status === "Approved" && s.reviewNote && (
                  <p className="submission-review-note">
                    <b>หมายเหตุจากครู:</b> {s.reviewNote}
                  </p>
                )}
                {s.evidenceRemovedAt && (
                  <small>ภาพถูกลบตามระยะเวลาเก็บรักษา</small>
                )}
              </div>
            </div>
            {s.status === "Pending" && (
              <button
                className="text-button danger"
                onClick={() => onCancel(s)}
              >
                ยกเลิกรายการ
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
