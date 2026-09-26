import React, { useState, useRef } from "react";
import {
  NotebookPen,
  Milk,
  ShoppingBag,
  PenTool,
  Award,
  Gift,
  ArrowLeft,
  ArrowRight,
  Leaf,
  Recycle,
} from "lucide-react";
const statusLabels = {
  Pending: "รอตรวจสอบ",
  Approved: "อนุมัติแล้ว",
  Rejected: "ไม่อนุมัติ",
  Cancelled: "ยกเลิกแล้ว",
  "Pending Pickup": "รอรับรางวัล",
  Completed: "รับรางวัลแล้ว",
};
const icons = {
  notebook: NotebookPen,
  bottle: Milk,
  bag: ShoppingBag,
  pen: PenTool,
  badge: Award,
};
export function Badge({ status }) {
  return (
    <span className={"badge " + status.toLowerCase().replaceAll(" ", "-")}>
      {statusLabels[status] || status}
    </span>
  );
}
export function RewardArt({ reward, onOpen }) {
  const [index, setIndex] = useState(0),
    gesture = useRef(null);
  const images = reward.images?.length
    ? reward.images
    : reward.image
      ? [{ src: reward.image, zoom: 1, x: 0, y: 0 }]
      : [];
  const safeIndex = Math.min(index, Math.max(0, images.length - 1)),
    current = images[safeIndex],
    Icon = icons[reward.icon] || Gift;
  return (
    <div
      className="reward-art"
      style={{ background: reward.color || "#e3eddf" }}
    >
      {current ? (
        <button
          type="button"
          className="reward-image-button"
          aria-label={`ดูรูป ${reward.name} แบบเต็ม`}
          onPointerDown={(e) => {
            gesture.current =
              e.pointerType === "touch"
                ? { x: e.clientX, swiped: false }
                : null;
          }}
          onPointerUp={(e) => {
            if (
              gesture.current &&
              images.length > 1 &&
              Math.abs(e.clientX - gesture.current.x) > 40
            ) {
              gesture.current.swiped = true;
              setIndex(
                (safeIndex +
                  (e.clientX < gesture.current.x ? 1 : -1) +
                  images.length) %
                  images.length,
              );
            }
          }}
          onPointerCancel={() => (gesture.current = null)}
          onClick={() => {
            if (gesture.current?.swiped) {
              gesture.current = null;
              return;
            }
            gesture.current = null;
            onOpen?.(images, safeIndex);
          }}
        >
          <img
            src={current.src}
            alt={reward.name}
            style={{
              transform: `translate(${current.x || 0}%,${current.y || 0}%) scale(${current.zoom || 1})`,
            }}
          />
        </button>
      ) : (
        <Icon size={68} strokeWidth={1.25} />
      )}
      <span className="art-label">ECO COLLECTION</span>
      {images.length > 1 && (
        <>
          <button
            type="button"
            className="gallery-arrow prev"
            aria-label="รูปก่อนหน้า"
            onClick={() =>
              setIndex((safeIndex - 1 + images.length) % images.length)
            }
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            className="gallery-arrow next"
            aria-label="รูปถัดไป"
            onClick={() => setIndex((safeIndex + 1) % images.length)}
          >
            <ArrowRight size={17} />
          </button>
          <span className="gallery-count">
            {safeIndex + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ text = "ยังไม่มีรายการ" }) {
  return (
    <div className="empty">
      <Leaf size={36} />
      <p>{text}</p>
    </div>
  );
}
export function Photo({ src, onClick }) {
  return src ? (
    <button
      className="photo"
      onClick={() => onClick(src)}
      aria-label="ขยายภาพหลักฐาน"
    >
      <img src={src} alt="ภาพขยะที่ส่ง" />
    </button>
  ) : (
    <div className="photo no-photo">
      <Recycle />
      <small>ไม่มีรูป</small>
    </div>
  );
}
export function RewardImageEditor({ images, onChange, readImage, run }) {
  const [selected, setSelected] = useState(0),
    drag = useRef(null),
    index = Math.min(selected, Math.max(0, images.length - 1)),
    current = images[index];
  const update = (patch) =>
    onChange(
      images.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const limit = (zoom) => Math.max(0, ((zoom - 1) * 50) / zoom);
  const add = (files) =>
    run(async () => {
      if (images.length + files.length > 5)
        throw new Error("เพิ่มรูปสินค้าได้สูงสุด 5 รูป");
      const added = [];
      for (const file of files)
        await readImage(file, (src) =>
          added.push({ src, zoom: 1, x: 0, y: 0 }),
        );
      onChange([...images, ...added]);
      setSelected(images.length);
    });
  const move = (direction) => {
    const next = [...images],
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setSelected(target);
  };
  return (
    <div className="reward-editor">
      <div className="reward-editor-head">
        <b>รูปสินค้า ({images.length}/5)</b>
        <label className="btn secondary">
          เพิ่มรูป
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              add([...e.target.files]);
              e.target.value = "";
            }}
            disabled={images.length >= 5}
          />
        </label>
      </div>
      {current && (
        <>
          <p className="muted">
            ลากรูปในกรอบเพื่อจัดตำแหน่ง แล้วปรับระดับซูม รูปเต็มจะยังเปิดดูได้
          </p>
          <div
            className="crop-stage"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                x: current.x || 0,
                y: current.y || 0,
                width: e.currentTarget.clientWidth,
                height: e.currentTarget.clientHeight,
              };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const max = limit(current.zoom || 1);
              update({
                x: Math.max(
                  -max,
                  Math.min(
                    max,
                    drag.current.x +
                      (((e.clientX - drag.current.clientX) /
                        drag.current.width) *
                        100) /
                        (current.zoom || 1),
                  ),
                ),
                y: Math.max(
                  -max,
                  Math.min(
                    max,
                    drag.current.y +
                      (((e.clientY - drag.current.clientY) /
                        drag.current.height) *
                        100) /
                        (current.zoom || 1),
                  ),
                ),
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <img
              src={current.src}
              alt="ตัวอย่างกรอบรูปรางวัล"
              draggable="false"
              style={{
                transform: `translate(${current.x || 0}%,${current.y || 0}%) scale(${current.zoom || 1})`,
              }}
            />
          </div>
          <Field label={`ซูม ${Math.round((current.zoom || 1) * 100)}%`}>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={current.zoom || 1}
              onChange={(e) => {
                const zoom = Number(e.target.value),
                  max = limit(zoom);
                update({
                  zoom,
                  x: Math.max(-max, Math.min(max, current.x || 0)),
                  y: Math.max(-max, Math.min(max, current.y || 0)),
                });
              }}
            />
          </Field>
          <div className="reward-editor-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => update({ zoom: 1, x: 0, y: 0 })}
            >
              รีเซ็ตกรอบ
            </button>
            <button
              type="button"
              className="text-button"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              เลื่อนรูปไปซ้าย
            </button>
            <button
              type="button"
              className="text-button"
              disabled={index === images.length - 1}
              onClick={() => move(1)}
            >
              เลื่อนรูปไปขวา
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() => {
                onChange(images.filter((_, i) => i !== index));
                setSelected(Math.max(0, index - 1));
              }}
            >
              ลบรูปนี้
            </button>
          </div>
          <div className="reward-thumbs">
            {images.map((item, i) => (
              <button
                type="button"
                key={i}
                className={i === index ? "selected" : ""}
                aria-label={`แก้ไขรูปที่ ${i + 1}`}
                onClick={() => setSelected(i)}
              >
                <img src={item.src} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
