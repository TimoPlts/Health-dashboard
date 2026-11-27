import type { DB } from "../db/client";
import { getSettings } from "../settings";
import { civilDayBounds } from "@/lib/time";
import { addDays, aggregateDays, completeDays, daysBetween, periodOf, previousPeriod, type PeriodKind } from "@/lib/metrics/periods";
import { completion, evaluateAtLeast, evaluateBedtime, evaluateWake, GOAL_DEFS, type GoalId, type GoalStatus } from "@/lib/metrics/goals";
import { METRIC_BY_ID, type MetricDef } from "./registry";
import { metricSeries } from "./values";
import { computeScores, nightValue, sleepConsistency } from "./scores";
import { nightSeries } from "./series";
import { listWorkouts } from "./workouts";
import { cardioView } from "./cardio";

/** Metrics in a report, by section. "sum" metrics are compared as the average per day with data (fair for partial periods). */
export const REPORT_SECTIONS: { title: string; ids: string[] }[] = [
  { title: "Sleep", ids: ["sleep_asleep", "sleep_efficiency", "sleep_score"] },
  { title: "Recovery", ids: ["recovery", "hrv", "resting_hr", "respiratory_rate"] },
  { title: "Activity", ids: ["steps", "active_min", "azm", "distance"] },
  { title: "Training", ids: ["strain", "zone2"] },
];

export interface ReportRow {
  def: MetricDef;
  /** Mean per day with data (both for "mean" and "sum" metrics). */
  current: number | null; previous: number | null; days: number; previousDays: number;
  /** Total over the period (sum metrics only). */
  total: number | null;
  baseline: { mean: number; sd: number; n: number } | null; baselineHave: number;
}

/**
 * Weekly / monthly report (report@1). Deterministic numbers only — no generated text.
 * Current period: complete days only (today and future days excluded). Previous period: the one before, complete.
 * Personal baseline: mean ± SD of the 28 days before the period (≥ 14 values), as on metric pages.
 */
export function reportView(db: DB, kind: PeriodKind, date: string, today: string, fbOffsetS: number, tz: string) {
  const p = periodOf(kind, date > today ? today : date), prev = previousPeriod(p);
  const days = completeDays(p, today), prevDays = completeDays(prev, today);
  const baseDays = daysBetween(addDays(p.from, -28), addDays(p.from, -1));
  const end = p.to < today ? p.to : today;
  const from = baseDays[0]! < prev.from ? baseDays[0]! : prev.from;
  const scores = computeScores(db, from, end, fbOffsetS);

  const sections = REPORT_SECTIONS.map((sec) => ({
    title: sec.title,
    rows: sec.ids.map((id): ReportRow => {
      const def = METRIC_BY_ID.get(id)!;
      const s = metricSeries(db, def, from, end, fbOffsetS, def.series.kind === "score" ? scores : undefined);
      const cur = aggregateDays(s, days), pr = aggregateDays(s, prevDays);
      const bv = baseDays.map((d) => s.get(d)).filter((v): v is number => v !== undefined);
      const bm = bv.length ? bv.reduce((a, b) => a + b, 0) / bv.length : null;
      return {
        def, current: cur.mean, previous: pr.mean, days: cur.daysWithData, previousDays: pr.daysWithData, total: def.agg === "sum" ? cur.sum : null,
        baseline: bv.length >= 14 && bm !== null ? { mean: bm, sd: Math.sqrt(bv.reduce((a, v) => a + (v - bm) ** 2, 0) / (bv.length - 1)), n: bv.length } : null,
        baselineHave: bv.length,
      };
    }),
  }));

  // Workouts (non-excluded) in the period vs the previous one.
  const workouts = (pp: { from: string; to: string }) => {
    const [a] = civilDayBounds(pp.from, tz), [, b] = civilDayBounds(pp.to < today ? pp.to : today, tz);
    const w = listWorkouts(db, a, b, tz).filter((x) => !x.excluded && !x.tooShort && x.date >= pp.from && x.date <= pp.to);
    return { count: w.length, minutes: w.reduce((s, x) => s + x.durationMin, 0), cardio: w.filter((x) => x.cardio).length };
  };

  // Goal completion inside the period (daily goals on complete days; weekly goals on complete weeks that start in it).
  const g = getSettings(db).goals;
  const steps = metricSeries(db, METRIC_BY_ID.get("steps")!, p.from, end, fbOffsetS), active = metricSeries(db, METRIC_BY_ID.get("active_min")!, p.from, end, fbOffsetS);
  const { nights } = nightSeries(db, p.from, end, fbOffsetS);
  const weeks = cardioView(db, today, fbOffsetS, tz, end).weeks.filter((w) => w.start >= p.from && w.start <= p.to && !w.partial);
  const goals = GOAL_DEFS.filter((d) => g[d.id as GoalId] !== null).map((d) => {
    const target = g[d.id as GoalId]!;
    let st: GoalStatus[];
    if (d.period === "week") st = weeks.map((w) => evaluateAtLeast(d.id === "azmWeekly" ? w.azm : d.id === "zone2WeeklyMin" ? w.zone2Min : w.sessions, target, true));
    else st = days.map((day) => {
      if (d.id === "stepsDaily") return evaluateAtLeast(steps.get(day) ?? null, target, true);
      if (d.id === "activeMinDaily") return evaluateAtLeast(active.get(day) ?? null, target, true);
      const n = nights.get(day);
      if (d.id === "sleepMin") return evaluateAtLeast(n?.minutesAsleep ?? null, target, true);
      return d.id === "bedtimeMin" ? evaluateBedtime(nightValue(n, "bedtime"), target) : evaluateWake(nightValue(n, "wake"), target);
    });
    return { def: d, target, ...completion(st), periods: st.length };
  });

  const lastComplete = days.at(-1) ?? null;
  const daily = (id: string) => { const s = metricSeries(db, METRIC_BY_ID.get(id)!, p.from, end, fbOffsetS); return p.days.map((d) => ({ date: d, value: d < today ? s.get(d) ?? null : null })); };
  return {
    period: p, previous: prev, completeDays: days.length, partial: days.length < p.days.length, sections,
    workouts: { current: workouts(p), previous: workouts(prev) },
    goals,
    sleepEnd: lastComplete ? { debtMin: scores.get(lastComplete)?.sleepDebtMin ?? null, debtNights: scores.get(lastComplete)?.sleepDebtNights ?? 0, consistency: sleepConsistency(db, lastComplete, fbOffsetS) } : null,
    charts: { sleep: daily("sleep_asleep"), steps: daily("steps") },
  };
}
