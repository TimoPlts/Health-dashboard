/**
 * Body-weight trend (weight-trend@1). Pure; documented in docs/CALCULATIONS.md § WEIGHT.
 *
 * Daily weight = mean of that day's entries. The trend is an exponentially smoothed average that "moves 10 % of the
 * way" toward each new weight per day (Walker, The Hacker's Diet, 1991), made time-aware for irregular weighing:
 *   trend_i = trend_{i−1} + (1 − 0.9^Δdays) · (weight_i − trend_{i−1}),  trend_0 = first weight.
 * Day-to-day water and food swings (often ±1 kg) are damped; between weigh-ins the trend is held, never invented.
 * Weekly / monthly change = trend now − trend 7 / 30 days earlier, reported only with enough entries:
 *   week: ≥ 2 entries in the last 14 days and history ≥ 7 days;  month: ≥ 4 entries in the last 45 days and history ≥ 30 days.
 */
export const WEIGHT_TREND_VERSION = "weight-trend@1";
const DAY = 86_400_000;
const dms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface WeightPoint { date: string; weightKg: number; trendKg: number }

export function weightTrend(daily: { date: string; weightKg: number }[], dailyAlpha = 0.1): WeightPoint[] {
  const pts = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const out: WeightPoint[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev) { out.push({ ...p, trendKg: p.weightKg }); continue; }
    const dd = Math.max(1, Math.round((dms(p.date) - dms(prev.date)) / DAY));
    const k = 1 - Math.pow(1 - dailyAlpha, dd);
    out.push({ ...p, trendKg: prev.trendKg + k * (p.weightKg - prev.trendKg) });
  }
  return out;
}

/** Trend value as of `date` (held since the last weigh-in on or before it); null before the first entry. */
export function trendAt(points: WeightPoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of points) { if (p.date > date) break; v = p.trendKg; }
  return v;
}

export function weightChange(points: WeightPoint[], asOf: string, days: 7 | 30) {
  if (!points.length) return null;
  const minEntries = days === 7 ? 2 : 4, window = days === 7 ? 14 : 45;
  const from = new Date(dms(asOf) - window * DAY).toISOString().slice(0, 10);
  const recent = points.filter((p) => p.date > from && p.date <= asOf).length;
  const historyDays = (dms(asOf) - dms(points[0]!.date)) / DAY;
  if (recent < minEntries || historyDays < days) return null;
  const now = trendAt(points, asOf), before = trendAt(points, new Date(dms(asOf) - days * DAY).toISOString().slice(0, 10));
  return now !== null && before !== null ? { kg: now - before, days, entries: recent } : null;
}

/**
 * Toward a target weight: remaining kg and, only if the 4-week trend moves toward the target and history is ≥ 21
 * days, a projection in weeks at that rate. A projection, not a prediction.
 */
export function weightGoalProgress(points: WeightPoint[], asOf: string, targetKg: number) {
  const now = trendAt(points, asOf);
  if (now === null) return null;
  const remaining = targetKg - now;
  const m = points.length && (dms(asOf) - dms(points[0]!.date)) / DAY >= 21 ? weightChange(points, asOf, 30) : null;
  const ratePerWeek = m ? (m.kg / 30) * 7 : null;
  const toward = ratePerWeek !== null && Math.abs(ratePerWeek) > 0.02 && Math.sign(ratePerWeek) === Math.sign(remaining);
  return { trendKg: now, remainingKg: remaining, ratePerWeek, projectedWeeks: toward ? Math.abs(remaining / ratePerWeek!) : null };
}
