// Staff account management from the web. Only admins may change other accounts;
// every change is confirmed with the admin's own PIN and recorded in the audit log.
import { z } from "zod";
import { assert } from "./errors.js";

const accountId = z.string().regex(/^[a-zA-Z0-9._-]{3,80}$/);
const newPin = z.string().regex(/^\d{8,12}$/);
export const staffChange = z.object({
  op: z.enum(["create", "update", "ownPin"]),
  id: accountId.optional(),
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["staff", "admin"]).optional(),
  enabled: z.boolean().optional(),
  newPin: newPin.optional(),
  // The signed-in account's current PIN, re-entered to confirm the change.
  pin: z.string().min(1).max(128),
});

export const isAdmin = (account) => account?.role === "admin";
export const staffAccountView = (a) => ({
  id: a.id,
  name: a.name,
  role: isAdmin(a) ? "admin" : "staff",
  enabled: a.enabled !== false,
});
const activeAdmins = (staff) =>
  staff.filter((x) => isAdmin(x) && x.enabled !== false).length;

/**
 * Apply one change to the staff list in place. `hashPin` is passed in so callers
 * hash outside any retrying transaction. Returns audit details without PINs.
 */
export function applyStaffChange(staff, actorId, change, pinHash) {
  const me = staff.find((x) => x.id === actorId);
  if (change.op === "ownPin") {
    assert(pinHash, "กรุณาตั้ง PIN ใหม่ 8–12 หลัก");
    me.pin = pinHash;
    me.authVersion = (me.authVersion || 0) + 1;
    return { action: "staff:ownPin", target: me.id, before: null, after: null };
  }
  assert(isAdmin(me), "เฉพาะผู้ดูแลระบบเท่านั้น", 403);
  assert(change.id, "กรุณาระบุชื่อบัญชี");
  const index = staff.findIndex((x) => x.id === change.id);
  const before = index >= 0 ? staffAccountView(staff[index]) : null;
  let account;
  if (change.op === "create") {
    assert(index < 0, "มีชื่อบัญชีนี้แล้ว", 409);
    assert(change.name && pinHash, "กรุณากรอกชื่อและ PIN เริ่มต้น 8–12 หลัก");
    account = {
      id: change.id,
      name: change.name,
      role: change.role || "staff",
      enabled: true,
      authVersion: 0,
      pin: pinHash,
    };
  } else {
    assert(index >= 0, "ไม่พบบัญชีเจ้าหน้าที่", 404);
    account = { ...staff[index] };
    if (change.name) account.name = change.name;
    if (change.role) account.role = change.role;
    if (change.enabled !== undefined) account.enabled = change.enabled;
    if (pinHash) account.pin = pinHash;
    // A new PIN or a disabled account ends that account's open sessions.
    if (pinHash || change.enabled === false)
      account.authVersion = (account.authVersion || 0) + 1;
  }
  // Check the result before touching the list, so a refused change leaves no trace.
  const next =
    index >= 0
      ? staff.map((x, i) => (i === index ? account : x))
      : [...staff, account];
  assert(
    activeAdmins(next) > 0,
    "ต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี",
  );
  if (index >= 0) staff[index] = account;
  else staff.push(account);
  return {
    action: "staff:" + change.op,
    target: account.id,
    before,
    after: { ...staffAccountView(account), pinReset: Boolean(pinHash) },
  };
}
