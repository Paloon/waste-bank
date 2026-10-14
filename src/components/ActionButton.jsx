import React from "react";

export default function ActionButton({
  busy,
  disabled = false,
  children,
  ...props
}) {
  return (
    <button className="btn primary" disabled={busy || disabled} {...props}>
      {busy ? "กำลังดำเนินการ…" : children}
    </button>
  );
}
