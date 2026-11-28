/**
 * Weight tracker (weight-trend@2 daily selection, weight-stats@1). Pure: no database, no Node APIs; shared with the
 * future iOS app. Documented in docs/CALCULATIONS.md § WEIGHT. Measured weights, trend estimates and projections are
 * kept apart: nothing here turns a day-to-day fluctuation into "fat gained" or "fat lost".
 */
import { trendAt, type WeightPoint } from "./weight";

export const WEIGHT_STATS_VERSION = "weight-stats@1";
/** Local time window that counts as "morning" when no weigh-in was designated for a day. */
export const MORNING_FROM_MIN = 3 * 60;
export const MORNING_TO_MIN = 12 * 60;

const DAY = 86_400_000;
const dms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(dms(d) + n * DAY).toISOString().slice(0, 10);
type Daily = { date: string; weightKg: number };
const inRange = <T extends { date: string }>(daily: T[], from: string, to: string) => daily.filter((p) => p.date >= from && p.date <= to);

export interface WeighIn { key: string; date: string; tMs: number; localMin: number; kg: number; manual: boolean }
export type DailyBasis = "chosen" | "morning" | "first";
export interface DailyWeight { date: string; weightKg: number; key: string; basis: DailyBasis; count: number }

/**
 * One representative weight per civil day, because body weight varies by 1–2 kg over a day (food and fluid):
 *   1. the weigh-in designated as that day's morning weigh-in (if it still exists);
 *   2. otherwise the first weigh-in between 03:00 and 12:00 local time;
 *   3. otherwise the first weigh-in of the day.
 * Other weigh-ins stay stored and visible; they are just not the day's value. (weight-trend@1 averaged all of them.)
 */
export function selectDailyWeights(entries: WeighIn[], chosen: Map<string, string> = new Map()): DailyWeight[] {
  const byDay = new Map<string, WeighIn[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const out: DailyWeight[] = [];
  for (const [date, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.tMs - b.tMs);
    const pick = sorted.find((e) => e.key === chosen.get(date));
    const morning = sorted.find((e) => e.localMin >= MORNING_FROM_MIN && e.localMin < MORNING_TO_MIN);
    const e = pick ?? morning ?? sorted[0]!;
    out.push({ date, weightKg: e.kg, key: e.key, basis: pick ? "chosen" : morning ? "morning" : "first", count: list.length });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Mean of the daily weights in the `days` days ending on `end` (inclusive); null with fewer than `minDays` weigh-ins. */
export function rollingAverage(daily: Daily[], end: string, days = 7, minDays = 3) {
  const from = addDays(end, -(days - 1));
  const v = inRange(daily, from, end);
  if (v.length < minDays) return null;
  return { kg: v.reduce((a, p) => a + p.weightKg, 0) / v.length, n: v.length, from, to: end };
}

/**
 * Week-over-week change: the 7-day average ending today vs the 7 days before it (equal, adjacent periods). Each needs
 * at least 3 weigh-ins, otherwise the change is null. Percent is relative to the previous week's average.
 */
export function weekOverWeek(daily: Daily[], today: string, minDays = 3) {
  const current = rollingAverage(daily, today, 7, minDays), previous = rollingAverage(daily, addDays(today, -7), 7, minDays);
  const change = current && previous ? { kg: current.kg - previous.kg, pct: ((current.kg - previous.kg) / previous.kg) * 100 } : null;
  return { current, previous, change };
}

/** Lowest and highest daily weight in [from, to]; null when there is none. */
export function extremes(daily: Daily[], from: string, to: string) {
  const v = inRange(daily, from, to);
  if (!v.length) return null;
  const min = v.reduce((a, p) => (p.weightKg < a.weightKg ? p : a)), max = v.reduce((a, p) => (p.weightKg > a.weightKg ? p : a));
  return { min: { date: min.date, kg: min.weightKg }, max: { date: max.date, kg: max.weightKg }, n: v.length };
}

/**
 * Weigh-in consistency: days with a weigh-in among the last `days` days (today included) and the current streak of
 * consecutive days. Not having weighed yet today does not break the streak (it then counts from yesterday).
 */
export function consistency(dates: Set<string>, today: string, days = 30) {
  let logged = 0;
  for (let i = 0; i < days; i++) if (dates.has(addDays(today, -i))) logged++;
  let streak = 0;
  let d = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(d)) { streak++; d = addDays(d, -1); }
  return { logged, days, share: logged / days, streak };
}

/**
 * Observed rate of change: least-squares slope of daily weights against time, in kg per week. Robust to irregular
 * weigh-ins (no gap filling). Needs ≥ 5 weigh-ins spanning ≥ 14 days; otherwise null.
 */
export function observedRate(daily: Daily[], from: string, to: string, minN = 5, minSpanDays = 14) {
  const v = inRange(daily, from, to);
  if (v.length < minN) return null;
  const xs = v.map((p) => (dms(p.date) - dms(v[0]!.date)) / DAY), ys = v.map((p) => p.weightKg);
  if (xs[xs.length - 1]! < minSpanDays) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / sxx;
  return { kgPerWeek: slope * 7, n: v.length, spanDays: xs[xs.length - 1]! };
}

export const PHASE_KINDS = ["cut", "maintain", "bulk"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];
export const PHASE_LABEL: Record<PhaseKind, string> = { cut: "Cutting", maintain: "Maintaining", bulk: "Bulking" };
export interface WeightPhase { id: string; kind: PhaseKind; name: string; startDate: string; startKg: number; endDate: string | null; goalKg: number | null; targetRateKgWeek: number | null }

/** The phase covering `date` (the latest start wins if several do). */
export function phaseOn(phases: WeightPhase[], date: string): WeightPhase | null {
  return phases.filter((p) => p.startDate <= date && (p.endDate === null || p.endDate >= date)).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

/**
 * Progress of a phase as of `asOf` (or its end date):
 *   change          = trend − starting weight (trend since the phase start; null before the first weigh-in in it)
 *   observed rate   = observedRate() over the phase
 *   goal progress   = change ÷ (goal − start): share of the planned distance covered by the trend (can be < 0 or > 1)
 *   projection      = weeks to the goal at the observed rate, only when that rate moves toward the goal
 * Descriptive only: no calorie target or rate is ever prescribed.
 */
export function phaseProgress(p: WeightPhase, daily: Daily[], trend: WeightPoint[], asOf: string) {
  const end = p.endDate && p.endDate < asOf ? p.endDate : asOf;
  const inPhase = trend.filter((t) => t.date >= p.startDate);
  const now = trendAt(inPhase, end);
  const days = Math.max(0, Math.round((dms(end) - dms(p.startDate)) / DAY));
  const rate = observedRate(daily, p.startDate, end);
  const change = now !== null ? now - p.startKg : null;
  const toGoal = p.goalKg !== null && now !== null ? p.goalKg - now : null;
  const span = p.goalKg !== null ? p.goalKg - p.startKg : null;
  const progress = span !== null && change !== null && Math.abs(span) >= 0.05 ? change / span : null;
  const toward = rate !== null && toGoal !== null && Math.abs(rate.kgPerWeek) > 0.02 && Math.abs(toGoal) >= 0.05 && Math.sign(rate.kgPerWeek) === Math.sign(toGoal);
  return {
    end, days, weeks: days / 7, trendKg: now, change, rate, toGoal, progress,
    projectedWeeks: toward ? Math.abs(toGoal! / rate!.kgPerWeek) : null,
    weighIns: inRange(daily, p.startDate, end).length,
  };
}

/** Validate a phase from untrusted input. Returns an error message or null. */
export function phaseProblem(p: Pick<WeightPhase, "startDate" | "endDate" | "startKg" | "goalKg" | "targetRateKgWeek" | "kind">): string | null {
  if (p.endDate !== null && p.endDate < p.startDate) return "The end date is before the start date.";
  if (!(p.startKg >= 25 && p.startKg <= 350)) return "Starting weight must be between 25 and 350 kg.";
  if (p.goalKg !== null && !(p.goalKg >= 25 && p.goalKg <= 350)) return "Goal weight must be between 25 and 350 kg.";
  if (p.targetRateKgWeek !== null && Math.abs(p.targetRateKgWeek) > 2) return "Target rate must be within ±2 kg per week.";
  return null;
}
