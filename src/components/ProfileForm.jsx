import React from "react";
import { Field } from "../components.jsx";
import { policy } from "../../shared/policy.js";
export default function ProfileForm({ p, adminMode = false }) {
  return (
    <>
      <Field label="ชื่อ–นามสกุล">
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={p.name}
        />
      </Field>
      <div className="form-grid">
        <Field label="เลขที่">
          <input
            name="number"
            type="number"
            min="1"
            max={policy.maxNumber}
            required
            defaultValue={p.number || ""}
          />
        </Field>
        <Field label="ระดับชั้น">
          <select name="grade" defaultValue={p.grade}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="ห้อง">
          <input
            name="room"
            type="number"
            min="1"
            max={policy.maxRoom}
            required
            defaultValue={p.room}
          />
        </Field>
      </div>
      {adminMode && (
        <Field label="สถานะ">
          <select name="status" defaultValue={p.status}>
            {["Active", "Alumni", "Transferred", "Inactive"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}
