import type { DB } from "../db/client";
import { getSettings } from "../settings";
import { listPhases, weightData, type WeightEntryLocal } from "../weight";
import { trendAt, weightChange, weightGoalProgress } from "@/lib/metrics/weight";
import { addDays, consistency, extremes, phaseOn, phaseProgress, weekOverWeek, type DailyWeight } from "@/lib/metrics/weight-tracker";

export const WEIGHT_RANGES = { "7d": 7, "30d": 30, "90d": 90, "6m": 182, "1y": 365, all: 0 } as const;
export type WeightRange = keyof typeof WEIGHT_RANGES;
export const isWeightRange = (v: unknown): v is WeightRange => typeof v === "string" && v in WEIGHT_RANGES;

const timeFmt = (tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

/** What the quick-log card needs: today's status, the last weight to prefill, and recent days for corrections. */
export function quickLog(data: ReturnType<typeof weightData>, today: string, tz: string) {
  const tf = timeFmt(tz);
  const byKey = new Map(data.entries.map((e) => [e.key, e]));
  const recent: Record<string, { kg: number; manual: boolean; note: string | null; time: string; source: string }> = {};
  for (const d of data.daily.filter((x) => x.date >= addDays(today, -13))) {
    const e = byKey.get(d.key)!;
    recent[d.date] = { kg: d.weightKg, manual: e.manual, note: e.note, time: tf.format(e.tMs), source: e.source };
  }
  // Prefill with the last DAY's weight (its morning weigh-in), not an evening reading.
  const last = data.daily.at(-1) ?? null;
  return { today, recent, lastKg: last?.weightKg ?? null, lastDate: last?.date ?? null };
}
export type QuickLogData = ReturnType<typeof quickLog>;

/**
 * Weight dashboard read model (weight-trend@2, weight-stats@1). Measured values, trend estimates and projections are
 * returned separately so the UI can label each. Statistics that need more weigh-ins return null instead of a guess.
 */
export function weightView(db: DB, today: string, fbOffsetS: number, tz: string, range: WeightRange) {
  const data = weightData(db, fbOffsetS);
  const { daily, trend, entries } = data;
  const settings = getSettings(db);
  const first = daily[0] ?? null;
  const from = range === "all" ? first?.date ?? today : addDays(today, -(WEIGHT_RANGES[range] - 1));
  const tf = timeFmt(tz);
  const trendByDate = new Map(trend.map((p) => [p.date, p.trendKg]));
  const entriesByDate = new Map<string, WeightEntryLocal[]>();
  for (const e of entries) entriesByDate.set(e.date, [...(entriesByDate.get(e.date) ?? []), e]);

  const phases = listPhases(db);
  const current = phaseOn(phases, today);
  const phaseRows = [...phases].reverse().map((p) => ({ phase: p, progress: phaseProgress(p, daily, trend, today), current: p.id === current?.id }));
  const trendNow = trendAt(trend, today);
  const goalKg = current?.goalKg ?? settings.goals.weightKg;
  const goalStart = current ? current.startKg : first?.weightKg ?? null;
  const goalFrac = goalKg !== null && goalStart !== null && trendNow !== null && Math.abs(goalKg - goalStart) >= 0.05 ? (trendNow - goalStart) / (goalKg - goalStart) : null;

  const point = (d: DailyWeight) => {
    const list = entriesByDate.get(d.date) ?? [];
    return {
      date: d.date, kg: d.weightKg, trendKg: trendByDate.get(d.date) ?? null, basis: d.basis,
      entries: list.map((e) => ({ key: e.key, tMs: e.tMs, time: tf.format(e.tMs), kg: e.kg, manual: e.manual, source: e.source, note: e.note, day: e.key === d.key })),
    };
  };
  const latest = entries.at(-1) ?? null;
  return {
    today, range, from, tz,
    hasData: daily.length > 0,
    latest: latest ? { kg: latest.kg, date: latest.date, time: tf.format(latest.tMs), source: latest.source, manual: latest.manual } : null,
    todayWeight: daily.find((d) => d.date === today) ?? null,
    trendNow,
    week: weekOverWeek(daily, today),
    month: weightChange(trend, today, 30),
    start: first ? { date: first.date, kg: first.weightKg } : null,
    totalChange: first && trendNow !== null ? trendNow - first.weightKg : null,
    extremes: extremes(daily, from, today),
    consistency: consistency(new Set(daily.map((d) => d.date)), today, 30),
    goal: goalKg !== null ? { kg: goalKg, fromPhase: Boolean(current?.goalKg), startKg: goalStart, progress: goalFrac, ...weightGoalProgress(trend, today, goalKg) } : null,
    phases: phaseRows, currentPhase: current,
    points: daily.filter((d) => d.date >= from && d.date <= today).map(point),
    rangeDays: Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000) + 1,
    quick: quickLog(data, today, tz),
  };
}
export type WeightView = ReturnType<typeof weightView>;

/** Chronological weigh-in history (newest first), grouped by day, with the day's chosen weigh-in marked. */
export function weightHistory(db: DB, fbOffsetS: number, tz: string, limitDays = 120) {
  const { daily, entries } = weightData(db, fbOffsetS);
  const tf = timeFmt(tz);
  const chosen = new Map(daily.map((d) => [d.date, d]));
  const byDate = new Map<string, WeightEntryLocal[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const dates = [...byDate.keys()].sort().reverse();
  return {
    totalDays: dates.length, totalEntries: entries.length,
    days: dates.slice(0, limitDays).map((date) => ({
      date, basis: chosen.get(date)!.basis,
      entries: byDate.get(date)!.map((e) => ({ key: e.key, tMs: e.tMs, sourceId: e.sourceId, time: tf.format(e.tMs), kg: e.kg, manual: e.manual, source: e.source, note: e.note, day: e.key === chosen.get(date)!.key })),
    })),
  };
}
