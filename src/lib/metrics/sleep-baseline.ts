/**
 * Sleep and baseline metrics. Documented in docs/CALCULATIONS.md (§ SLP-*, BASE-*).
 */
export const SLEEP_EFFICIENCY_VERSION = "sleep-efficiency@1";
export const BASELINE_VERSION = "baseline-rolling@1";

/**
 * Sleep efficiency = total sleep time / time in bed × 100.
 * Time in bed = session interval (Google's sleep interval spans from going to bed to getting up).
 * Ref: AASM scoring manual definitions; Reed & Sacco (2016) J Clin Sleep Med 12:1405.
 */
export function sleepEfficiency(minutesAsleep: number | null, timeInBedMin: number | null): number | null {
  if (minutesAsleep === null || timeInBedMin === null || timeInBedMin <= 0) return null;
  return Math.min(100, (minutesAsleep / timeInBedMin) * 100);
}

/** Minutes per stage from stage segments, excluding short awakenings already counted inside longer stages. */
export function stageMinutes(stages: { startMs: number; endMs: number; stage: string; isShortAwakening?: boolean }[]) {
  const out: Record<string, number> = {};
  for (const s of stages) {
    if (s.isShortAwakening) continue;
    out[s.stage] = (out[s.stage] ?? 0) + (s.endMs - s.startMs) / 60_000;
  }
  return out;
}

/**
 * Personal rolling baseline: mean and SD of the previous `window` daily values (excluding the current day).
 * Requires at least `minDays` values; otherwise returns null (baseline not yet established).
 * Deviation is reported as a z-score. HRV is analysed on ln(rMSSD), as recommended by Plews et al. (2013)
 * Sports Med 43:773–781, because rMSSD is right-skewed.
 */
export interface Baseline { version: string; mean: number; sd: number; n: number }

export function rollingBaseline(previous: (number | null)[], window = 28, minDays = 14, transform: (x: number) => number = (x) => x): Baseline | null {
  const vals = previous.slice(-window).filter((v): v is number => v !== null && Number.isFinite(v)).map(transform);
  if (vals.length < minDays) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  return { version: BASELINE_VERSION, mean, sd, n: vals.length };
}

export function zScore(value: number, b: Baseline, transform: (x: number) => number = (x) => x): number | null {
  if (b.sd === 0) return null;
  return (transform(value) - b.mean) / b.sd;
}
