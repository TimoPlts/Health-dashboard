import type { DB } from "../db/client";
import { getSettings } from "../settings";
import { completion, evaluateAtLeast, evaluateBedtime, evaluateWake, GOAL_DEFS, type GoalDef, type GoalId, type GoalStatus } from "@/lib/metrics/goals";
import { daysBetween } from "@/lib/metrics/periods";
import { METRIC_BY_ID } from "./registry";
import { metricSeries } from "./values";
import { nightSeries, shiftDate } from "./series";
import { nightValue } from "./scores";
import { cardioView } from "./cardio";

export interface GoalPoint { key: string; value: number | null; status: GoalStatus }
export interface GoalState { def: GoalDef; target: number; current: GoalPoint; history: GoalPoint[]; completion: ReturnType<typeof completion> }

/**
 * Goal progress and history (goals@1): daily goals over the last 28 days, weekly goals over the last 8 ISO weeks.
 * Only goals you set are evaluated. The current (incomplete) day or week is never counted as missed.
 */
export function goalsView(db: DB, today: string, fbOffsetS: number, tz: string): { set: GoalState[]; unset: GoalDef[] } {
  const g = getSettings(db).goals;
  const from = shiftDate(today, -27);
  const days = daysBetween(from, today);
  const series = (id: string) => metricSeries(db, METRIC_BY_ID.get(id)!, from, today, fbOffsetS);
  let steps: Map<string, number> | null = null, active: Map<string, number> | null = null;
  let nights: ReturnType<typeof nightSeries>["nights"] | null = null;
  let weeks: ReturnType<typeof cardioView>["weeks"] | null = null;
  const set: GoalState[] = [];
  for (const def of GOAL_DEFS) {
    const target = g[def.id as GoalId];
    if (target === null) continue;
    let history: GoalPoint[];
    if (def.period === "week") {
      weeks ??= cardioView(db, today, fbOffsetS, tz).weeks.slice(-8);
      history = weeks.map((w) => {
        const value = def.id === "azmWeekly" ? w.azm : def.id === "zone2WeeklyMin" ? w.zone2Min : w.sessions;
        return { key: w.start, value, status: evaluateAtLeast(value, target, !w.partial) };
      });
    } else if (def.kind === "atLeast" && def.id !== "sleepMin") {
      const s = def.id === "stepsDaily" ? (steps ??= series("steps")) : (active ??= series("active_min"));
      history = days.map((d) => ({ key: d, value: s.get(d) ?? null, status: evaluateAtLeast(s.get(d) ?? null, target, d < today) }));
    } else {
      nights ??= nightSeries(db, from, today, fbOffsetS).nights;
      history = days.map((d) => {
        const n = nights!.get(d);
        const value = def.id === "sleepMin" ? n?.minutesAsleep ?? null : nightValue(n, def.id === "bedtimeMin" ? "bedtime" : "wake");
        let status: GoalStatus = def.id === "sleepMin" ? evaluateAtLeast(value, target, d < today)
          : def.id === "bedtimeMin" ? evaluateBedtime(value, target) : evaluateWake(value, target);
        if (d === today && value === null) status = "inProgress"; // tonight's sleep may still sync
        return { key: d, value, status };
      });
    }
    const current = history[history.length - 1]!;
    set.push({ def, target, current, history, completion: completion(history.slice(0, -1).map((h) => h.status).concat(current.status === "inProgress" ? [] : [current.status])) });
  }
  return { set, unset: GOAL_DEFS.filter((d) => g[d.id as GoalId] === null) };
}
