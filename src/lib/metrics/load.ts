import { sliceSamples, type HrSample } from "./heart-rate";
import { ewmaLoad } from "./training-load";

/**
 * Cardiovascular load from heart rate. Documented in docs/CALCULATIONS.md (§ LOAD-EDWARDS, LOAD-ZONES, LOAD-ACWR).
 *
 * Zones are %HRmax bands (Edwards 1993):  Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 ≥ 90 % HRmax.
 * Edwards TRIMP = Σ minutes in zone i × i  (i = 1..5). Sex-neutral; needs only HRmax.
 * Ref: Edwards S. (1993) The Heart Rate Monitor Book. Polar Electro; used e.g. in Foster et al. (2001) J Strength Cond Res 15:109.
 *
 * Gap handling as in HR-STATS: each sample represents the time to the next sample, capped at `maxGapS`;
 * longer gaps are missing data (not zero HR, not interpolated) and reduce `coverage`.
 */
export const EDWARDS_VERSION = "trimp-edwards@1";
export const PCT_HRMAX_ZONES = [0.5, 0.6, 0.7, 0.8, 0.9] as const; // lower bounds of Z1..Z5

export interface ZoneLoad {
  version: string;
  /** Minutes in Z1..Z5 (index 0..4). */
  zoneMinutes: [number, number, number, number, number];
  belowMinutes: number;
  trimp: number;
  coveredMinutes: number;
  coverage: number;
}

export function zoneLoad(all: HrSample[], startMs: number, endMs: number, hrMax: number, maxGapS = 30): ZoneLoad {
  if (!(hrMax > 0)) throw new Error("hrMax must be positive");
  const s = sliceSamples(all, startMs, endMs);
  const zm: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let below = 0, covered = 0;
  s.forEach((x, i) => {
    const next = i + 1 < s.length ? s[i + 1]!.tMs : endMs;
    const min = Math.max(0, Math.min((next - x.tMs) / 1000, maxGapS)) / 60;
    covered += min;
    const pct = x.bpm / hrMax;
    let z = -1;
    for (let k = PCT_HRMAX_ZONES.length - 1; k >= 0; k--) if (pct >= PCT_HRMAX_ZONES[k]!) { z = k; break; }
    if (z < 0) below += min; else zm[z] = zm[z]! + min;
  });
  const windowMin = (endMs - startMs) / 60_000;
  return {
    version: EDWARDS_VERSION, zoneMinutes: zm, belowMinutes: below,
    trimp: zm.reduce((a, m, i) => a + m * (i + 1), 0),
    coveredMinutes: covered, coverage: windowMin > 0 ? Math.min(1, covered / windowMin) : 0,
  };
}

/**
 * HRmax used for zones, in order of preference:
 *  1. owner override (Settings);
 *  2. Google's own model: 220 − age (Fox et al. 1971), with age from the Google Health profile. Verified on real data:
 *     Google's daily-heart-rate-zones bounds are exactly 40 / 60 / 85 % of heart-rate reserve with HRmax = 220 − age.
 *     Using the same HRmax keeps our zones consistent with Google's AZM zones.
 * Returns the source so the UI can say which. (Tanaka 2001, 208 − 0.7·age, is documented as an alternative but not
 * used by default, to stay consistent with Google.)
 */
export function chooseHrMax(o: { override?: number | null; age?: number | null }): { hrMax: number; source: "override" | "google-220-age" } | null {
  if (o.override && o.override > 100) return { hrMax: o.override, source: "override" };
  if (o.age && o.age > 0) return { hrMax: 220 - o.age, source: "google-220-age" };
  return null;
}

/**
 * Acute:chronic workload ratio and training balance from daily loads (oldest first; null = untracked day).
 * ACWR = EWMA7 / EWMA28 (Williams et al. 2017 BJSM 51:209). Bands after Gabbett (2016) BJSM 50:273:
 *   < 0.8 under-training · 0.8–1.3 "sweet spot" · 1.3–1.5 caution · > 1.5 high risk.
 * Balance = chronic − acute (Banister fitness–fatigue idea; positive = fresher than usual).
 * Calibration: needs ≥ 21 tracked days within the last 28 before the ratio is reported.
 */
export const ACWR_VERSION = "acwr-ewma@2";

/**
 * Which daily loads count as "tracked" for ACWR (acwr-ewma@2):
 *  - the current civil day is incomplete, so it is left out (its partial load would pull the acute EWMA down every
 *    morning); the ratio therefore describes the state after the last complete day;
 *  - a day counts only if heart rate covered ≥ 10 h (600 min). Shorter wear would record artificially low load.
 *    10 h is the conventional valid-day criterion for wearable/accelerometer data (Troiano et al. 2008 MSSE 40:181).
 * Anything else is a gap (null), never zero load.
 */
export const LOAD_MIN_WORN_MIN = 600;
export function trackedLoad(load: number | null, wornMin: number | null, isComplete: boolean): number | null {
  if (!isComplete || load === null || wornMin === null || wornMin < LOAD_MIN_WORN_MIN) return null;
  return load;
}
export type AcwrBand = "low" | "optimal" | "caution" | "high";

export function acwr(daily: (number | null)[], minTrackedDays = 21) {
  const series = ewmaLoad(daily);
  const last = series.at(-1);
  const tracked = daily.slice(-28).filter((d) => d !== null).length;
  const calibrated = tracked >= minTrackedDays;
  const ratio = calibrated && last?.acute != null && last.chronic ? last.acute / last.chronic : null;
  const band: AcwrBand | null = ratio === null ? null : ratio < 0.8 ? "low" : ratio <= 1.3 ? "optimal" : ratio <= 1.5 ? "caution" : "high";
  return { version: ACWR_VERSION, acute: last?.acute ?? null, chronic: last?.chronic ?? null, ratio, band, balance: calibrated ? last?.balance ?? null : null, trackedDays: tracked, requiredDays: minTrackedDays, series };
}
