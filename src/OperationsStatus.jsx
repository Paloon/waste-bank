import React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";

export default function OperationsStatus({ health, compact = false, onOpen }) {
  if (!health?.status) return null;
  const { alerts, ok } = health.status;
  // Outside the overview a healthy system shows nothing, and problems take one line.
  if (compact) {
    if (ok) return null;
    return (
      <div className="operations-strip" role="status">
        <AlertCircle size={18} aria-hidden="true" />
        <span>ระบบมี {alerts.length} เรื่องที่ต้องดูแล</span>
        <button type="button" onClick={onOpen}>
          ดูรายละเอียด
        </button>
      </div>
    );
  }
  return (
    <section className="panel operations-status" aria-label="สถานะการดูแลระบบ">
      <h2>
        {ok ? (
          <ShieldCheck size={22} aria-hidden="true" />
        ) : (
          <AlertCircle size={22} aria-hidden="true" />
        )}{" "}
        สถานะการดูแลระบบ
      </h2>
      {ok ? (
        <p>ผลสำรองข้อมูล งานดูแลรูป และการซ้อมกู้คืนอยู่ในช่วงเวลาที่กำหนด</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.code}>{alert.message}</li>
          ))}
        </ul>
      )}
      {!ok && (
        <small>
          แจ้งผู้ดูแลโรงเรียนตรวจรายการข้างต้น · กดอัปเดตเพื่อตรวจผลล่าสุด
        </small>
      )}
      {health.restore?.verified &&
        health.restore.method === "isolated-sqlite" && (
          <small>
            ผลซ้อมกู้คืนเป็นการตรวจในพื้นที่แยก
            ยังไม่รวมการนำฐานข้อมูลและรูปกลับขึ้นเว็บจริง
          </small>
        )}
    </section>
  );
}
