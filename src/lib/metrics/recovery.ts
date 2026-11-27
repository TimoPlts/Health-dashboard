import { rollingBaseline, type Baseline } from "./sleep-baseline";

/**
 * Recovery, readiness and fatigue indicators. Documented in docs/CALCULATIONS.md (§ REC-*).
 * Inputs are Google's own nightly values (daily-heart-rate-variability rMSSD, daily-resting-heart-rate) — we do not
 * recompute what Google measures. What we add is the comparison with YOUR baseline.
 *
 * These are app-specific indices. They are NOT Fitbit Daily Readiness, WHOOP Recovery or Bevel/Athlytic scores.
 */
export const BASELINE_WINDOW = 28;
export const BASELINE_MIN_DAYS = 14;

export type Calibrating = { status: "calibrating"; have: number; need: number };
export type BaselineResult = ({ status: "ok" } & Baseline) | Calibrating;

/** HRV is analysed on ln(rMSSD) (Plews et al. 2013 Sports Med 43:773). `previous` excludes the current day. */
export function hrvBaseline(previous: (number | null)[]): BaselineResult {
  return wrap(rollingBaseline(previous, BASELINE_WINDOW, BASELINE_MIN_DAYS, Math.log), previous);
}
export function rhrBaseline(previous: (number | null)[]): BaselineResult {
  return wrap(rollingBaseline(previous, BASELINE_WINDOW, BASELINE_MIN_DAYS), previous);
}
function wrap(b: Baseline | null, previous: (number | null)[]): BaselineResult {
  const have = previous.slice(-BASELINE_WINDOW).filter((v) => v !== null && Number.isFinite(v)).length;
  return b ? { status: "ok", ...b } : { status: "calibrating", have, need: BASELINE_MIN_DAYS };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Recovery index (recovery@1), 0–100. Components (each 0–100):
 *   HRV   = 100·Φ(z),  z = (ln rMSSD_today − μ_ln) / σ_ln        (higher HRV than usual → higher)
 *   RHR   = 100·Φ(−z), z = (RHR_today − μ) / σ                    (lower RHR than usual → higher)
 *   Sleep = 100·min(1, minutes asleep / sleep need)
 * Weights 0.45 / 0.30 / 0.25 (app choice: HRV is the most sensitive single marker of autonomic recovery,
 * Buchheit 2014 Front Physiol 5:73; RHR second).
 * recovery@2: the HRV component is REQUIRED (calibrated baseline + a value for the night). Without it the score would
 * be dominated by sleep duration (45 % of the renormalised weight) while still being called "recovery".
 * RHR and sleep are optional; when one is missing the remaining weights are renormalised and the UI lists them.
 * Φ(z) = the percentile of today's value within your own normal range, so 50 = a typical day for you.
 */
export const RECOVERY_VERSION = "recovery@2";
export const RECOVERY_WEIGHTS = { hrv: 0.45, rhr: 0.3, sleep: 0.25 } as const;

export interface RecoveryInput {
  hrvToday: number | null; hrvBaseline: BaselineResult;
  rhrToday: number | null; rhrBaseline: BaselineResult;
  minutesAsleep: number | null; sleepNeedMin: number;
}
export type RecoveryResult =
  | { status: "ok"; version: string; score: number; components: { hrv: number | null; rhr: number | null; sleep: number | null }; weights: Record<string, number> }
  | { status: "calibrating"; version: string; hrv: Calibrating | null; rhr: Calibrating | null }
  | { status: "missing"; version: string; reason: string };

export function recoveryIndex(i: RecoveryInput): RecoveryResult {
  const hrv = i.hrvToday !== null && i.hrvBaseline.status === "ok" && i.hrvBaseline.sd > 0
    ? 100 * normCdf((Math.log(i.hrvToday) - i.hrvBaseline.mean) / i.hrvBaseline.sd) : null;
  const rhr = i.rhrToday !== null && i.rhrBaseline.status === "ok" && i.rhrBaseline.sd > 0
    ? 100 * normCdf(-(i.rhrToday - i.rhrBaseline.mean) / i.rhrBaseline.sd) : null;
  const sleep = i.minutesAsleep !== null && i.sleepNeedMin > 0 ? 100 * Math.min(1, i.minutesAsleep / i.sleepNeedMin) : null;
  if (hrv === null) {
    const cal = (b: BaselineResult) => (b.status === "calibrating" ? b : null);
    if (i.hrvBaseline.status === "calibrating") {
      return { status: "calibrating", version: RECOVERY_VERSION, hrv: cal(i.hrvBaseline), rhr: cal(i.rhrBaseline) };
    }
    return { status: "missing", version: RECOVERY_VERSION, reason: i.hrvToday === null ? "No overnight HRV for this day" : "HRV baseline has no spread yet" };
  }
  const parts = { hrv, rhr, sleep };
  let wSum = 0, sum = 0;
  const weights: Record<string, number> = {};
  for (const k of ["hrv", "rhr", "sleep"] as const) {
    const v = parts[k];
    if (v === null) continue;
    wSum += RECOVERY_WEIGHTS[k]; sum += RECOVERY_WEIGHTS[k] * v;
  }
  for (const k of ["hrv", "rhr", "sleep"] as const) if (parts[k] !== null) weights[k] = RECOVERY_WEIGHTS[k] / wSum;
  return { status: "ok", version: RECOVERY_VERSION, score: sum / wSum, components: parts, weights };
}

/**
 * Training readiness (readiness@1), categorical — HRV-guided training as in Kiviniemi et al. (2007) Eur J Appl
 * Physiol 101:743, Plews et al. (2013), Javaloyes et al. (2019) Int J Sports Physiol Perform 14:1287:
 *   7-day rolling mean of ln rMSSD compared with the smallest worthwhile change (SWC = 0.5·σ) around the baseline mean.
 *   below band  → HRV suppressed;  RHR > μ + 1σ → elevated;  ACWR > 1.5 → load spike.
 *   "ready" = none;  "caution" = one;  "recover" = two or more.
 * Only a DECREASE below the band is a flag (Kiviniemi 2007). Javaloyes 2019 also reduces intensity when the 7-day mean
 * is ABOVE the band; Baseline reports "above" but does not flag it, because a rise with normal RHR is usually benign in
 * recreational athletes, and parasympathetic saturation is described mainly in highly trained endurance athletes
 * (Plews et al. 2012 Eur J Appl Physiol 112:3729).
 * Needs ≥ 3 of the last 7 nights and a calibrated HRV baseline.
 */
export const READINESS_VERSION = "readiness@1";
export type Readiness = "ready" | "caution" | "recover";

export function rollingLnMean(last7: (number | null)[]): { mean: number; n: number } | null {
  const v = last7.slice(-7).filter((x): x is number => x !== null && x > 0).map(Math.log);
  return v.length >= 3 ? { mean: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
}

export function trainingReadiness(i: { hrvLast7: (number | null)[]; hrvBaseline: BaselineResult; rhrToday: number | null; rhrBaseline: BaselineResult; acwr: number | null }) {
  if (i.hrvBaseline.status !== "ok") return { status: "calibrating" as const, version: READINESS_VERSION, have: i.hrvBaseline.have, need: i.hrvBaseline.need };
  const roll = rollingLnMean(i.hrvLast7);
  if (!roll) return { status: "missing" as const, version: READINESS_VERSION, reason: "Fewer than 3 HRV nights in the last 7" };
  const swc = 0.5 * i.hrvBaseline.sd;
  const hrvState: "below" | "normal" | "above" = roll.mean < i.hrvBaseline.mean - swc ? "below" : roll.mean > i.hrvBaseline.mean + swc ? "above" : "normal";
  const rhrHigh = i.rhrToday !== null && i.rhrBaseline.status === "ok" && i.rhrToday > i.rhrBaseline.mean + i.rhrBaseline.sd;
  const loadSpike = i.acwr !== null && i.acwr > 1.5;
  const flags = [hrvState === "below", rhrHigh, loadSpike].filter(Boolean).length;
  const level: Readiness = flags === 0 ? "ready" : flags === 1 ? "caution" : "recover";
  return {
    status: "ok" as const, version: READINESS_VERSION, level, hrvState, rhrHigh, loadSpike,
    rollingLnHrv: roll.mean, band: [i.hrvBaseline.mean - swc, i.hrvBaseline.mean + swc] as [number, number], nights: roll.n,
  };
}

/**
 * Fatigue indicators (fatigue@1): independent, explainable flags — never combined into a diagnosis.
 * Thresholds: HRV 7-day mean below SWC band; RHR > baseline + 1 SD (Buchheit 2014); ACWR > 1.5 (Gabbett 2016);
 * 7-night sleep debt > 5 h (app threshold; Van Dongen et al. 2003 Sleep 26:117 show cumulative deficits of this
 * order impair performance); nightly skin temperature > +1.0 °C vs Google's own baseline and respiratory rate
 * > baseline + 2 SD (app thresholds; both commonly rise with illness, e.g. Mishra et al. 2020 Nat Biomed Eng 4:1208).
 */
export const FATIGUE_VERSION = "fatigue@1";
export interface FatigueFlag { id: string; label: string; detail: string }

export function fatigueFlags(i: {
  hrvState?: "below" | "normal" | "above" | null; rhrToday: number | null; rhrBaseline: BaselineResult; acwr: number | null;
  sleepDebtMin: number | null; skinTempDeviation: number | null; respToday: number | null; respBaseline: BaselineResult;
}): FatigueFlag[] {
  const f: FatigueFlag[] = [];
  if (i.hrvState === "below") f.push({ id: "hrv", label: "HRV below your normal range", detail: "7-day average under your baseline band" });
  if (i.rhrToday !== null && i.rhrBaseline.status === "ok" && i.rhrToday > i.rhrBaseline.mean + i.rhrBaseline.sd)
    f.push({ id: "rhr", label: "Resting heart rate elevated", detail: "More than 1 SD above your 28-day baseline" });
  if (i.acwr !== null && i.acwr > 1.5) f.push({ id: "load", label: "Load spike", detail: "Acute load is over 1.5× your chronic load" });
  if (i.sleepDebtMin !== null && i.sleepDebtMin > 300) f.push({ id: "sleep", label: "Sleep debt", detail: "More than 5 h short over the last 7 nights" });
  if (i.skinTempDeviation !== null && i.skinTempDeviation > 1) f.push({ id: "temp", label: "Skin temperature raised", detail: "More than 1 °C above your nightly baseline" });
  if (i.respToday !== null && i.respBaseline.status === "ok" && i.respToday > i.respBaseline.mean + 2 * i.respBaseline.sd)
    f.push({ id: "resp", label: "Breathing rate raised", detail: "More than 2 SD above your baseline" });
  return f;
}
