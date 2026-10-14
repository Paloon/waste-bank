let nextId = 0;
export function fieldMessage(control) {
  const label =
    control.getAttribute("aria-label") ||
    control.closest(".field")?.querySelector("span")?.textContent ||
    "ข้อมูลช่องนี้";
  if (control.type === "checkbox" && control.validity.valueMissing)
    return "กรุณาทำเครื่องหมายยืนยันก่อนดำเนินการ";
  if (control.required && !control.value.trim())
    return `กรอก${label}ก่อนยืนยัน`;
  if (control.validity.badInput) return `กรอก${label}เป็นตัวเลข`;
  if (control.validity.rangeUnderflow)
    return `${label}ต้องไม่น้อยกว่า ${control.min}`;
  if (control.validity.rangeOverflow)
    return `${label}ต้องไม่เกิน ${control.max}`;
  if (control.validity.stepMismatch)
    return control.step === "1" || !control.step
      ? `${label}ต้องเป็นจำนวนเต็ม`
      : `ตรวจสอบ${label}ให้ตรงช่วงที่กำหนด`;
  if (
    control.value.length > 0 &&
    control.minLength > 0 &&
    control.value.length < control.minLength
  )
    return `${label}ต้องมีอย่างน้อย ${control.minLength} ตัวอักษร`;
  if (control.validity.patternMismatch) return `ตรวจสอบรูปแบบ${label}อีกครั้ง`;
  if (control.validity.tooLong)
    return `${label}ต้องไม่เกิน ${control.maxLength} ตัวอักษร`;
  if (!control.validity.valid) return `ตรวจสอบ${label}อีกครั้ง`;
  return "";
}
export function clearFieldError(control) {
  const id = control.dataset?.formErrorId;
  if (!id) return;
  control.ownerDocument.getElementById(id)?.remove();
  const described = (control.getAttribute("aria-describedby") || "")
    .split(" ")
    .filter((value) => value && value !== id);
  if (described.length)
    control.setAttribute("aria-describedby", described.join(" "));
  else control.removeAttribute("aria-describedby");
  control.removeAttribute("aria-invalid");
  delete control.dataset.formErrorId;
}
export function showFieldError(control) {
  clearFieldError(control);
  const message = fieldMessage(control);
  if (!message) return false;
  const id = `form-field-error-${++nextId}`;
  const error = control.ownerDocument.createElement("small");
  error.id = id;
  error.className = "field-error";
  error.setAttribute("role", "alert");
  error.textContent = message;
  control.insertAdjacentElement("afterend", error);
  control.dataset.formErrorId = id;
  control.setAttribute("aria-invalid", "true");
  control.setAttribute(
    "aria-describedby",
    [control.getAttribute("aria-describedby"), id].filter(Boolean).join(" "),
  );
  return true;
}
export function validateForm(form) {
  let first;
  for (const control of form.elements) {
    if (
      !control.willValidate ||
      !["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName)
    )
      continue;
    if (showFieldError(control)) first ||= control;
  }
  first?.focus();
  return !first;
}
export function handleInvalid(event) {
  event.preventDefault();
  showFieldError(event.target);
  event.target.form?.querySelector('[aria-invalid="true"]')?.focus();
}
