/**
 * Night-level sleep details: wake after sleep onset, recommended bedtime, usual times.
 * Pure (no database, no Node APIs). Documented in docs/CALCULATIONS.md § SLP-WASO, SLP-BEDTIME.
 */

/**
 * Wake after sleep onset (sleep-waso@1). WASO is the standard polysomnography measure of sleep fragmentation
 * (AASM scoring manual; Shrivastava et al. 2014 J Community Hosp Intern Med Perspect 4:24983):
 *   minutes AWAKE between the first and the last non-AWAKE stage of the night.
 * Interruptions = the number of those AWAKE segments. Google also flags "short awakenings" (brief arousals already
 * inside a sleep stage); they are counted separately and are not added to WASO.
 * Returns null when the night has no sleep stages.
 */
export const WASO_VERSION = "sleep-waso@1";
export function wakeAfterSleepOnset(stages: { startMs: number; endMs: number; stage: string; isShortAwakening?: boolean }[]) {
  const main = stages.filter((s) => !s.isShortAwakening).sort((a, b) => a.startMs - b.startMs);
  const asleep = main.filter((s) => s.stage !== "AWAKE");
  if (!asleep.length) return null;
  const onset = asleep[0]!.startMs, final = asleep[asleep.length - 1]!.endMs;
  const wakes = main.filter((s) => s.stage === "AWAKE" && s.startMs >= onset && s.endMs <= final);
  const minutes = wakes.map((s) => (s.endMs - s.startMs) / 60_000);
  return {
    version: WASO_VERSION,
    wasoMin: minutes.reduce((a, b) => a + b, 0),
    interruptions: wakes.length,
    longestMin: minutes.length ? Math.max(...minutes) : 0,
    shortAwakenings: stages.filter((s) => s.isShortAwakening).length,
  };
}

/**
 * Recommended bedtime (bedtime@1): when to get into bed to reach your sleep need before the wake-up target.
 *   time in bed = sleep need ÷ usual sleep efficiency (median of recent nights; needs ≥ 5 nights)
 *   bedtime     = wake-up target − time in bed
 * Google's sleep session runs from getting into bed to getting up, so the time to fall asleep and night-time wakings
 * are inside "time in bed" and already reflected in efficiency. With fewer than 5 nights the efficiency is unknown;
 * the result is then the bare minimum (need only) and labelled as such. Times are minutes after midnight (0–1439).
 */
export const BEDTIME_VERSION = "bedtime@1";
export function recommendedBedtime(i: { wakeMin: number; needMin: number; efficienciesPct: (number | null)[] }) {
  const eff = i.efficienciesPct.filter((e): e is number => e !== null && e > 0 && e <= 100).sort((a, b) => a - b);
  const median = eff.length >= 5 ? (eff.length % 2 ? eff[(eff.length - 1) / 2]! : (eff[eff.length / 2 - 1]! + eff[eff.length / 2]!) / 2) : null;
  const timeInBedMin = median !== null ? i.needMin / (median / 100) : i.needMin;
  const bedtimeMin = (((i.wakeMin - Math.round(timeInBedMin)) % 1440) + 1440) % 1440;
  return {
    version: BEDTIME_VERSION, bedtimeMin, timeInBedMin, efficiencyPct: median, nights: eff.length,
    basis: median !== null ? ("need-and-efficiency" as const) : ("need-only" as const),
  };
}

/** Median of clock times (minutes after midnight) that do not straddle midnight, e.g. wake-up times. */
export function medianMinutes(values: (number | null)[], minCount = 5): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length < minCount) return null;
  return v.length % 2 ? v[(v.length - 1) / 2]! : Math.round((v[v.length / 2 - 1]! + v[v.length / 2]!) / 2);
}
