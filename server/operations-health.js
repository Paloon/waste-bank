const hour = 60 * 60 * 1000;
const recent = (record, now, maxAge) => {
  const time = Date.parse(record?.at);
  return (
    Number.isFinite(time) && time <= now + 5 * 60 * 1000 && now - time <= maxAge
  );
};

// Freshness is evidence of a completed run, never evidence that a scheduler exists.
export function operationsHealth(health, now = Date.now()) {
  const alerts = [];
  const add = (code, message) => alerts.push({ code, message });
  if (!recent(health.backup, now, 36 * hour))
    add(
      "BACKUP_STALE",
      "ยังไม่มีผลสำรองข้อมูลสำเร็จภายใน 36 ชั่วโมง กรุณาตรวจเครื่องสำรอง",
    );
  if (
    health.backupAttempt?.ok === false &&
    (!health.backup ||
      Date.parse(health.backupAttempt.at) >= Date.parse(health.backup.at))
  )
    add(
      "BACKUP_FAILED",
      "การสำรองข้อมูลครั้งล่าสุดไม่สำเร็จ กรุณาตรวจและสำรองใหม่",
    );
  if (!recent(health.maintenance, now, 36 * hour))
    add(
      "MAINTENANCE_STALE",
      "ยังไม่มีผลดูแลรูปสำเร็จภายใน 36 ชั่วโมง กรุณาตรวจงานตามเวลา",
    );
  if (
    health.maintenance?.failures ||
    health.maintenance?.overdue ||
    health.maintenance?.deletionFailed
  )
    add(
      "MEDIA_CLEANUP_PENDING",
      "งานจัดการรูปมีข้อผิดพลาดหรือค้างเกินหนึ่งวัน กรุณาตรวจและลองใหม่",
    );
  if (health.maintenance?.reconciliation?.ok === false)
    add(
      "RECONCILIATION_FAILED",
      "ยอด Coins หรือสต็อกไม่ตรงกับประวัติ กรุณาตรวจสอบก่อนทำรายการต่อ",
    );
  if (!health.restore?.verified || !recent(health.restore, now, 90 * 24 * hour))
    add("RESTORE_UNVERIFIED", "ยังไม่มีผลซ้อมกู้คืนที่บันทึกไว้ภายใน 90 วัน");
  if (recent(health.error, now, 24 * hour))
    add(
      "RECENT_ERROR",
      `ระบบมีข้อผิดพลาดล่าสุด (${health.error.code || "SERVER_ERROR"}) กรุณาตรวจบันทึกระบบ`,
    );
  return {
    ok: alerts.length === 0,
    checkedAt: new Date(now).toISOString(),
    alerts,
  };
}

export async function readOperationsHealth(store) {
  const names = ["maintenance", "backup", "backupAttempt", "restore", "error"];
  const entries = await Promise.all(
    names.map(async (name) => [
      name,
      await store.control("get", { id: `health:${name}` }),
    ]),
  );
  const health = Object.fromEntries(entries);
  return { ...health, status: operationsHealth(health) };
}
