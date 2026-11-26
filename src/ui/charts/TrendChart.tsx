"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatValue } from "../value-format";
export { formatValue };

export interface TrendPoint { date: string; value: number | null }

interface Props {
  points: TrendPoint[];
  color: string;
  kind?: "line" | "bar";
  height?: number;
  unit?: string;
  decimals?: number;
  /** Personal baseline: mean ± sd band. */
  baseline?: { mean: number; sd: number } | null;
  /** Reference line (e.g. sleep need). */
  target?: { value: number; label: string } | null;
  /** Format a value for the tooltip / axis (e.g. clock times). */
  format?: "number" | "clock" | "hours";
  clockBase?: number;
  /** Include zero in the y-domain (sums like steps). */
  zero?: boolean;
  label: string;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

/**
 * Daily trend chart with touch/mouse scrubbing. Lines connect consecutive days only — a missing day breaks the
 * line (never drawn as zero). Bars are omitted for missing days. Baseline shown as a translucent band.
 */
export function TrendChart({ points, color, kind = "line", height = 200, unit, decimals = 0, baseline, target, format = "number", clockBase = 0, zero, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const W = 1000, H = height, padT = 16, padB = 4;
  const n = points.length;

  const { lo, hi, ticks } = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
    if (baseline) vals.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
    if (target) vals.push(target.value);
    if (!vals.length) return { lo: 0, hi: 1, ticks: [] as number[] };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (zero || kind === "bar") lo = Math.min(0, lo);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    hi += pad; if (!(zero || kind === "bar")) lo -= pad;
    const step = niceStep((hi - lo) / 3);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }, [points, baseline, target, zero, kind]);

  const x = (i: number) => (n <= 1 ? W / 2 : kind === "bar" ? ((i + 0.5) / n) * W : (i / (n - 1)) * (W - 16) + 8);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const line = useMemo(() => {
    let d = "", area = "", segStart: number | null = null;
    points.forEach((p, i) => {
      if (p.value === null) { if (segStart !== null) { area += `L${x(i - 1)},${H}L${x(segStart)},${H}Z`; segStart = null; } return; }
      const cont = i > 0 && points[i - 1]!.value !== null;
      d += `${cont ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      if (!cont) { area += `M${x(i).toFixed(1)},${y(p.value).toFixed(1)}`; segStart = i; } else area += `L${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    });
    if (segStart !== null) area += `L${x(n - 1)},${H}L${x(segStart)},${H}Z`;
    return { d, area };
  }, [points, lo, hi]);

  function pick(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !n) return;
    const f = (clientX - r.left) / r.width;
    const i = Math.max(0, Math.min(n - 1, kind === "bar" ? Math.floor(f * n) : Math.round(f * (n - 1))));
    setIdx(i);
  }

  const values = points.filter((p) => p.value !== null);
  const sel = idx !== null ? points[idx]! : null;
  const fmt = (v: number) => formatValue(v, format, decimals, clockBase);
  const barW = Math.max(2, Math.min(28, (W / Math.max(1, n)) * 0.62));
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  if (!values.length) {
    return <div className="grid place-items-center rounded-2xl border border-dashed border-hairline text-[13px] text-ink-3" style={{ height }}>No data in this period</div>;
  }

  return (
    <div className="select-none">
      <div className="mb-1 h-5 text-[12px] font-semibold text-ink-2 tabular" aria-live="polite">
        {sel ? (<>{dayFmt.format(Date.parse(`${sel.date}T12:00:00Z`))} · <span className="text-ink">{sel.value === null ? "no data" : `${fmt(sel.value)}${unit ? ` ${unit}` : ""}`}</span></>) : height >= 160 ? <span className="text-ink-3">Touch and drag to inspect</span> : null}
      </div>
      <div className="flex gap-2">
        <div ref={ref} className="relative min-w-0 flex-1 touch-pan-y"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); }}
          onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) pick(e.clientX); }}
          onPointerLeave={() => setIdx(null)} onPointerUp={(e) => { if (e.pointerType !== "mouse") setTimeout(() => setIdx(null), 1600); }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }} role="img" aria-label={label}>
            <defs>
              <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--hairline)" vectorEffect="non-scaling-stroke" />)}
            {baseline && (
              <>
                <rect x={0} y={y(baseline.mean + baseline.sd)} width={W} height={Math.max(1, y(baseline.mean - baseline.sd) - y(baseline.mean + baseline.sd))} fill="var(--ink)" opacity={0.055} />
                <line x1={0} x2={W} y1={y(baseline.mean)} y2={y(baseline.mean)} stroke="var(--ink-3)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
              </>
            )}
            {target && <line x1={0} x2={W} y1={y(target.value)} y2={y(target.value)} stroke="var(--ink-2)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
            {kind === "line" ? (
              <>
                <path d={line.area} fill={`url(#a${gid})`} />
                <path d={line.d} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </>
            ) : (
              points.map((p, i) => p.value === null ? null : (
                <rect key={p.date} x={x(i) - barW / 2} y={Math.min(y(p.value), y(Math.max(0, lo)))} width={barW} height={Math.max(1.5, Math.abs(y(Math.max(0, lo)) - y(p.value)))}
                  rx={Math.min(6, barW / 2)} fill={color} opacity={idx === null || idx === i ? 1 : 0.4} />
              ))
            )}
            {sel && <line x1={x(idx!)} x2={x(idx!)} y1={0} y2={H} stroke="var(--ink-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* Dots in HTML so they stay round under the non-uniform SVG scale. */}
          {kind === "line" && points.map((p, i) => p.value === null || (n > 14 && i !== idx && i !== n - 1) ? null : (
            <span key={p.date} className="pointer-events-none absolute rounded-full border-2"
              style={{ left: `${(x(i) / W) * 100}%`, top: y(p.value), width: i === idx ? 11 : 7, height: i === idx ? 11 : 7, transform: "translate(-50%,-50%)", background: i === idx ? color : "var(--bg)", borderColor: color }} />
          ))}
        </div>
        <div className="relative w-9 shrink-0 text-[11px] font-medium text-ink-3 tabular" style={{ height: H }} aria-hidden="true">
          {ticks.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: y(v) }}>{format === "hours" ? `${Math.round(v)}h` : format === "number" && Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : fmt(v)}</span>)}
        </div>
      </div>
      <div className="relative mt-1.5 mr-11 h-4 text-[11px] font-medium text-ink-3 tabular" aria-hidden="true">
        {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery * 0.85) ? (
          <span key={p.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(i) / W) * 100}%` }}>{shortFmt.format(Date.parse(`${p.date}T12:00:00Z`))}</span>
        ) : null)}
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Tiny sparkline (no interaction) for tiles. */
export function Spark({ values, color, width = 72, height = 26 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (val: number) => 3 + (1 - (val - lo) / span) * (height - 6);
  let d = "";
  values.forEach((val, i) => { if (val === null) return; d += `${i > 0 && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`; });
  const lastI = values.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0).at(-1)!;
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(lastI)} cy={y(values[lastI]!)} r={2.5} fill={color} />
    </svg>
  );
}
