import type { DB } from "../db/client";
import { getSettings } from "../settings";
import { listWeights } from "../weight";
import { civilDate } from "@/lib/time";
import { daysBetween } from "@/lib/metrics/periods";
import { energyBalance } from "@/lib/metrics/associations";
import { weightChange, weightGoalProgress, weightTrend } from "@/lib/metrics/weight";
import { METRIC_BY_ID } from "./registry";
import { metricSeries } from "./values";
import { shiftDate } from "./series";

/**
 * Weight & energy (body.ts): raw weigh-ins (Google + manual), daily means, smoothed trend, weekly / monthly change,
 * weight goal, energy expenditure history and — only when intake data exists — an estimated energy balance.
 */
export function bodyView(db: DB, today: string, fbOffsetS: number, tz: string) {
  const s = getSettings(db);
  const from = shiftDate(today, -364);
  const entries = listWeights(db, Date.parse(`${from}T00:00:00Z`) - 86_400_000, Date.now() + 86_400_000)
    .map((e) => ({ ...e, date: civilDate(e.tMs, e.offsetS, tz) })).filter((e) => e.date >= from && e.date <= today);
  const byDay = new Map<string, number[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.kg]);
  const daily = [...byDay].map(([date, v]) => ({ date, weightKg: v.reduce((a, b) => a + b, 0) / v.length }));
  const trend = weightTrend(daily);
  const days90 = daysBetween(shiftDate(today, -89), today);
  const total = metricSeries(db, METRIC_BY_ID.get("total_kcal")!, days90[0]!, today, fbOffsetS);
  const active = metricSeries(db, METRIC_BY_ID.get("active_kcal")!, days90[0]!, today, fbOffsetS);
  const intake = new Map<string, number>(); // no intake source connected yet (roadmap R10)
  const complete = days90.filter((d) => d < today);
  return {
    entries: entries.reverse(),
    trend,
    latest: trend.at(-1) ?? null,
    week: weightChange(trend, today, 7),
    month: weightChange(trend, today, 30),
    goal: s.goals.weightKg !== null ? { targetKg: s.goals.weightKg, ...weightGoalProgress(trend, today, s.goals.weightKg) } : null,
    energy: {
      points: days90.map((d) => ({ date: d, total: total.get(d) ?? null, active: active.get(d) ?? null })),
      balance: energyBalance(intake, total, complete.slice(-14)),
      intakeSource: null as string | null,
    },
  };
}
