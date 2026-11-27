/**
 * Strength-training metrics from Hevy sets. Documented in docs/CALCULATIONS.md (§ STR-*).
 */
export const E1RM_VERSION = "e1rm-epley@1";
export const VOLUME_VERSION = "volume-load@1";

export interface SetLike { setType: string; weightKg: number | null; reps: number | null }

/**
 * Estimated 1RM, Epley (1985): 1RM = w · (1 + reps/30). For reps == 1 returns w.
 * Valid range: 1–12 reps; returns null outside it (accuracy degrades sharply at high reps —
 * LeSuer et al. (1997) J Strength Cond Res 11:211–213). Warm-up sets are excluded.
 */
export function estimateOneRepMax(s: SetLike): number | null {
  if (s.setType === "warmup" || s.weightKg === null || s.reps === null) return null;
  if (s.weightKg <= 0 || s.reps < 1 || s.reps > 12 || !Number.isInteger(s.reps)) return null;
  return s.reps === 1 ? s.weightKg : s.weightKg * (1 + s.reps / 30);
}

/** Brzycki (1993): 1RM = w · 36 / (37 − reps). Provided for comparison; same validity range. */
export function estimateOneRepMaxBrzycki(s: SetLike): number | null {
  if (s.setType === "warmup" || s.weightKg === null || s.reps === null) return null;
  if (s.weightKg <= 0 || s.reps < 1 || s.reps > 12) return null;
  return (s.weightKg * 36) / (37 - s.reps);
}

/**
 * Volume load = Σ weight × reps over working sets (warm-ups excluded).
 * Bodyweight exercises (weight null) contribute 0 kg·reps but are counted in `workingSets`.
 * Ref: Haff (2010) "Quantifying workloads in resistance training", NSCA Coach 1(1).
 */
export function volumeLoad(sets: SetLike[]) {
  let volumeKg = 0, workingSets = 0, reps = 0;
  for (const s of sets) {
    if (s.setType === "warmup") continue;
    workingSets++;
    if (s.reps !== null) reps += s.reps;
    if (s.weightKg !== null && s.reps !== null) volumeKg += s.weightKg * s.reps;
  }
  return { version: VOLUME_VERSION, volumeKg, workingSets, reps };
}

/**
 * Weekly hard sets per muscle group: primary muscle counts 1 set, each secondary muscle 0.5 set.
 * This fractional convention follows common hypertrophy-volume practice (e.g. Pelland et al. 2024, SportRxiv)
 * and is an APPLICATION CONVENTION, not a validated physiological measure. Configurable.
 */
export const MUSCLE_SETS_VERSION = "muscle-sets@1";
export function setsPerMuscle(entries: { primary: string | null; secondary: string[]; workingSets: number }[], secondaryWeight = 0.5) {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (e.primary) out[e.primary] = (out[e.primary] ?? 0) + e.workingSets;
    for (const m of e.secondary) out[m] = (out[m] ?? 0) + e.workingSets * secondaryWeight;
  }
  return out;
}
