import type { DB } from "../db/client";
import { entriesBetween, listHabits, type Habit } from "../journal";
import { addDays } from "@/lib/metrics/periods";
import { booleanAssociation, rankAssociation, type Association } from "@/lib/metrics/associations";
import { METRIC_BY_ID, type MetricDef } from "./registry";
import { metricSeries } from "./values";
import { computeScores } from "./scores";

/** Outcomes measured the morning AFTER the habit day (habit on day D → night ending / morning of D + 1). */
export const ASSOC_OUTCOMES = ["hrv", "resting_hr", "sleep_asleep", "sleep_efficiency", "recovery"] as const;
export const ASSOC_WINDOW_DAYS = 120;

export interface HabitAssociations { habit: Habit; results: { outcome: MetricDef; assoc: Association }[] }

/**
 * Exploratory habit ↔ next-morning associations over the last 120 days (assoc@1). Days where the habit was not
 * logged, or the outcome is missing, are left out. Nothing is reported below the minimum sample sizes.
 */
export function associationsView(db: DB, today: string, fbOffsetS: number) {
  const from = addDays(today, -ASSOC_WINDOW_DAYS);
  const habits = listHabits(db);
  const entries = entriesBetween(db, from, today);
  const scores = computeScores(db, addDays(from, 1), today, fbOffsetS);
  const outcomes = ASSOC_OUTCOMES.map((id) => {
    const def = METRIC_BY_ID.get(id)!;
    return { def, series: metricSeries(db, def, addDays(from, 1), today, fbOffsetS, def.series.kind === "score" ? scores : undefined) };
  });
  const out: HabitAssociations[] = habits.map((h) => {
    const e = entries.get(h.id) ?? new Map<string, number>();
    return {
      habit: h,
      results: outcomes.map(({ def, series }) => {
        const pairs = [...e].flatMap(([day, x]) => { const y = series.get(addDays(day, 1)); return y === undefined ? [] : [{ x, y }]; });
        return { outcome: def, assoc: h.kind === "boolean" ? booleanAssociation(pairs) : rankAssociation(pairs) };
      }),
    };
  });
  const computed = out.flatMap((h) => h.results).filter((r) => r.assoc.status === "ok");
  return { habits: out, comparisons: computed.length, notable: computed.filter((r) => r.assoc.status === "ok" && r.assoc.notable).length };
}
