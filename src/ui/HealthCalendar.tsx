"use client";

import Link from "next/link";
import { useState } from "react";
import type { CalendarDay } from "@/server/analytics/calendar";
import { CATEGORY_LABEL } from "@/lib/metrics/workout-labels";
import { planDayLabel } from "@/lib/metrics/training-plan";
import { heat } from "@/lib/metrics/calendar";
import { Icon } from "./icons";
import { cx } from "./kit";
import { fmtDuration, fmtNumber } from "./format";

export type CalendarMetric = "recovery" | "sleep" | "load" | "steps";
const TONE: Record<CalendarMetric, string> = { recovery: "var(--recovery)", sleep: "var(--sleep)", load: "var(--load)", steps: "var(--activity)" };
const NAME: Record<CalendarMetric, string> = { recovery: "Recovery", sleep: "Sleep score", load: "Cardio load", steps: "Steps" };
const READY = { ready: "Ready to train", caution: "Train with care", recover: "Prioritise recovery" } as const;
const PLAN_STATUS: Record<string, string> = {
  done: "Planned session done", different: "Trained (different category)", missed: "Planned session not recorded", rest: "Rest day kept",
  restTrained: "Trained on a rest day", extra: "Extra session", free: "Unplanned day", upcoming: "Planned", before: "",
};
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

function valueOf(d: CalendarDay, m: CalendarMetric): number | null {
  return m === "recovery" ? d.recovery : m === "sleep" ? d.sleepScore : m === "load" ? d.strain : d.steps;
}
function shortValue(v: number, m: CalendarMetric) {
  return m === "steps" ? (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(Math.round(v))) : String(Math.round(v));
}

/**
 * Monthly grid. Each cell is a heat tile for the chosen measure; a hollow dashed cell means "no data" (never zero).
 * Markers under the number: workout (bar) and journal logged (dot). Selecting a day opens its summary below.
 */
export function HealthCalendar({ grid, days, metric, today, stepsGoal }: { grid: (string | null)[][]; days: CalendarDay[]; metric: CalendarMetric; today: string; stepsGoal: number | null }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const initial = days.some((d) => d.today) ? today : [...days].reverse().find((d) => !d.future)?.date ?? null;
  const [sel, setSel] = useState<string | null>(initial);
  const vals = days.map((d) => valueOf(d, metric)).filter((v): v is number => v !== null);
  // Scores are shaded across this month's own spread (otherwise 90 and 99 look identical); totals start at zero.
  const score = metric === "recovery" || metric === "sleep";
  const lo = score && vals.length ? Math.min(...vals) : 0;
  const hi = score ? (vals.length ? Math.max(...vals) : 100) : Math.max(metric === "steps" ? stepsGoal ?? 0 : 0, ...vals, 1);
  const selected = sel ? byDate.get(sel) ?? null : null;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 px-0.5 text-center text-[11px] font-semibold text-ink-3" aria-hidden="true">
        {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div role="grid" aria-label={`${NAME[metric]} calendar`} className="mt-1.5 flex flex-col gap-1.5">
        {grid.map((row, r) => (
          <div role="row" key={r} className="grid grid-cols-7 gap-1.5">
            {row.map((date, c) => {
              if (!date) return <div role="gridcell" key={c} aria-hidden="true" />;
              const d = byDate.get(date)!;
              const v = valueOf(d, metric);
              const h = heat(v, lo, hi);
              const on = sel === date;
              const label = `${longFmt.format(Date.parse(`${date}T12:00:00Z`))}: ${d.future ? "future" : v === null ? `no ${NAME[metric].toLowerCase()} data` : `${NAME[metric]} ${shortValue(v, metric)}`}${d.workouts.length ? `, ${d.workouts.length} workout${d.workouts.length > 1 ? "s" : ""}` : d.restDay ? ", rest day" : ""}${d.journal.logged ? ", journal logged" : ""}`;
              return (
                <div role="gridcell" key={c}>
                  <button type="button" disabled={d.future} onClick={() => setSel(date)} aria-label={label} aria-pressed={on}
                    className={cx("pressable relative flex aspect-square w-full flex-col items-center justify-between rounded-[12px] px-0.5 pt-1 pb-1.5 transition-[box-shadow]",
                      d.future ? "opacity-35" : v === null ? "border border-dashed border-[var(--ink-4)]" : "",
                      on && "shadow-[0_0_0_2px_var(--ink)]")}
                    style={h !== null ? { background: `color-mix(in oklab, ${TONE[metric]} ${Math.round(14 + h * 62)}%, transparent)` } : undefined}>
                    <span className={cx("text-[11px] leading-none font-semibold", d.today ? "text-ink" : "text-ink-2")}>{Number(date.slice(8))}</span>
                    <span className="num text-[13px] leading-none font-bold">{v === null ? "" : shortValue(v, metric)}</span>
                    <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                      {d.workouts.length > 0 && <span className="h-1.5 w-2.5 rounded-full bg-[var(--load)]" />}
                      {d.journal.logged > 0 && <span className="size-1.5 rounded-full bg-ink-2" />}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] font-medium text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-[4px]" style={{ background: `color-mix(in oklab, ${TONE[metric]} 70%, transparent)` }} />{score ? `Higher (${Math.round(hi)})` : "Higher"}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-[4px]" style={{ background: `color-mix(in oklab, ${TONE[metric]} 18%, transparent)` }} />{score ? `Lower (${Math.round(lo)})` : "Lower"}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-[4px] border border-dashed border-[var(--ink-4)]" />No data</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-2.5 rounded-full bg-[var(--load)]" />Workout</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ink-2" />Journal</span>
      </div>

      {selected && <DayPanel d={selected} />}
    </div>
  );
}

function DayPanel({ d }: { d: CalendarDay }) {
  const q = d.today ? "" : `?date=${d.date}`;
  const rows: { k: string; v: string; muted?: boolean }[] = [
    { k: "Recovery", v: d.recovery !== null ? String(Math.round(d.recovery)) : d.recoveryStatus === "calibrating" ? "Calibrating" : "—", muted: d.recovery === null },
    { k: "Readiness", v: d.readiness ? READY[d.readiness] : "—", muted: !d.readiness },
    { k: "Sleep score", v: d.sleepScore !== null ? String(Math.round(d.sleepScore)) : "—", muted: d.sleepScore === null },
    { k: "Time asleep", v: fmtDuration(d.asleepMin, { compact: true }), muted: d.asleepMin === null },
    { k: d.today ? "Cardio load so far" : "Cardio load", v: d.strain !== null ? `${Math.round(d.strain)} TRIMP` : "—", muted: d.strain === null },
    { k: d.today ? "Steps so far" : "Steps", v: fmtNumber(d.steps), muted: d.steps === null },
    { k: "Active minutes", v: d.activeMin !== null ? `${fmtNumber(d.activeMin)} min` : "—", muted: d.activeMin === null },
    { k: "Goals met", v: d.goals.evaluated ? `${d.goals.met} of ${d.goals.evaluated}` : "—", muted: !d.goals.evaluated },
    { k: "Journal", v: d.journal.habits ? `${d.journal.logged} of ${d.journal.habits} logged` : "—", muted: !d.journal.logged },
  ];
  return (
    <section aria-label={`Summary of ${longFmt.format(Date.parse(`${d.date}T12:00:00Z`))}`} className="glass rise mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{longFmt.format(Date.parse(`${d.date}T12:00:00Z`))}</h2>
        {d.planned && d.planned.kind !== "free" && <span className="rounded-full bg-[var(--fill-2)] px-2.5 py-1 text-[11px] font-bold text-ink-2">Plan · {planDayLabel(d.planned)}</span>}
      </div>
      {d.planStatus && PLAN_STATUS[d.planStatus] && <p className="px-4 text-[12px] font-semibold text-ink-3">{PLAN_STATUS[d.planStatus]}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.k} className="min-w-0"><dt className="text-[12px] text-ink-3">{r.k}</dt><dd className={cx("num truncate text-[15px] font-semibold", r.muted && "text-ink-4")}>{r.v}</dd></div>
        ))}
      </dl>
      <div className="border-t border-hairline px-4 py-3">
        <div className="text-[12px] text-ink-3">Workouts</div>
        {d.workouts.length ? (
          <ul className="mt-1 flex flex-col gap-1">
            {d.workouts.map((w) => (
              <li key={w.id}><Link href={`/training/${encodeURIComponent(w.id)}`} transitionTypes={["nav-forward"]} className="pressable flex items-center justify-between gap-2 text-[14px] font-semibold">
                <span className="truncate">{w.title}{w.category ? <span className="ml-1.5 text-[12px] font-medium text-ink-3">{CATEGORY_LABEL[w.category]}</span> : w.cardio ? <span className="ml-1.5 text-[12px] font-medium text-ink-3">Cardio</span> : null}</span>
                <span className="num shrink-0 text-[13px] text-ink-3">{fmtDuration(w.durationMin, { compact: true })}</span>
              </Link></li>
            ))}
          </ul>
        ) : <p className="mt-0.5 text-[14px] font-semibold text-ink-2">{d.restDay ? "Rest day" : d.today ? "None yet" : "None recorded"}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-hairline p-3">
        <Link href={`/${q}`} transitionTypes={["nav-forward"]} className="pressable flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[14px] font-semibold text-bg">Open day<Icon name="chevronRight" size={15} strokeWidth={2.4} /></Link>
        <Link href={`/timeline${q}`} transitionTypes={["nav-forward"]} className="pressable flex items-center justify-center gap-1.5 rounded-full bg-[var(--fill-2)] py-2.5 text-[14px] font-semibold">Timeline<Icon name="chevronRight" size={15} strokeWidth={2.4} /></Link>
      </div>
    </section>
  );
}
