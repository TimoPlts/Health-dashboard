/**
 * Sleep need, debt, score and regularity. Documented in docs/CALCULATIONS.md (§ SLP-NEED, SLP-DEBT, SLP-SCORE, SLP-SRI).
 * Inputs are Google's sleep sessions (stages + summary). App-specific; NOT the Fitbit Sleep Score.
 */

/** Default need: 8 h, the midpoint of the 7–9 h adult recommendation (Hirshkowitz et al. 2015 Sleep Health 1:40;
 *  Watson et al. 2015 AASM/SRS consensus, ≥ 7 h). Adjustable in Settings. A population value, labelled as estimate. */
export const SLEEP_NEED_VERSION = "sleep-need@1";
export const DEFAULT_SLEEP_NEED_MIN = 480;

/**
 * Sleep debt (sleep-debt@1): Σ max(0, need − asleep) over the last `nights` nights that have data.
 * Surplus sleep does not cancel earlier debt (conservative simplification). Nights without data are skipped and
 * reported via `tracked` — they are never counted as zero sleep.
 */
export const SLEEP_DEBT_VERSION = "sleep-debt@1";
export function sleepDebt(asleepPerNight: (number | null)[], needMin: number, nights = 7) {
  const window = asleepPerNight.slice(-nights);
  const tracked = window.filter((x): x is number => x !== null);
  if (tracked.length === 0) return null;
  return { version: SLEEP_DEBT_VERSION, debtMin: tracked.reduce((a, m) => a + Math.max(0, needMin - m), 0), tracked: tracked.length, nights };
}

/**
 * Sleep score (sleep-score@1), 0–100. Components, each 0–100:
 *  duration   = 100·min(1, asleep / need)                                         weight 0.50
 *  efficiency = linear 0 at ≤ 70 % → 100 at ≥ 90 % (85 % = clinical threshold → 75)   weight 0.20
 *  deep       = 100 inside 13–23 % of sleep, linear to 0 at 0 % / 40 %                 weight 0.15
 *  REM        = 100 inside 20–25 % of sleep, linear to 0 at 0 % / 45 %                 weight 0.15
 * Ranges: adult norms, Ohayon et al. (2004) Sleep 27:1255; efficiency ≥ 85 % — Reed & Sacco (2016) J Clin Sleep Med 12:1405.
 * Weights are an app choice (duration dominates, as in most published consumer scores). Stage components are only
 * used when Google reports stages (`STAGES` type); otherwise weights are renormalised over the rest.
 */
export const SLEEP_SCORE_VERSION = "sleep-score@1";
const ramp = (x: number, lo0: number, lo100: number, hi100: number, hi0: number) =>
  x <= lo0 || x >= hi0 ? 0 : x < lo100 ? (100 * (x - lo0)) / (lo100 - lo0) : x <= hi100 ? 100 : (100 * (hi0 - x)) / (hi0 - hi100);

export function sleepScore(i: { minutesAsleep: number | null; efficiencyPct: number | null; deepMin?: number | null; remMin?: number | null; needMin: number }) {
  if (i.minutesAsleep === null || i.minutesAsleep <= 0) return null;
  const duration = 100 * Math.min(1, i.minutesAsleep / i.needMin);
  const efficiency = i.efficiencyPct === null ? null : Math.max(0, Math.min(100, ((i.efficiencyPct - 70) / 20) * 100));
  const deep = i.deepMin == null ? null : ramp((100 * i.deepMin) / i.minutesAsleep, 0, 13, 23, 40);
  const rem = i.remMin == null ? null : ramp((100 * i.remMin) / i.minutesAsleep, 0, 20, 25, 45);
  const parts = { duration, efficiency, deep, rem };
  const W = { duration: 0.5, efficiency: 0.2, deep: 0.15, rem: 0.15 };
  let w = 0, s = 0;
  for (const k of Object.keys(W) as (keyof typeof W)[]) if (parts[k] !== null) { w += W[k]; s += W[k] * parts[k]!; }
  return { version: SLEEP_SCORE_VERSION, score: s / w, components: parts };
}

/**
 * Sleep Regularity Index (sleep-sri@1), Phillips et al. (2017) Sci Rep 7:3216:
 *   SRI = −100 + 200 · P(same sleep/wake state at time t and t + 24 h), over consecutive day pairs, minute resolution.
 * 100 = perfectly regular, 0 = random. Input: asleep intervals (non-AWAKE stages) and the analysed span.
 * Assumption: outside recorded sleep the wearer is awake (daytime sleep is only known if Google records a nap).
 * Requires ≥ 5 recorded nights in the span; days the device was not worn at night lower validity and are excluded
 * via `dayStarts` (only pairs where both nights were recorded are compared).
 * sleep-sri@2: callers pass NOON-TO-NOON windows (local noon before each wake date), so each 24 h window contains exactly
 * one night. With midnight windows the evening of day d compared against the start of an unrecorded night d+2.
 */
export const SRI_VERSION = "sleep-sri@2";
export function sleepRegularityIndex(asleep: { startMs: number; endMs: number }[], dayStarts: number[]) {
  if (dayStarts.length < 5) return null;
  const MIN = 60_000, DAY = 86_400_000;
  // Minute bitmap over the analysed span (asleep = 1).
  const origin = Math.min(...dayStarts), span = Math.max(...dayStarts) + 2 * DAY - origin;
  const bits = new Uint8Array(Math.ceil(span / MIN));
  for (const iv of asleep) {
    const a = Math.max(0, Math.floor((iv.startMs - origin) / MIN)), b = Math.min(bits.length, Math.ceil((iv.endMs - origin) / MIN));
    for (let k = a; k < b; k++) bits[k] = 1;
  }
  const isAsleep = (t: number) => bits[Math.floor((t - origin) / MIN)] === 1;
  const days = new Set(dayStarts);
  let same = 0, total = 0;
  for (const d of dayStarts) {
    if (!days.has(d + DAY)) continue;
    for (let t = d; t < d + DAY; t += MIN) { total++; if (isAsleep(t) === isAsleep(t + DAY)) same++; }
  }
  if (total === 0) return null;
  return { version: SRI_VERSION, sri: -100 + (200 * same) / total, pairs: total / 1440 };
}

/** Circular SD (minutes) of sleep midpoints — a simpler regularity measure (lower = more regular). Needs ≥ 5 nights. */
export const MIDPOINT_SD_VERSION = "sleep-midpoint-sd@1";
export function midpointVariability(midpointsMs: number[], utcOffsetsS: (number | null)[]) {
  if (midpointsMs.length < 5) return null;
  const angles = midpointsMs.map((t, i) => {
    const local = t + (utcOffsetsS[i] ?? 0) * 1000;
    return ((local % 86_400_000) / 86_400_000) * 2 * Math.PI;
  });
  const C = angles.reduce((a, x) => a + Math.cos(x), 0) / angles.length, S = angles.reduce((a, x) => a + Math.sin(x), 0) / angles.length;
  const R = Math.min(1, Math.sqrt(C * C + S * S));
  const sdRad = Math.sqrt(-2 * Math.log(Math.max(R, 1e-9)));
  let meanAngle = Math.atan2(S, C); if (meanAngle < 0) meanAngle += 2 * Math.PI;
  return { version: MIDPOINT_SD_VERSION, sdMin: (sdRad / (2 * Math.PI)) * 1440, meanMinuteOfDay: (meanAngle / (2 * Math.PI)) * 1440, nights: midpointsMs.length };
}
