import React, { useState } from "react";
import { CheckCircle2, XCircle, ImageOff } from "lucide-react";
import ReviewCount from "./ReviewCount.jsx";
import RejectionReason from "../../RejectionReason.jsx";
import ActionButton from "../../components/ActionButton.jsx";

export default function ReviewDialog({
  item,
  studentName,
  status,
  rates,
  busy,
  onStatus,
  onPhoto,
  onSubmit,
}) {
  const [missing, setMissing] = useState(!item.image);
  const approved = status === "Approved";
  return (
    <>
      <h2 id="modal-title">ตรวจรายการส่งขยะ</h2>
      <p className="review-student">
        {studentName || item.student} · {item.category}
      </p>
      <form onSubmit={onSubmit} className="review-layout">
        <aside className="review-proof" aria-label="รูปสำหรับตรวจรายการ">
          <h3>หลักฐานจากนักเรียน</h3>
          <p>แตะรูปเพื่อขยายและนับจำนวน</p>
          {item.image && (
            <button
              type="button"
              className="review-evidence"
              onClick={() => onPhoto(item.image)}
              aria-label="ขยายภาพหลักฐาน"
            >
              <img
                src={item.image}
                alt="ภาพขยะสำหรับตรวจจำนวน"
                onError={() => setMissing(true)}
              />
            </button>
          )}
          {item.disposalImage && (
            <button
              type="button"
              className="review-evidence"
              onClick={() => onPhoto(item.disposalImage)}
              aria-label="ขยายภาพจุดทิ้ง"
            >
              <img src={item.disposalImage} alt="ภาพถังหรือจุดทิ้งสำหรับตรวจ" />
            </button>
          )}
          {missing && (
            <p role="alert" className="danger">
              <ImageOff size={18} /> ภาพหลักไม่พร้อม กรุณาโหลดรูปใหม่ก่อนอนุมัติ
            </p>
          )}
          {item.note && (
            <p className="review-student-note">
              <b>ข้อความจากนักเรียน:</b> {item.note}
            </p>
          )}
        </aside>
        <div className="review-decision">
          <div
            className="review-choice"
            role="group"
            aria-label="เลือกผลการตรวจ"
          >
            <button
              type="button"
              aria-pressed={approved}
              disabled={busy}
              onClick={() => onStatus("Approved")}
            >
              <CheckCircle2 size={18} /> อนุมัติ
            </button>
            <button
              type="button"
              aria-pressed={!approved}
              disabled={busy}
              onClick={() => onStatus("Rejected")}
            >
              <XCircle size={18} /> ไม่ผ่าน
            </button>
          </div>
          <fieldset
            hidden={!approved}
            disabled={!approved || busy}
            className="review-fields"
          >
            <legend className="sr-only">ข้อมูลที่ครูยืนยัน</legend>
            <ReviewCount item={item} rates={rates} />
          </fieldset>
          <fieldset
            hidden={approved}
            disabled={approved || busy}
            className="review-fields"
          >
            <legend className="sr-only">เหตุผลที่ไม่ผ่าน</legend>
            <RejectionReason />
          </fieldset>
          <div className="review-confirm">
            <p>
              {approved
                ? "ตรวจรูปและแก้จำนวนให้ตรง ก่อนมอบ Coins"
                : "นักเรียนจะเห็นเหตุผลนี้ในประวัติรายการ"}
            </p>
            <ActionButton
              className={`btn ${approved ? "primary" : "secondary danger"}`}
              busy={busy}
              disabled={approved && missing}
            >
              ยืนยันผลการตรวจ
            </ActionButton>
          </div>
        </div>
      </form>
    </>
  );
}
