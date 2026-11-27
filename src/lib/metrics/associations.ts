/**
 * Habit ↔ outcome associations (assoc@1). Pure; documented in docs/CALCULATIONS.md § ASSOCIATIONS.
 *
 * Exploratory and descriptive only. An association is NOT evidence of cause: other habits, illness, training,
 * season or chance can produce it. With many habits × outcomes, about 1 in 20 comparisons will look "notable" by
 * chance at 95 % confidence; the UI states this.
 *
 *  - Yes/no habits: difference in mean outcome on "yes" vs "no" days (Welch's t interval, 95 %).
 *    Needs ≥ 8 logged days in EACH group.
 *  - Amounts and 1–5 scales: Spearman rank correlation with a 95 % interval (Fisher z, SE = 1.06 / √(n − 3);
 *    Fieller, Hartley & Pearson 1957). Needs ≥ 20 paired days.
 * Only days where the habit was logged AND the outcome exists are used; unlogged days are never "no".
 */
export const ASSOC_VERSION = "assoc@1";
export const MIN_PER_GROUP = 8;
export const MIN_PAIRS = 20;
const Z975 = 1.959963984540054;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const variance = (v: number[]) => { const m = mean(v); return v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1); };

/** Student t 97.5 % quantile via the Cornish–Fisher expansion (error < 0.01 for df ≥ 5). */
export function t975(df: number): number {
  const z = Z975, g1 = (z ** 3 + z) / 4, g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96, g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3;
}

export type Association =
  | { status: "insufficient"; kind: "difference"; have: { yes: number; no: number }; need: number }
  | { status: "insufficient"; kind: "correlation"; have: number; need: number }
  | { status: "ok"; kind: "difference"; meanYes: number; meanNo: number; diff: number; ci: [number, number]; n: { yes: number; no: number }; notable: boolean }
  | { status: "ok"; kind: "correlation"; rho: number; ci: [number, number]; n: number; notable: boolean };

export function booleanAssociation(pairs: { x: number; y: number }[]): Association {
  const yes = pairs.filter((p) => p.x === 1).map((p) => p.y), no = pairs.filter((p) => p.x === 0).map((p) => p.y);
  if (yes.length < MIN_PER_GROUP || no.length < MIN_PER_GROUP) return { status: "insufficient", kind: "difference", have: { yes: yes.length, no: no.length }, need: MIN_PER_GROUP };
  const v1 = variance(yes) / yes.length, v2 = variance(no) / no.length;
  const se = Math.sqrt(v1 + v2);
  const df = se === 0 ? yes.length + no.length - 2 : (v1 + v2) ** 2 / (v1 ** 2 / (yes.length - 1) + v2 ** 2 / (no.length - 1));
  const diff = mean(yes) - mean(no), h = t975(df) * se;
  const ci: [number, number] = [diff - h, diff + h];
  return { status: "ok", kind: "difference", meanYes: mean(yes), meanNo: mean(no), diff, ci, n: { yes: yes.length, no: no.length }, notable: ci[0] > 0 || ci[1] < 0 };
}

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1; // average rank for ties
    i = j + 1;
  }
  return r;
}

export function rankAssociation(pairs: { x: number; y: number }[]): Association {
  if (pairs.length < MIN_PAIRS) return { status: "insufficient", kind: "correlation", have: pairs.length, need: MIN_PAIRS };
  const rx = ranks(pairs.map((p) => p.x)), ry = ranks(pairs.map((p) => p.y));
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i]! - mx) * (ry[i]! - my); dx += (rx[i]! - mx) ** 2; dy += (ry[i]! - my) ** 2; }
  if (dx === 0 || dy === 0) return { status: "insufficient", kind: "correlation", have: pairs.length, need: MIN_PAIRS }; // no variation
  const rho = num / Math.sqrt(dx * dy);
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, rho))), se = 1.06 / Math.sqrt(pairs.length - 3);
  const ci: [number, number] = [Math.tanh(z - Z975 * se), Math.tanh(z + Z975 * se)];
  return { status: "ok", kind: "correlation", rho, ci, n: pairs.length, notable: ci[0] > 0 || ci[1] < 0 };
}

/**
 * Estimated energy balance (energy-balance@1): intake − expenditure, averaged over days that have BOTH.
 * Shown only with ≥ 7 such days in the window; both inputs are estimates (labelled).
 */
export const ENERGY_MIN_DAYS = 7;
export function energyBalance(intake: Map<string, number>, expenditure: Map<string, number>, days: string[]) {
  const both = days.filter((d) => intake.has(d) && expenditure.has(d));
  if (both.length < ENERGY_MIN_DAYS) return { status: "insufficient" as const, have: both.length, need: ENERGY_MIN_DAYS };
  const diffs = both.map((d) => intake.get(d)! - expenditure.get(d)!);
  return { status: "ok" as const, meanKcal: mean(diffs), days: both.length };
}
