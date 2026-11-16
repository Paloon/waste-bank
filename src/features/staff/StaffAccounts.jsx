import React, { useEffect, useState } from "react";
import { UserPlus, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../../api.js";
import { Field } from "../../components.jsx";
import ActionButton from "../../components/ActionButton.jsx";

const roleLabel = { admin: "ผู้ดูแลระบบ", staff: "เจ้าหน้าที่" };
const pinField = (name, label, hint) => (
  <Field label={label}>
    <input
      name={name}
      type="password"
      inputMode="numeric"
      autoComplete={name === "pin" ? "current-password" : "new-password"}
      pattern={name === "pin" ? undefined : "\\d{8,12}"}
      title={hint}
      required={name === "pin"}
      placeholder={hint}
    />
  </Field>
);

/** One form per change; each asks for the signed-in staff member's PIN again. */
function AccountForm({ account, onSave, onCancel, busy }) {
  const creating = !account;
  return (
    <form
      className="staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.currentTarget));
        onSave(
          creating
            ? {
                op: "create",
                id: v.id.trim(),
                name: v.name,
                role: v.role,
                newPin: v.newPin,
                pin: v.pin,
              }
            : {
                op: "update",
                id: account.id,
                name: v.name,
                role: v.role,
                enabled: v.enabled === "on",
                ...(v.newPin ? { newPin: v.newPin } : {}),
                pin: v.pin,
              },
        );
      }}
    >
      {creating && (
        <Field label="ชื่อบัญชี (ใช้ตอนเข้าสู่ระบบ)">
          <input
            name="id"
            required
            pattern="[a-zA-Z0-9._\-]{3,80}"
            title="ตัวอักษรอังกฤษ ตัวเลข จุด ขีด 3–80 ตัว"
            placeholder="เช่น teacher.somchai"
            autoCapitalize="none"
          />
        </Field>
      )}
      <Field label="ชื่อที่แสดง">
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={account?.name}
          placeholder="เช่น ครูสมชาย"
        />
      </Field>
      <Field label="สิทธิ์">
        <select name="role" defaultValue={account?.role || "staff"}>
          <option value="staff">
            เจ้าหน้าที่ · ตรวจขยะ ส่งมอบรางวัล ดูรายงาน
          </option>
          <option value="admin">
            ผู้ดูแลระบบ · ทำได้ทุกอย่าง และจัดการเจ้าหน้าที่
          </option>
        </select>
      </Field>
      {!creating && (
        <label className="check-row">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={account.enabled}
          />
          เปิดใช้งานบัญชีนี้
        </label>
      )}
      {pinField(
        "newPin",
        creating ? "PIN เริ่มต้น" : "ตั้ง PIN ใหม่ (เว้นว่างถ้าไม่เปลี่ยน)",
        "ตัวเลข 8–12 หลัก",
      )}
      {creating && (
        <p className="muted small">
          แจ้ง PIN ให้เจ้าของบัญชีโดยตรง แล้วให้เปลี่ยนเองที่ “PIN ของฉัน”
        </p>
      )}
      <hr />
      {pinField("pin", "ยืนยันด้วย PIN ของคุณ", "PIN ที่คุณใช้เข้าสู่ระบบ")}
      <div className="button-row">
        <ActionButton busy={busy} type="submit">
          {creating ? "เพิ่มเจ้าหน้าที่" : "บันทึก"}
        </ActionButton>
        <button type="button" className="btn secondary" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

export default function StaffAccounts({ admin }) {
  const [accounts, setAccounts] = useState([]);
  const [self, setSelf] = useState("");
  const [editing, setEditing] = useState(null); // account id, "new" or "ownPin"
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  useEffect(() => {
    if (!admin) return;
    api("staff-accounts")
      .then((r) => {
        setAccounts(r.accounts);
        setSelf(r.self);
      })
      .catch((e) => setMessage({ text: e.message, error: true }));
  }, [admin]);
  async function save(change, done) {
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      const r = await api("staff-accounts", change);
      if (admin) setAccounts(r.accounts);
      setEditing(null);
      setMessage({ text: done, error: false });
    } catch (e) {
      setMessage({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {message.text && (
        <p
          role={message.error ? "alert" : "status"}
          className={message.error ? "danger" : "positive"}
        >
          {message.text}
        </p>
      )}
      <section className="panel settings-section">
        <h2>
          <KeyRound size={20} aria-hidden="true" /> PIN ของฉัน
        </h2>
        {editing === "ownPin" ? (
          <form
            className="staff-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Object.fromEntries(new FormData(e.currentTarget));
              save(
                { op: "ownPin", newPin: v.newPin, pin: v.pin },
                "เปลี่ยน PIN แล้ว ใช้ PIN ใหม่ครั้งถัดไปที่เข้าสู่ระบบ",
              );
            }}
          >
            {pinField("pin", "PIN ปัจจุบัน", "PIN ที่ใช้อยู่")}
            <Field label="PIN ใหม่">
              <input
                name="newPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="\d{8,12}"
                title="ตัวเลข 8–12 หลัก"
                required
                placeholder="ตัวเลข 8–12 หลัก"
              />
            </Field>
            <div className="button-row">
              <ActionButton busy={busy} type="submit">
                เปลี่ยน PIN
              </ActionButton>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn secondary"
            onClick={() => setEditing("ownPin")}
          >
            เปลี่ยน PIN ของฉัน
          </button>
        )}
      </section>
      {admin && (
        <section className="panel settings-section">
          <div className="section-heading">
            <h2>
              <ShieldCheck size={20} aria-hidden="true" /> เจ้าหน้าที่ทั้งหมด
            </h2>
            {editing !== "new" && (
              <button className="btn primary" onClick={() => setEditing("new")}>
                <UserPlus size={18} /> เพิ่ม
              </button>
            )}
          </div>
          {editing === "new" && (
            <AccountForm
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(c) => save(c, `เพิ่ม ${c.name} แล้ว`)}
            />
          )}
          <ul className="staff-list">
            {accounts.map((a) => (
              <li key={a.id} className={a.enabled ? "" : "disabled"}>
                <div className="staff-row">
                  <div className="grow">
                    <b>
                      {a.name}
                      {a.id === self && <small> (คุณ)</small>}
                    </b>
                    <small>
                      {a.id} · {roleLabel[a.role]}
                      {!a.enabled && " · ปิดใช้งาน"}
                    </small>
                  </div>
                  {editing !== a.id && (
                    <button
                      className="text-button"
                      onClick={() => setEditing(a.id)}
                    >
                      แก้ไข
                    </button>
                  )}
                </div>
                {editing === a.id && (
                  <AccountForm
                    account={a}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(c) => save(c, `บันทึก ${c.name} แล้ว`)}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">
            ปิดใช้งานหรือตั้ง PIN ใหม่แล้ว บัญชีนั้นจะออกจากระบบทุกเครื่องทันที
            ระบบต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี
          </p>
        </section>
      )}
    </>
  );
}
