"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { WeightView } from "@/server/analytics/weight";
import { cx } from "../kit";

type Point = WeightView["points"][number];
const DAY = 86_400_000;
const dms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
/** The trend line is broken where no weigh-in exists for more than this many days (an estimate, not invented data). */
const TREND_GAP_DAYS = 7;

/**
 * Measured daily weights (dots) with the smoothed trend (line) — two clearly different marks. The goal is a dashed
 * line; phase starts are dashed verticals. Tap, drag or use the arrow keys to inspect a day.
 */
export function WeightChart({ points, from, to, goalKg, phases, height = 230 }: {
  points: Point[]; from: string; to: string; goalKg: number | null; phases: { date: string; label: string }[]; height?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(points.length ? points.length - 1 : null);
  const W = 1000, H = height, padT = 14, padB = 10;
  const t0 = dms(from), t1 = Math.max(dms(to), t0 + DAY);
  const x = (d: string) => ((dms(d) - t0) / (t1 - t0)) * (W - 24) + 12;

  const { lo, hi, ticks, goalIn } = useMemo(() => {
    const v = points.flatMap((p) => [p.kg, ...(p.trendKg !== null ? [p.trendKg] : [])]);
    if (!v.length) return { lo: 0, hi: 1, ticks: [] as number[], goalIn: false };
    let lo = Math.min(...v), hi = Math.max(...v);
    const span0 = Math.max(hi - lo, 1);
    const goalIn = goalKg !== null && goalKg >= lo - span0 && goalKg <= hi + span0;
    if (goalIn) { lo = Math.min(lo, goalKg!); hi = Math.max(hi, goalKg!); }
    const pad = Math.max((hi - lo) * 0.12, 0.4);
    lo -= pad; hi += pad;
    const raw = (hi - lo) / 3, p10 = 10 ** Math.floor(Math.log10(raw)), f = raw / p10;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p10;
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(Math.round(t * 100) / 100);
    return { lo, hi, ticks, goalIn };
  }, [points, goalKg]);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const trendPath = useMemo(() => {
    let d = "", prev: Point | null = null;
    for (const p of points) {
      if (p.trendKg === null) continue;
      const join = prev && (dms(p.date) - dms(prev.date)) / DAY <= TREND_GAP_DAYS;
      d += `${join ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trendKg).toFixed(1)}`;
      prev = p;
    }
    return d;
  }, [points, lo, hi, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !points.length) return;
    const vx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - vx) < Math.abs(x(points[best]!.date) - vx)) best = i; });
    setSel(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setSel((s) => Math.max(0, Math.min(points.length - 1, (s ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1)))); }
    if (e.key === "Home") setSel(0);
    if (e.key === "End") setSel(points.length - 1);
  };

  if (!points.length) return <div className="grid place-items-center rounded-2xl border border-dashed border-hairline text-[13px] text-ink-3" style={{ height: H }}>No weigh-ins in this period</div>;
  const p = sel !== null ? points[sel] ?? null : null;
  const r = points.length > 120 ? 2.5 : points.length > 45 ? 3.5 : 4.5;

  return (
    <div>
      <div className="flex gap-2">
        <div ref={ref} tabIndex={0} role="group" aria-label="Weight chart. Arrow keys move between weigh-ins."
          className="relative min-w-0 flex-1 touch-pan-y rounded-[10px] outline-none select-none focus-visible:shadow-[0_0_0_2px_var(--ink-3)]"
          onPointerDown={(e: PointerEvent) => pickAt(e.clientX)} onPointerMove={(e: PointerEvent) => { if (e.pointerType === "mouse" || e.buttons) pickAt(e.clientX); }} onKeyDown={onKey}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }} role="img"
            aria-label={`Measured weight (dots) and smoothed trend (line), ${shortFmt.format(dms(from))} to ${shortFmt.format(dms(to))}`}>
            {ticks.map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--hairline)" vectorEffect="non-scaling-stroke" />)}
            {phases.filter((ph) => ph.date >= from && ph.date <= to).map((ph) => <line key={ph.date} x1={x(ph.date)} x2={x(ph.date)} y1={0} y2={H} stroke="var(--ink-3)" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />)}
            {goalIn && <line x1={0} x2={W} y1={y(goalKg!)} y2={y(goalKg!)} stroke="var(--ink-2)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />}
            {p && <line x1={x(p.date)} x2={x(p.date)} y1={0} y2={H} stroke="var(--ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            <motion.path key={`${from}-${to}`} d={trendPath} fill="none" stroke="var(--body)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
          {/* Dots in HTML so they stay round under the non-uniform SVG scale. Hollow = measured weigh-in. */}
          {points.map((q, i) => (
            <span key={q.date} aria-hidden="true" className="pointer-events-none absolute rounded-full border-[1.5px]"
              style={{ left: `${(x(q.date) / W) * 100}%`, top: y(q.kg), width: (i === sel ? 2.6 : 2) * r, height: (i === sel ? 2.6 : 2) * r, transform: "translate(-50%,-50%)",
                borderColor: "var(--body)", background: i === sel ? "var(--body)" : "color-mix(in oklab, var(--bg-elev) 70%, transparent)" }} />
          ))}
          {goalIn && <span className="pointer-events-none absolute left-1 -translate-y-[115%] rounded-md bg-[var(--fill-2)] px-1.5 text-[10.5px] font-bold text-ink-2" style={{ top: y(goalKg!) }}>Goal {goalKg!.toFixed(1)}</span>}
        </div>
        <div className="relative w-9 shrink-0 text-[11px] font-medium text-ink-3 tabular" style={{ height: H }} aria-hidden="true">
          {ticks.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: y(v) }}>{Number.isInteger(v) ? v : v.toFixed(1)}</span>)}
        </div>
      </div>
      <div className="mt-1.5 mr-11 flex justify-between text-[11px] font-medium text-ink-3 tabular" aria-hidden="true">
        <span>{shortFmt.format(dms(from))}</span><span>{shortFmt.format(dms(from) + (dms(to) - dms(from)) / 2)}</span><span>{shortFmt.format(dms(to))}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-[var(--body)]" />Measured</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-[var(--body)]" />Trend (estimate)</span>
        {goalIn && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[var(--ink-2)]" />Goal</span>}
      </div>

      {p && (
        <section aria-live="polite" aria-label="Selected weigh-in" className="mt-3 rounded-[16px] bg-[var(--fill)] p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-bold">{dayFmt.format(dms(p.date))}</h3>
            <span className="num text-[20px] font-bold">{p.kg.toFixed(1)}<span className="ml-0.5 text-[12px] font-semibold text-ink-3">kg</span></span>
          </div>
          <div className="num mt-0.5 flex justify-between text-[12px] text-ink-3">
            <span>{p.basis === "chosen" ? "Morning weigh-in (chosen)" : p.basis === "morning" ? "First morning weigh-in" : "First weigh-in of the day"}</span>
            {p.trendKg !== null && <span>trend {p.trendKg.toFixed(1)} · {p.kg - p.trendKg >= 0 ? "+" : "−"}{Math.abs(p.kg - p.trendKg).toFixed(1)} from trend</span>}
          </div>
          <ul className="mt-2 flex flex-col gap-1 border-t border-hairline pt-2">
            {p.entries.map((e) => (
              <li key={e.key} className={cx("flex items-baseline justify-between gap-2 text-[13px]", !e.day && "text-ink-3")}>
                <span className="min-w-0"><span className="num font-semibold">{e.time}</span> · {e.manual ? "Manual" : e.source}{e.note ? <span className="block truncate text-[12px] text-ink-2">“{e.note}”</span> : null}</span>
                <span className="num shrink-0 font-semibold">{e.kg.toFixed(1)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
