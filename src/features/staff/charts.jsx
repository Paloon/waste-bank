import React, { useState } from "react";

// Categorical slots in fixed order (validated for colour-blind separation).
// Lighter slots sit below 3:1 on white, so every chart also lists its values.
export const seriesColors = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
];
export const otherColor = "#9aa59c";
const fmt = (n) => Number(n || 0).toLocaleString("th-TH");
const percent = (part, whole) =>
  whole ? Math.round((part / whole) * 100) + "%" : "0%";

/** Keep the largest `keep` parts and fold the rest into "อื่น ๆ". */
export function foldParts(parts, keep = 4) {
  const sorted = [...parts]
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep);
  return [
    ...sorted.slice(0, keep),
    {
      key: "__other",
      label: `อื่น ๆ (${rest.length} ประเภท)`,
      value: rest.reduce((n, p) => n + p.value, 0),
      other: true,
    },
  ];
}

/**
 * Donut with the total in the middle and a legend that doubles as the table:
 * every part shows its name, amount and share, so colour is never the only cue.
 */
export function Donut({
  parts,
  unit,
  label,
  empty = "ยังไม่มีข้อมูลในช่วงนี้",
}) {
  const [active, setActive] = useState(null);
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <p className="chart-empty">{empty}</p>;
  const r = 52,
    c = 2 * Math.PI * r,
    gap = parts.length > 1 ? 2.5 : 0;
  let offset = 0;
  const color = (p, i) => p.color || (p.other ? otherColor : seriesColors[i]);
  const shown = active == null ? null : parts[active];
  return (
    <div className="donut-chart">
      <svg viewBox="0 0 140 140" role="img" aria-label={label}>
        <circle className="donut-track" cx="70" cy="70" r={r} />
        <g transform="rotate(-90 70 70)">
          {parts.map((p, i) => {
            const length = (p.value / total) * c;
            const dash = Math.max(0.5, length - gap);
            const segment = (
              <circle
                key={p.key}
                cx="70"
                cy="70"
                r={r}
                stroke={color(p, i)}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                className={active === i ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <title>
                  {p.label}: {fmt(p.value)} {unit} ({percent(p.value, total)})
                </title>
              </circle>
            );
            offset += length;
            return segment;
          })}
        </g>
        <text x="70" y="66" className="donut-total">
          {fmt(shown ? shown.value : total)}
        </text>
        <text x="70" y="86" className="donut-unit">
          {shown ? percent(shown.value, total) : unit}
        </text>
      </svg>
      <ul className="chart-legend">
        {parts.map((p, i) => (
          <li
            key={p.key}
            className={active === i ? "active" : ""}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <i style={{ background: color(p, i) }} aria-hidden="true" />
            <span>{p.label}</span>
            <b>{fmt(p.value)}</b>
            <small>{percent(p.value, total)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars in one hue: name, bar and figure on each row. */
export function BarList({ rows, unit, empty = "ยังไม่มีข้อมูลในช่วงนี้" }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!max) return <p className="chart-empty">{empty}</p>;
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.label}</span>
          <div aria-hidden="true">
            <i style={{ width: (r.value / max) * 100 + "%" }} />
          </div>
          <b>
            {fmt(r.value)} <small>{unit}</small>
          </b>
        </li>
      ))}
    </ul>
  );
}

/** One bar per day (or per month for long ranges), with a tap/hover readout. */
export function ColumnChart({ columns, unit, label }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...columns.map((c) => c.value));
  if (!columns.some((c) => c.value))
    return <p className="chart-empty">ยังไม่มีข้อมูลในช่วงนี้</p>;
  const shown = columns[active ?? -1];
  const ticks = new Set([
    0,
    Math.floor((columns.length - 1) / 2),
    columns.length - 1,
  ]);
  return (
    <div className="column-chart">
      <p className="column-readout" aria-live="polite">
        {shown ? (
          <>
            <b>{shown.label}</b> · {fmt(shown.value)} {unit}
          </>
        ) : (
          <>
            แตะแท่งเพื่อดูตัวเลข · สูงสุด {fmt(max)} {unit}/วัน
          </>
        )}
      </p>
      <div className="columns" role="img" aria-label={label}>
        {columns.map((c, i) => (
          <div
            key={c.key}
            className={"column" + (active === i ? " active" : "")}
            title={`${c.label}: ${fmt(c.value)} ${unit}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(i)}
          >
            <i
              style={{
                height: c.value ? Math.max(3, (c.value / max) * 100) + "%" : 0,
              }}
            />
          </div>
        ))}
      </div>
      <div className="column-ticks" aria-hidden="true">
        {columns.map((c, i) => (
          <span key={c.key}>{ticks.has(i) ? c.short : ""}</span>
        ))}
      </div>
    </div>
  );
}
