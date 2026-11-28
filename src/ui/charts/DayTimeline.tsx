"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimelineData } from "@/server/analytics/timeline";
import { lineRuns, type Bucket } from "@/lib/metrics/timeline";
import { CATEGORY_LABEL } from "@/lib/metrics/workout-labels";
import { cx } from "../kit";
import { fmtNumber } from "../format";

const W = 1000;
const STAGE = { AWAKE: { label: "Awake", color: "var(--sleep-awake)", row: 0 }, REM: { label: "REM", color: "var(--sleep-rem)", row: 1 }, LIGHT: { label: "Light", color: "var(--sleep-light)", row: 2 }, DEEP: { label: "Deep", color: "var(--sleep-deep)", row: 3 } } as const;
const ALIAS: Record<string, keyof typeof STAGE> = { ASLEEP: "LIGHT", RESTLESS: "AWAKE" };
const stageOf = (s: string) => STAGE[(ALIAS[s] ?? s) as keyof typeof STAGE] ?? null;
const INTENSITY = ["", "Fat burn", "Cardio", "Peak"];
/** A heart-rate line is broken where no sample exists for more than 5 minutes (never interpolated). */
const HR_GAP_MS = 5 * 60_000;

interface Sel { a: number; b: number }

/**
 * Synchronised 24-hour timeline: heart rate (1-minute mean with min–max band), %HRmax zones, sleep stages, workouts,
 * Google intensity (Active Zone Minutes) and steps share one time axis. Drag (or use the arrow keys) to inspect an
 * interval; the summary is computed from one-minute summaries of the raw samples.
 */
export function DayTimeline({ d }: { d: TimelineData }) {
  const n = d.hr.length;
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const dst = d.hoursInDay !== 24;
  const tf = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone: d.tz, hour: "2-digit", minute: "2-digit", ...(dst ? { timeZoneName: "short" } : {}) }), [d.tz, dst]);
  const x = (t: number) => ((t - d.fromMs) / (d.toMs - d.fromMs)) * W;
  const xi = (i: number) => (i / n) * W;

  const hrPath = useMemo(() => {
    const buckets: Bucket[] = d.hr.map((h, i) => ({ startMs: d.fromMs + i * d.bucketMs, endMs: d.fromMs + (i + 1) * d.bucketMs, mean: h?.[0] ?? null, min: h?.[1] ?? null, max: h?.[2] ?? null, n: h?.[3] ?? 0 }));
    const filled = buckets.filter((b) => b.mean !== null);
    if (!filled.length) return null;
    const lo = Math.floor((Math.min(...filled.map((b) => b.min!)) - 4) / 10) * 10, hi = Math.ceil((Math.max(...filled.map((b) => b.max!)) + 4) / 10) * 10;
    const H = 120, y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 10);
    let line = "", band = "";
    for (const run of lineRuns(buckets, HR_GAP_MS)) {
      const cx_ = (b: Bucket) => x((b.startMs + b.endMs) / 2).toFixed(1);
      line += run.map((b, i) => `${i ? "L" : "M"}${cx_(b)},${y(b.mean!).toFixed(1)}`).join("");
      band += run.map((b, i) => `${i ? "L" : "M"}${cx_(b)},${y(b.max!).toFixed(1)}`).join("") + [...run].reverse().map((b) => `L${cx_(b)},${y(b.min!).toFixed(1)}`).join("") + "Z";
    }
    return { line, band, lo, hi, H, y };
  }, [d]);

  const zoneRuns = useMemo(() => {
    if (!d.zones) return [];
    const out: { a: number; b: number; z: number }[] = [];
    d.zones.forEach((zs, i) => {
      let z = 0, best = 0;
      for (let k = 1; k <= 5; k++) if (zs[k]! > best) { best = zs[k]!; z = k; }
      if (zs[0]! > best) z = 0;
      const last = out[out.length - 1];
      if (z && last && last.z === z && last.b === i) last.b = i + 1; else if (z) out.push({ a: i, b: i + 1, z });
    });
    return out;
  }, [d.zones]);

  const steps15 = useMemo(() => {
    const out: (number | null)[] = [];
    for (let i = 0; i < n; i += 15) { const part = d.steps.slice(i, i + 15).filter((v): v is number => v !== null); out.push(part.length ? part.reduce((a, b) => a + b, 0) : null); }
    return out;
  }, [d.steps, n]);
  const stepMax = Math.max(1, ...steps15.map((v) => v ?? 0));

  function idxAt(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
  }
  const onDown = (e: PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); const i = idxAt(e.clientX); setAnchor(i); setSel({ a: i, b: i }); };
  const onMove = (e: PointerEvent) => { if (anchor === null) return; const i = idxAt(e.clientX); setSel({ a: Math.min(anchor, i), b: Math.max(anchor, i) }); };
  const onUp = () => setAnchor(null);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 1;
    if (e.key === "Escape") { setSel(null); return; }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cur = sel ? sel.a : Math.floor(n / 2);
    const i = Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowLeft" ? -step : step)));
    setSel({ a: i, b: i });
  };

  const range = sel ?? { a: 0, b: n - 1 };
  const ta = d.fromMs + range.a * d.bucketMs, tb = Math.min(d.toMs, d.fromMs + (range.b + 1) * d.bucketMs);
  const sum = summarise(d, range, ta, tb);
  const presets = [
    ...d.sleep.filter((s) => s.main).map((s) => ({ key: s.id, label: s.startMs < d.fromMs ? "Last night" : "Tonight", a: s.startMs, b: s.endMs })),
    ...d.workouts.map((w) => ({ key: w.id, label: w.title, a: w.startMs, b: w.endMs })),
  ];
  const selectMs = (a: number, b: number) => setSel({ a: Math.max(0, Math.floor((a - d.fromMs) / d.bucketMs)), b: Math.min(n - 1, Math.ceil((b - d.fromMs) / d.bucketMs) - 1) });

  const lane = "relative block w-full";
  const laneLabel = "mb-1 flex items-center justify-between text-[11px] font-semibold text-ink-3";

  return (
    <div>
      {presets.length > 0 && (
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Jump to">
          <button type="button" onClick={() => setSel(null)} aria-pressed={sel === null} className={cx("pressable shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold", sel === null ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink-2")}>Whole day</button>
          {presets.map((p) => (
            <button key={p.key} type="button" onClick={() => selectMs(p.a, p.b)} className="pressable shrink-0 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[12px] font-semibold text-ink-2">{p.label}</button>
          ))}
        </div>
      )}

      <div ref={ref} tabIndex={0} role="group" aria-label="Day timeline. Drag to select an interval; arrow keys move the cursor, Shift for 15 minutes, Escape for the whole day."
        className="relative touch-none rounded-[14px] outline-none select-none focus-visible:shadow-[0_0_0_2px_var(--ink-3)]"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}>
        <div className={laneLabel}><span>Heart rate</span>{hrPath && <span className="num">{hrPath.lo}–{hrPath.hi} bpm</span>}</div>
        {hrPath ? (
          <svg viewBox={`0 0 ${W} ${hrPath.H}`} preserveAspectRatio="none" className={lane} style={{ height: hrPath.H }} role="img" aria-label="Heart rate over the day">
            {d.ticks.filter((t) => t.hour % 6 === 0).map((t) => <line key={t.tMs} x1={x(t.tMs)} x2={x(t.tMs)} y1={0} y2={hrPath.H} stroke="var(--hairline)" vectorEffect="non-scaling-stroke" />)}
            <path d={hrPath.band} fill="var(--heart)" opacity={0.16} />
            <path d={hrPath.line} fill="none" stroke="var(--heart)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : <div className="grid h-[120px] place-items-center rounded-xl border border-dashed border-hairline text-[12px] text-ink-3">No heart-rate samples this day</div>}

        <div className={cx(laneLabel, "mt-2")}><span>Zones (%HRmax)</span></div>
        <svg viewBox={`0 0 ${W} 10`} preserveAspectRatio="none" className={lane} style={{ height: 10 }} role="img" aria-label="Heart-rate zone per minute">
          <rect x={0} y={0} width={W} height={10} rx={3} fill="var(--track)" />
          {zoneRuns.map((r) => <rect key={r.a} x={xi(r.a)} y={0} width={Math.max(0.8, xi(r.b) - xi(r.a))} height={10} fill={`var(--z${r.z})`} />)}
        </svg>

        <div className={cx(laneLabel, "mt-2")}><span>Sleep</span></div>
        <svg viewBox={`0 0 ${W} 36`} preserveAspectRatio="none" className={lane} style={{ height: 36 }} role="img" aria-label="Sleep stages">
          <rect x={0} y={0} width={W} height={36} rx={4} fill="var(--track)" opacity={0.6} />
          {d.sleep.map((s) => s.stages.length ? s.stages.map((st, i) => {
            const g = stageOf(st.stage); if (!g) return null;
            const a = Math.max(st.startMs, d.fromMs), b = Math.min(st.endMs, d.toMs);
            return <rect key={`${s.id}-${i}`} x={x(a)} y={g.row * 9} width={Math.max(0.8, x(b) - x(a))} height={9} fill={g.color} />;
          }) : <rect key={s.id} x={x(Math.max(s.startMs, d.fromMs))} y={9} width={Math.max(1, x(Math.min(s.endMs, d.toMs)) - x(Math.max(s.startMs, d.fromMs)))} height={18} rx={3} fill="var(--sleep-light)" opacity={0.7} />)}
        </svg>

        <div className={cx(laneLabel, "mt-2")}><span>Workouts</span></div>
        <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" className={lane} style={{ height: 14 }} role="img" aria-label="Workouts">
          <rect x={0} y={0} width={W} height={14} rx={4} fill="var(--track)" opacity={0.6} />
          {d.workouts.map((w) => <rect key={w.id} x={x(Math.max(w.startMs, d.fromMs))} y={1} width={Math.max(2, x(Math.min(w.endMs, d.toMs)) - x(Math.max(w.startMs, d.fromMs)))} height={12} rx={3} fill="var(--load)" opacity={w.excluded || w.tooShort ? 0.35 : 1} />)}
        </svg>

        <div className={cx(laneLabel, "mt-2")}><span>Intensity (Active Zone Minutes)</span></div>
        <svg viewBox={`0 0 ${W} 10`} preserveAspectRatio="none" className={lane} style={{ height: 10 }} role="img" aria-label="Activity intensity per minute">
          <rect x={0} y={0} width={W} height={10} rx={3} fill="var(--track)" />
          {d.intensity.map((l, i) => (l ? <rect key={i} x={xi(i)} y={10 - l * 3.3} width={Math.max(0.8, W / n)} height={l * 3.3} fill="var(--activity)" opacity={0.45 + l * 0.18} /> : null))}
        </svg>

        <div className={cx(laneLabel, "mt-2")}><span>Steps per 15 min</span><span className="num">max {fmtNumber(stepMax)}</span></div>
        <svg viewBox={`0 0 ${W} 36`} preserveAspectRatio="none" className={lane} style={{ height: 36 }} role="img" aria-label="Steps per 15 minutes">
          {steps15.map((v, i) => (v === null ? null : <rect key={i} x={(i / steps15.length) * W + 0.6} y={36 - Math.max(1, (v / stepMax) * 36)} width={W / steps15.length - 1.2} height={Math.max(1, (v / stepMax) * 36)} rx={1.5} fill="var(--activity)" />))}
        </svg>

        <div className="relative mt-1.5 h-4 text-[10.5px] font-medium text-ink-3 tabular" aria-hidden="true">
          {d.ticks.filter((t) => t.hour % 6 === 0).map((t) => <span key={t.tMs} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${(x(t.tMs) / W) * 100}%` }}>{String(t.hour).padStart(2, "0")}</span>)}
        </div>

        {sel && (
          <div className="pointer-events-none absolute top-0 bottom-5 rounded-[6px] border-x-2 border-ink-2 bg-[color-mix(in_oklab,var(--ink)_7%,transparent)]"
            style={{ left: `${(range.a / n) * 100}%`, width: `max(2px, ${((range.b - range.a + 1) / n) * 100}%)` }} />
        )}
      </div>

      <section aria-live="polite" aria-label="Selected interval" className="mt-4 rounded-[18px] bg-[var(--fill)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="num text-[15px] font-bold">{sel ? `${tf.format(ta)} – ${tf.format(tb)}` : "Whole day"}</h3>
          <span className="num text-[12px] text-ink-3">{Math.round((tb - ta) / 60_000)} min{sel ? "" : ` · ${d.hoursInDay} h day`}</span>
        </div>
        {!sel && <p className="mt-1 text-[12px] text-ink-3">Drag across the timeline, or pick a sleep or workout above, to inspect an interval.</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat k="Heart rate" v={sum.avg !== null ? `${Math.round(sum.avg)} bpm` : "—"} s={sum.avg !== null ? `${sum.min}–${sum.max} · ${fmtNumber(sum.coveredMin)} min worn` : "no samples"} />
          <Stat k="Steps" v={sum.steps !== null ? fmtNumber(sum.steps) : "—"} s={sum.steps !== null ? "Google (reconciled)" : "none recorded"} />
          <Stat k="Active Zone Min" v={sum.azm !== null ? fmtNumber(sum.azm) : "—"} s={sum.intensity ? `peak level: ${sum.intensity}` : " "} />
          <Stat k="Sleep" v={sum.sleepMin ? `${fmtNumber(sum.sleepMin)} min` : "—"} s={sum.stageText || " "} />
        </dl>
        {sum.zoneMin && sum.coveredMin > 0 && (
          <div className="mt-3">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--track)]" role="img" aria-label={`Time in zones: ${sum.zoneMin.map((m, i) => `Z${i + 1} ${Math.round(m)} min`).join(", ")}`}>
              {sum.zoneMin.map((m, i) => <span key={i} style={{ width: `${(m / sum.coveredMin) * 100}%`, background: `var(--z${i + 1})` }} />)}
            </div>
            <div className="num mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">{sum.zoneMin.map((m, i) => <span key={i}>Z{i + 1} {Math.round(m)}m</span>)}<span>below Z1 {Math.round(sum.belowMin)}m</span></div>
          </div>
        )}
        {sum.workouts.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3">
            {sum.workouts.map((w) => (
              <li key={w.id}><Link href={`/training/${encodeURIComponent(w.id)}`} className="pressable flex justify-between gap-2 text-[14px] font-semibold"><span className="truncate">{w.title}{w.category ? <span className="ml-1.5 text-[12px] font-medium text-ink-3">{CATEGORY_LABEL[w.category]}</span> : null}{w.excluded ? <span className="ml-1.5 text-[12px] font-medium text-ink-3">excluded</span> : null}</span><span className="num shrink-0 text-[13px] text-ink-3">{tf.format(w.startMs)}</span></Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return <div className="min-w-0"><dt className="text-[12px] text-ink-3">{k}</dt><dd className={cx("num truncate text-[16px] font-semibold", v === "—" && "text-ink-4")}>{v}</dd><dd className="text-[11px] leading-snug text-ink-3">{s}</dd></div>;
}

function summarise(d: TimelineData, r: Sel, ta: number, tb: number) {
  let n = 0, wsum = 0, min = Infinity, max = -Infinity, covered = 0, steps: number | null = null, azm: number | null = null, lvl = 0;
  const zones = [0, 0, 0, 0, 0, 0];
  for (let i = r.a; i <= r.b; i++) {
    const h = d.hr[i];
    if (h) { wsum += h[0] * h[3]; n += h[3]; min = Math.min(min, h[1]); max = Math.max(max, h[2]); }
    covered += d.covered[i] ?? 0;
    if (d.zones) d.zones[i]!.forEach((s, k) => { zones[k]! += s; });
    const st = d.steps[i]; if (st !== null && st !== undefined) steps = (steps ?? 0) + st;
    const az = d.azm[i]; if (az !== null && az !== undefined) azm = (azm ?? 0) + az;
    lvl = Math.max(lvl, d.intensity[i] ?? 0);
  }
  const stageMin: Record<string, number> = {};
  for (const s of d.sleep) for (const st of s.stages) {
    const ov = Math.min(st.endMs, tb) - Math.max(st.startMs, ta);
    const g = stageOf(st.stage);
    if (ov > 0 && g) stageMin[g.label] = (stageMin[g.label] ?? 0) + ov / 60_000;
  }
  const sleepMin = Object.entries(stageMin).filter(([k]) => k !== "Awake").reduce((a, [, v]) => a + v, 0);
  return {
    avg: n ? wsum / n : null, min: n ? min : null, max: n ? max : null, coveredMin: covered / 60,
    zoneMin: d.zones ? zones.slice(1).map((s) => s / 60) : null, belowMin: zones[0]! / 60,
    steps: steps !== null ? Math.round(steps) : null, azm: azm !== null ? Math.round(azm) : null, intensity: INTENSITY[lvl] || null,
    sleepMin, stageText: Object.entries(stageMin).map(([k, v]) => `${k} ${Math.round(v)}m`).join(" · "),
    workouts: d.workouts.filter((w) => w.endMs > ta && w.startMs < tb),
  };
}
