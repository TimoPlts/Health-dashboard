/**
 * Personal normal ranges for the health monitor (personal-range@1). Pure; documented in docs/CALCULATIONS.md § RANGE.
 *
 * Method (the same rolling baseline Baseline already uses for recovery, BASE-ROLLING):
 *   - Window: the 28 days BEFORE the day being assessed (the day itself never shapes its own range).
 *   - At least 14 values are required; before that the range is "calibrating".
 *   - Range = mean ± 1 SD (sample SD). For right-skewed measures (HRV) the statistics are computed on ln(x) and
 *     back-transformed, so the range is exp(μ ± σ) — asymmetric in ms, symmetric in ln (Plews et al. 2013).
 *   - Deviation = z-score (x − μ) / σ on the same scale, plus the plain difference from the typical value.
 *   - Position: "within" |z| ≤ 1, "above"/"below" 1 < |z| ≤ 2, "well above"/"well below" |z| > 2.
 * These are statistical descriptions of YOUR data only: not reference ranges, not a diagnosis, not a risk score.
 * With a normal distribution about 68 % of days fall inside ±1 SD, so being outside on a single day is common.
 */
export const PERSONAL_RANGE_VERSION = "personal-range@1";
export const RANGE_WINDOW_DAYS = 28;
export const RANGE_MIN_DAYS = 14;

export type RangeScale = "linear" | "log";
export type RangePosition = "within" | "above" | "below" | "wellAbove" | "wellBelow";

export type PersonalRange =
  | { status: "ok"; version: string; scale: RangeScale; typical: number; low: number; high: number; mu: number; sigma: number; n: number }
  | { status: "calibrating"; version: string; have: number; need: number };

/** `previous` = daily values before the assessed day, oldest first; null = no data that day. */
export function personalRange(previous: (number | null)[], scale: RangeScale = "linear", window = RANGE_WINDOW_DAYS, minDays = RANGE_MIN_DAYS): PersonalRange {
  const vals = previous.slice(-window).filter((v): v is number => v !== null && Number.isFinite(v) && (scale === "linear" || v > 0));
  if (vals.length < minDays) return { status: "calibrating", version: PERSONAL_RANGE_VERSION, have: vals.length, need: minDays };
  const t = scale === "log" ? vals.map(Math.log) : vals;
  const mu = t.reduce((a, b) => a + b, 0) / t.length;
  const sigma = Math.sqrt(t.reduce((a, b) => a + (b - mu) ** 2, 0) / (t.length - 1));
  const back = (x: number) => (scale === "log" ? Math.exp(x) : x);
  return { status: "ok", version: PERSONAL_RANGE_VERSION, scale, typical: back(mu), low: back(mu - sigma), high: back(mu + sigma), mu, sigma, n: vals.length };
}

export interface Deviation { z: number | null; diff: number; position: RangePosition | null }

/** Deviation of `value` from a calibrated range. z is null when the range has no spread (σ = 0). */
export function deviation(value: number, r: Extract<PersonalRange, { status: "ok" }>): Deviation {
  const diff = value - r.typical;
  if (!(r.sigma > 0) || (r.scale === "log" && value <= 0)) return { z: null, diff, position: null };
  const z = ((r.scale === "log" ? Math.log(value) : value) - r.mu) / r.sigma;
  const a = Math.abs(z);
  const position: RangePosition = a <= 1 ? "within" : a <= 2 ? (z > 0 ? "above" : "below") : z > 0 ? "wellAbove" : "wellBelow";
  return { z, diff, position };
}

/** Share of the last `days` days that have a value (0–1), and the count. Missing days are never filled. */
export function completeness(values: (number | null)[], days = RANGE_WINDOW_DAYS) {
  const last = values.slice(-days);
  const have = last.filter((v) => v !== null && Number.isFinite(v)).length;
  return { have, of: days, share: days > 0 ? have / days : 0 };
}

export const POSITION_TEXT: Record<RangePosition, string> = {
  within: "Within your normal range",
  above: "Above your normal range",
  below: "Below your normal range",
  wellAbove: "Well above your normal range",
  wellBelow: "Well below your normal range",
};
