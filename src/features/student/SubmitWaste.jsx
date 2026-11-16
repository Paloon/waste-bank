import React, { useRef, useState } from "react";
import {
  Camera,
  Upload,
  Trash2,
  Coins,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { Field } from "../../components.jsx";
import { WasteIcon, categoryLabel } from "../../RecyclingGuide.jsx";
import {
  recyclingRates,
  estimateCoins,
  maxRecyclingCount,
} from "../../../shared/recycling.js";
import { submissionErrors } from "./submissionValidation.js";
// Two acceptable ways to take the photo (public/examples, 640x480 WebP).
const examples = [
  {
    src: "/examples/hold-by-bin.webp",
    caption: "แบบที่ 1 ถือขยะยืนข้างถัง",
    alt: "ตัวอย่างแบบที่ 1: นักเรียนถือขวดพลาสติกยืนข้างถังรีไซเคิล เห็นทั้งขวดและถัง",
  },
  {
    src: "/examples/drop-in-bin.webp",
    caption: "แบบที่ 2 ถ่ายตอนทิ้งลงถัง",
    alt: "ตัวอย่างแบบที่ 2: มือกำลังทิ้งขวดพลาสติกลงถังรีไซเคิล",
  },
];
export default function SubmitWaste({
  student,
  data,
  photo,
  disposalPhoto,
  category,
  count,
  note,
  busy,
  setPhoto,
  setDisposalPhoto,
  setCategory,
  setCount,
  setNote,
  readImage,
  run,
  identify,
  onSubmit,
}) {
  const formRef = useRef(null);
  const [errors, setErrors] = useState({});
  const clearError = (field) =>
    setErrors((value) => ({ ...value, [field]: undefined }));
  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    const next = submissionErrors(
      { photo, category, count, note },
      data.categories,
    );
    setErrors(next);
    const field = Object.keys(next)[0];
    if (field) {
      formRef.current?.querySelector('[data-field="' + field + '"]')?.focus();
      return;
    }
    onSubmit();
  };
  return (
    <div className="submit-layout">
      <section className="panel">
        <div className="flow-steps">
          <span className="complete">1 ระบุตัวตน</span>
          <span className="current">2 ส่งหลักฐาน</span>
          <span>3 เสร็จแล้ว</span>
        </div>
        <form
          id="submission-form"
          ref={formRef}
          noValidate
          aria-busy={busy}
          onSubmit={submit}
        >
          <div className="submission-help photo-example">
            <div>
              <h2>ก่อนถ่ายรูป</h2>
              <ul className="photo-rules">
                <li>ถ่ายแบบไหนก็ได้ตามตัวอย่างด้านล่าง</li>
                <li>
                  <b>ต้องเห็นถังขยะในรูป</b>
                </li>
                <li>เห็นขยะชัด ครูนับจำนวนได้ และทิ้งถูกถัง</li>
              </ul>
              <small>รูปเดียวเห็นไม่ครบ เพิ่มรูปที่ 2 ด้านล่างได้</small>
            </div>
            <div className="example-photos">
              {examples.map((x) => (
                <figure key={x.src}>
                  <img
                    src={x.src}
                    alt={x.alt}
                    width="640"
                    height="480"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>{x.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div
            className="upload-zone"
            data-field="photo"
            tabIndex={-1}
            role="group"
            aria-label="รูปหลักฐานขยะ"
            aria-describedby={
              errors.photo ? "submission-photo-error" : undefined
            }
          >
            {photo ? (
              <img className="upload-preview" src={photo} alt="ภาพที่เลือก" />
            ) : (
              <>
                <Camera size={46} />
                <h3>ถ่ายรูปตอนทิ้งขยะ</h3>
                <p>ให้เห็นทั้งขยะและถังขยะ</p>
              </>
            )}
            <div className="upload-buttons">
              <label className="btn primary">
                <Camera size={18} /> {photo ? "ถ่ายใหม่" : "เปิดกล้อง"}
                <input
                  type="file"
                  disabled={busy}
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) =>
                    run(() =>
                      readImage(e.target.files[0], (value) => {
                        setPhoto(value);
                        clearError("photo");
                      }),
                    )
                  }
                />
              </label>
              <label className="btn secondary">
                <Upload size={18} /> เลือกรูป
                <input
                  type="file"
                  disabled={busy}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    run(() =>
                      readImage(e.target.files[0], (value) => {
                        setPhoto(value);
                        clearError("photo");
                      }),
                    )
                  }
                />
              </label>
            </div>
          </div>
          {errors.photo && (
            <p id="submission-photo-error" className="field-error" role="alert">
              {errors.photo}
            </p>
          )}
          <details className="disposal-upload" open={Boolean(disposalPhoto)}>
            <summary>
              <Trash2 size={18} aria-hidden="true" /> เพิ่มรูปที่ 2 (ไม่บังคับ)
            </summary>
            <p>เช่น วางขยะให้ครูนับง่าย หรือถ่ายถังขยะให้ชัดขึ้น</p>
            {disposalPhoto && (
              <img
                className="upload-preview"
                src={disposalPhoto}
                alt="ภาพถังหรือจุดทิ้งที่เลือก"
              />
            )}
            <div className="upload-buttons">
              <label className="btn secondary">
                <Camera size={18} aria-hidden="true" /> ถ่ายรูปจุดทิ้ง
                <input
                  aria-label="ถ่ายรูปจุดทิ้ง"
                  disabled={busy}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) =>
                    run(() => readImage(e.target.files[0], setDisposalPhoto))
                  }
                />
              </label>
              <label className="btn secondary">
                <Upload size={18} aria-hidden="true" /> เลือกรูปจุดทิ้ง
                <input
                  aria-label="เลือกรูปจุดทิ้ง"
                  disabled={busy}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    run(() => readImage(e.target.files[0], setDisposalPhoto))
                  }
                />
              </label>
              {disposalPhoto && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDisposalPhoto("")}
                >
                  <Trash2 size={16} aria-hidden="true" /> ลบรูปที่ 2
                </button>
              )}
            </div>
          </details>
          <Field label="ประเภทขยะ">
            <div className="category-grid" data-field="category" tabIndex={-1}>
              {data.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={c === category}
                  className={c === category ? "selected" : ""}
                  onClick={() => {
                    setCategory(c);
                    clearError("category");
                  }}
                >
                  <WasteIcon category={c} /> {categoryLabel(c)}
                  <small>
                    {(data.recyclingRates || recyclingRates)[c].coins === null
                      ? "รอครูกำหนดแต้ม"
                      : `${(data.recyclingRates || recyclingRates)[c].coins} Coins / ${(data.recyclingRates || recyclingRates)[c].unit}`}
                  </small>
                </button>
              ))}
            </div>
          </Field>
          {errors.category && (
            <p className="field-error" role="alert">
              {errors.category}
            </p>
          )}
          <Field
            label={`จำนวน (${(data.recyclingRates || recyclingRates)[category].unit})`}
          >
            <input
              data-field="count"
              aria-invalid={Boolean(errors.count)}
              aria-describedby={
                errors.count
                  ? "submission-count-error submission-count-help"
                  : "submission-count-help"
              }
              type="number"
              inputMode="numeric"
              min="1"
              max={maxRecyclingCount}
              step="1"
              required
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                clearError("count");
              }}
              placeholder="เช่น 2"
            />
          </Field>
          <small id="submission-count-help">
            นับเป็น{(data.recyclingRates || recyclingRates)[category].unit}{" "}
            ใช้จำนวนเต็ม 1–{maxRecyclingCount}
          </small>
          {errors.count && (
            <p id="submission-count-error" className="field-error" role="alert">
              {errors.count}
            </p>
          )}
          <div className="coin-estimate" aria-live="polite">
            <strong>
              <Coins className="gold-coin-icon" size={25} aria-hidden="true" />
              {(data.recyclingRates || recyclingRates)[category].coins === null
                ? "Coins รอครูตรวจและกำหนด"
                : estimateCoins(
                      category,
                      count,
                      data.recyclingRates || recyclingRates,
                    ) == null
                  ? "ใส่จำนวนเพื่อดู Coins ที่จะได้"
                  : `คาดว่าจะได้ ${estimateCoins(category, count, data.recyclingRates || recyclingRates)} Coins`}
            </strong>
            <p>{(data.recyclingRates || recyclingRates)[category].rule}</p>
            <small>ส่งครั้งละหนึ่งประเภท ครูตรวจจำนวนจากรูปก่อนให้ Coins</small>
          </div>
          <Field label="ฝากข้อความถึงคุณครู (ไม่บังคับ)">
            <textarea
              data-field="note"
              aria-invalid={Boolean(errors.note)}
              aria-describedby={
                errors.note ? "submission-note-error" : undefined
              }
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                clearError("note");
              }}
              maxLength={150}
              placeholder="เช่น ล้างขวดและแกะฉลากแล้ว"
            />
          </Field>
          {errors.note && (
            <p id="submission-note-error" className="field-error" role="alert">
              {errors.note}
            </p>
          )}
          <div className="submission-actions">
            <button
              className="btn primary"
              type="submit"
              style={{ width: "100%" }}
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle
                    className="submission-spinner"
                    size={19}
                    aria-hidden="true"
                  />{" "}
                  กำลังดำเนินการ…
                </>
              ) : (
                <>
                  ส่งรูปให้คุณครูตรวจ <ArrowRight size={19} />
                </>
              )}
            </button>
            <span role="status" aria-live="polite">
              {busy
                ? "กำลังเตรียมรูปหรือส่งรายการ กรุณารอสักครู่"
                : "ตรวจรูป ประเภท และจำนวนก่อนส่ง"}
            </span>
          </div>
          <p className="submission-feedback">
            ส่งไม่สำเร็จ? รูปและจำนวนยังอยู่ กดส่งอีกครั้งได้เลย
            ไม่แน่ใจว่าทิ้งถังไหน ถามครูผู้ดูแลก่อน
          </p>
        </form>
      </section>
      <aside>
        <div className="student-card">
          <span className="avatar large">{student.name[0]}</span>
          <h2>{student.name}</h2>
          <p>
            ม.{student.grade}/{student.room} · เลขที่ {student.number || "—"} ·{" "}
            {student.id}
          </p>
          <span className="badge approved">กำลังใช้บัญชีนี้</span>
          <button className="text-button" onClick={() => identify("submit")}>
            เปลี่ยนบัญชี
          </button>
        </div>
      </aside>
    </div>
  );
}
