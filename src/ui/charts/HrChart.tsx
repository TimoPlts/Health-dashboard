"use client";

import { useMemo, useRef, useState } from "react";

interface Props {
  samples: { tMs: number; bpm: number }[];
  /** Optional highlighted window (e.g. the workout) inside the chart domain. */
  startMs?: number;
  endMs?: number;
  fromMs: number; // chart domain
  toMs: number;
  timeZone: string;
  bands?: { name: string; lowerBpm: number; upperBpm: number }[];
  height?: number;
  /** Generic use (overnight HRV, SpO₂…): unit, colour, y-axis step/padding, decimals and texts. */
  unit?: string;
  color?: string;
  step?: number;
  pad?: number;
  decimals?: number;
  label?: string;
  emptyText?: string;
}

/**
 * Heart-rate timeline. Straight segments between actual samples only — no smoothing, no interpolation
 * across gaps (gap threshold = max(30 s, 3 × median interval)). Y domain comes from the data.
 * Crosshair + tooltip on hover/touch.
 */
export function HrChart({ samples, startMs, endMs, fromMs, toMs, timeZone, bands = [], height = 180, unit = "bpm", color = "var(--heart)", step = 10, pad = 5, decimals = 0, label = "Heart rate over time", emptyText = "No heart-rate samples recorded for this window" }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ tMs: number; bpm: number } | null>(null);
  const W = 1000, H = height, padT = 10, padB = 4;
  const fmt = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }), [timeZone]);

  const { path, yMin, yMax, gapMs } = useMemo(() => {
    if (!samples.length) return { path: "", yMin: 0, yMax: 1, gapMs: 30_000 };
    const ds = samples.slice(1).map((s, i) => s.tMs - samples[i]!.tMs).sort((a, b) => a - b);
    const med = ds.length ? ds[Math.floor(ds.length / 2)]! : 5000;
    const gap = Math.max(30_000, med * 3);
    let lo = Infinity, hi = -Infinity;
    for (const s of samples) { lo = Math.min(lo, s.bpm); hi = Math.max(hi, s.bpm); }
    const yMin = Math.floor((lo - pad) / step) * step, yMax = Math.ceil((hi + pad) / step) * step;
    const sx = (t: number) => ((t - fromMs) / (toMs - fromMs)) * W;
    const sy = (b: number) => padT + (1 - (b - yMin) / (yMax - yMin)) * (H - padT - padB);
    let d = "";
    samples.forEach((s, i) => {
      const newSeg = i === 0 || s.tMs - samples[i - 1]!.tMs > gap;
      d += `${newSeg ? "M" : "L"}${sx(s.tMs).toFixed(1)},${sy(s.bpm).toFixed(1)}`;
    });
    return { path: d, yMin, yMax, gapMs: gap };
  }, [samples, fromMs, toMs, H, pad, step]);

  const sx = (t: number) => ((t - fromMs) / (toMs - fromMs)) * W;
  const sy = (b: number) => padT + (1 - (b - yMin) / (yMax - yMin)) * (H - padT - padB);
  const ticks = [yMin, Math.round(((yMin + yMax) / 2) * 10) / 10, yMax];

  function onMove(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !samples.length) return;
    const t = fromMs + ((e.clientX - r.left) / r.width) * (toMs - fromMs);
    let best = samples[0]!;
    for (const s of samples) if (Math.abs(s.tMs - t) < Math.abs(best.tMs - t)) best = s;
    setHover(Math.abs(best.tMs - t) <= gapMs ? best : null);
  }

  if (!samples.length) {
    return <div className="grid place-items-center rounded-2xl border border-dashed border-hairline text-[13px] text-ink-3" style={{ height }}>{emptyText}</div>;
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full touch-none" style={{ height: H }}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={label}>
          {/* Provider zones as faint single-hue bands (ordinal: opacity rises with intensity). */}
          {bands.map((b, i) => {
            const y0 = sy(Math.min(b.upperBpm === Infinity ? yMax : b.upperBpm, yMax)), y1 = sy(Math.max(b.lowerBpm, yMin));
            return y1 > y0 ? <rect key={b.name} x={0} y={y0} width={W} height={y1 - y0} fill="var(--heart)" opacity={0.03 + i * 0.03} /> : null;
          })}
          {ticks.map((v) => <line key={v} x1={0} x2={W} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {startMs !== undefined && endMs !== undefined && <rect x={sx(startMs)} y={0} width={Math.max(0, sx(endMs) - sx(startMs))} height={H} fill="var(--ink)" opacity={0.035} />}
          {startMs !== undefined && endMs !== undefined && [startMs, endMs].map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={0} y2={H} stroke="var(--ink-3)" strokeDasharray="3 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover && <line x1={sx(hover.tMs)} x2={sx(hover.tMs)} y1={0} y2={H} stroke="var(--ink-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="flex shrink-0 flex-col justify-between text-right text-[11px] font-medium text-ink-3 tabular" style={{ height: H, paddingTop: padT - 6, paddingBottom: padB - 6 }}>
          {[...ticks].reverse().map((v) => <span key={v}>{v}</span>)}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pr-8 text-[11px] font-medium text-ink-3 tabular">
        <span>{fmt.format(fromMs)}</span>
        <span>{fmt.format(toMs)}</span>
      </div>
      {hover && (
        <div className="pointer-events-none absolute top-1 rounded-lg glass glass-thick px-2.5 py-1 text-[12px] font-medium whitespace-nowrap tabular"
          style={{ left: `clamp(0px, calc(${(sx(hover.tMs) / W) * 100}% - 48px), calc(100% - 120px))` }}>
          <span className="font-semibold">{hover.bpm.toFixed(decimals)}</span> {unit} · {fmt.format(hover.tMs)}
        </div>
      )}
    </div>
  );
}
