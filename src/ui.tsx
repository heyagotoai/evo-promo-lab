import type { CSSProperties, ReactNode } from "react";

export function Button({
  children,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button className={`btn${variant === "primary" ? " primary" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="lbl">
      {label}
      {children}
    </label>
  );
}

export function Checks({
  items,
  value,
  onToggle,
}: {
  items: { id: string; label: string }[];
  value: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="checks">
      {items.map((it) => (
        <label key={it.id} className={`check${value[it.id] ? " on" : ""}`}>
          <input type="checkbox" checked={!!value[it.id]} onChange={() => onToggle(it.id)} />
          {it.label}
        </label>
      ))}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  step = "0.1",
  min = "0",
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
}) {
  return (
    <input
      className="field"
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ""}`}>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Callout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warn" | "ok" | "bad";
}) {
  return (
    <div className={`callout ${tone}`}>
      <b>{title}</b>
      <div className="small">{children}</div>
    </div>
  );
}

export function Table({
  headers,
  rows,
  align,
  tones,
}: {
  headers: string[];
  rows: ReactNode[][];
  align?: Array<"l" | "r">;
  tones?: Array<"ok" | "warn" | "bad" | "info" | "neutral" | undefined>;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={align?.[i] === "r" ? "r" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={align?.[ci] === "r" ? "r" : undefined}>
                  {ci === 0 && tones?.[ri] && tones[ri] !== "neutral" ? (
                    <span className={`dot ${tones[ri]}`} />
                  ) : null}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Series = { name: string; data: number[]; color: string };

export function LineChart({
  categories,
  series,
  suffix = "",
  reference,
}: {
  categories: string[];
  series: Series[];
  suffix?: string;
  reference?: { value: number; label: string };
}) {
  const w = 640;
  const h = 220;
  const pad = { l: 48, r: 12, t: 16, b: 28 };
  const all = series.flatMap((s) => s.data);
  if (reference) all.push(reference.value);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) =>
    pad.l + (categories.length <= 1 ? iw / 2 : (i / (categories.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - min) / span) * ih;
  const ticks = [min, min + span / 2, max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="map" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#2a2a2a" />
          <text x={4} y={y(t) + 4} fill="#9a9894" fontSize={10}>
            {Math.round(t)}
            {suffix}
          </text>
        </g>
      ))}
      {reference ? (
        <g>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="#e6b800"
            strokeDasharray="4 3"
          />
          <text x={w - pad.r - 4} y={y(reference.value) - 4} fill="#e6b800" fontSize={10} textAnchor="end">
            {reference.label}
          </text>
        </g>
      ) : null}
      {series.map((s) => {
        const d = s.data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            {s.data.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
            ))}
          </g>
        );
      })}
      {categories.map((c, i) =>
        i % Math.ceil(categories.length / 8) === 0 || i === categories.length - 1 ? (
          <text key={c + i} x={x(i)} y={h - 8} fill="#9a9894" fontSize={10} textAnchor="middle">
            {c}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function wrapCat(s: string): string[] {
  const words = s.split(" ");
  if (s.length <= 13 || words.length < 2) return [s];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const d = Math.abs(a - b);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export function BarChart({
  categories,
  values,
  suffix = "",
}: {
  categories: Array<string | string[]>;
  values: number[];
  suffix?: string;
}) {
  const labels = categories.map((c) => (Array.isArray(c) ? c : wrapCat(c)));
  const linesN = Math.max(1, ...labels.map((l) => l.length));
  const w = 640;
  const pad = { l: 12, r: 12, t: 24, b: 22 + linesN * 16 };
  const h = 210 + pad.b;
  const max = Math.max(...values, 1);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bw = iw / Math.max(categories.length, 1) - 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="map" role="img">
      {values.map((v, i) => {
        const bh = (Math.max(v, 0) / max) * ih;
        const x = pad.l + i * (iw / categories.length) + 4;
        const y = pad.t + ih - bh;
        const cx = x + bw / 2;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill="#3dd68c" />
            <text x={cx} y={y - 6} fill="#e8e6e3" fontSize={10} textAnchor="middle">
              {Math.round(v)}
              {suffix}
            </text>
            {labels[i].map((line, li) => (
              <text
                key={line + li}
                x={cx}
                y={pad.t + ih + 14 + li * 14}
                fill="#c4c2be"
                fontSize={11}
                textAnchor="middle"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function pln(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} zł`;
}

export const chartBlue = "#60a5fa";
export const chartGreen = "#3dd68c";
export function spacerStyle(h: number): CSSProperties {
  return { height: h };
}
