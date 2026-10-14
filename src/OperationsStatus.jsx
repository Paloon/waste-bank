import React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";

export default function OperationsStatus({ health }) {
  if (!health?.status) return null;
  const { alerts, ok } = health.status;
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
