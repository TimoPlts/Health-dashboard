"use client";

import { useMemo, useState } from "react";

/**
 * Sleep-stage timeline. Stage is encoded twice — by row (position) AND colour — so colour is never the
 * only cue. Segments are drawn exactly as reported (no smoothing); 2px surface gaps separate rows.
 */
const ROWS = [
  { key: "AWAKE", label: "Awake", color: "var(--sleep-awake)" },
  { key: "REM", label: "REM", color: "var(--sleep-rem)" },
  { key: "LIGHT", label: "Light", color: "var(--sleep-light)" },
  { key: "DEEP", label: "Deep", color: "var(--sleep-deep)" },
] as const;
// Classic (non-staged) sleep records use ASLEEP / RESTLESS.
const ALIAS: Record<string, string> = { ASLEEP: "LIGHT", RESTLESS: "AWAKE" };

export interface Segment { startMs: number; endMs: number; stage: string }

export function Hypnogram({ segments, startMs, endMs, timeZone, height = 128 }: { segments: Segment[]; startMs: number; endMs: number; timeZone: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, labelW = 0, rowH = height / ROWS.length;
  const span = Math.max(1, endMs - startMs);
  const x = (t: number) => labelW + ((t - startMs) / span) * (W - labelW);
  const fmt = useMemo(() => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }), [timeZone]);
  const rowOf = (stage: string) => ROWS.findIndex((r) => r.key === (ALIAS[stage] ?? stage));
  const hovered = hover !== null ? segments[hover] : undefined;

  return (
    <div className="relative">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col justify-between py-[3px] text-[11px] font-medium text-ink-3" style={{ height }} aria-hidden="true">
          {ROWS.map((r) => <span key={r.key} className="leading-none">{r.label}</span>)}
        </div>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label="Sleep stages over the night">
          {ROWS.map((r, i) => <rect key={r.key} x={0} y={i * rowH + rowH / 2 - 0.5} width={W} height={1} fill="var(--hairline)" />)}
          {segments.map((s, i) => {
            const row = rowOf(s.stage);
            if (row < 0) return null;
            const x0 = x(s.startMs), x1 = Math.max(x0 + 1.5, x(s.endMs));
            return (
              <rect
                key={i} x={x0} y={row * rowH + 2} width={x1 - x0} height={rowH - 4} rx={3}
                fill={ROWS[row]!.color} opacity={hover === null || hover === i ? 1 : 0.45}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(i)}
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between pl-[42px] text-[11px] font-medium text-ink-3 tabular">
        <span>{fmt.format(startMs)}</span>
        <span>{fmt.format(endMs)}</span>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg glass glass-thick px-2.5 py-1 text-[12px] font-medium whitespace-nowrap tabular">
          {ROWS[rowOf(hovered.stage)]?.label} · {fmt.format(hovered.startMs)}–{fmt.format(hovered.endMs)} · {Math.round((hovered.endMs - hovered.startMs) / 60000)} min
        </div>
      )}
    </div>
  );
}

export function StageLegend({ minutes }: { minutes: Record<string, number> }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {ROWS.map((r) => {
        const m = r.key === "LIGHT" ? (minutes.LIGHT ?? 0) + (minutes.ASLEEP ?? 0) : r.key === "AWAKE" ? (minutes.AWAKE ?? 0) + (minutes.RESTLESS ?? 0) : minutes[r.key];
        return (
          <li key={r.key} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
              <span className="size-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold tabular">{m === undefined ? "—" : `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${Math.round(m % 60)}m`}</div>
          </li>
        );
      })}
    </ul>
  );
}
