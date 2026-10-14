import React, { useState } from "react";
import { Field } from "../../components.jsx";
import { studentTitles } from "../../../shared/student-name.js";

export default function RegistrationNameFields() {
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  return (
    <>
      <Field label="คำนำหน้า">
        <select
          name="title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        >
          <option value="" disabled>
            เลือกคำนำหน้า
          </option>
          {studentTitles.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ชื่อ–นามสกุล">
        <input
          name="name"
          required
          minLength={2}
          maxLength={
            80 -
            (title.length ||
              Math.max(...studentTitles.map((value) => value.length)))
          }
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ชื่อและนามสกุล ไม่ต้องใส่คำนำหน้า"
          aria-describedby="registration-name-hint"
        />
      </Field>
      <p id="registration-name-hint" className="muted">
        {title && name.trim() ? (
          <>
            ชื่อที่จะบันทึก:{" "}
            <strong>
              {title}
              {name.trim()}
            </strong>
          </>
        ) : (
          "เลือกคำนำหน้าและกรอกชื่อ–นามสกุล ระบบจะบันทึกเป็นชื่อเดียวกัน"
        )}
      </p>
    </>
  );
}
