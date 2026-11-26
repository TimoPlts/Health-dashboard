import { sliceSamples, type HrSample } from "./heart-rate";

/**
 * Banister TRIMP (training impulse). Documented in docs/CALCULATIONS.md (§ LOAD-TRIMP).
 *   TRIMP = Σ Δt[min] · HRr · 0.64 · e^(k · HRr),   HRr = (HR − HRrest)/(HRmax − HRrest) clamped to [0, 1]
 *   k = 1.92 (men), 1.67 (women).
 * Ref: Banister EW (1991) "Modeling elite athletic performance", in Physiological Testing of Elite Athletes;
 *      Morton, Fitz-Clarke & Banister (1990) J Appl Physiol 69:1171–1177.
 * Limitation: HR-based TRIMP under-represents the load of resistance training (short sets, long rests).
 */
export const TRIMP_VERSION = "trimp-banister@1";

export function banisterTrimp(all: HrSample[], startMs: number, endMs: number, restingHr: number, maxHr: number, sex: "male" | "female", maxGapS = 30) {
  if (!(maxHr > restingHr)) throw new Error("maxHr must exceed restingHr");
  const k = sex === "male" ? 1.92 : 1.67;
  const s = sliceSamples(all, startMs, endMs);
  let trimp = 0, coveredS = 0;
  s.forEach((x, i) => {
    const next = i + 1 < s.length ? s[i + 1]!.tMs : endMs;
    const dtS = Math.max(0, Math.min((next - x.tMs) / 1000, maxGapS));
    coveredS += dtS;
    const hrr = Math.min(1, Math.max(0, (x.bpm - restingHr) / (maxHr - restingHr)));
    trimp += (dtS / 60) * hrr * 0.64 * Math.exp(k * hrr);
  });
  const windowS = (endMs - startMs) / 1000;
  return { version: TRIMP_VERSION, trimp, coverage: windowS > 0 ? Math.min(1, coveredS / windowS) : 0 };
}

/**
 * Acute / chronic load as exponentially weighted moving averages (EWMA) of daily load.
 *   λ = 2 / (N + 1);  EWMA_t = λ·load_t + (1 − λ)·EWMA_{t−1}
 * Acute N = 7, chronic N = 28. Ref: Williams et al. (2017) Br J Sports Med 51:209–210.
 * Days with no recorded load must be passed as 0 ONLY if the wearer was tracked that day;
 * days with unknown load should be passed as null and are reported as gaps (EWMA carried, flagged).
 */
export const EWMA_LOAD_VERSION = "ewma-load@1";

export function ewmaLoad(daily: (number | null)[], acuteN = 7, chronicN = 28) {
  const la = 2 / (acuteN + 1), lc = 2 / (chronicN + 1);
  let a: number | null = null, c: number | null = null;
  return daily.map((load, i) => {
    if (load !== null) {
      a = a === null ? load : la * load + (1 - la) * a;
      c = c === null ? load : lc * load + (1 - lc) * c;
    }
    return { day: i, acute: a, chronic: c, balance: a !== null && c !== null ? c - a : null, gap: load === null };
  });
}
