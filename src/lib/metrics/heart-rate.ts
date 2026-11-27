/**
 * Heart-rate analytics over irregularly sampled data. Documented in docs/CALCULATIONS.md (§ HR-*).
 *
 * Sampling model: each sample is assumed to represent the time until the next sample, capped at
 * `maxGapS`. Gaps longer than that are treated as MISSING (never interpolated), and reported as
 * reduced coverage. This avoids inflating zone time across watch-off periods or sync gaps.
 */

export const HR_STATS_VERSION = "hr-stats@1";
export const HR_ZONES_VERSION = "hr-zones@1";

export interface HrSample { tMs: number; bpm: number }

export interface HrWindowStats {
  version: string;
  sampleCount: number;
  /** Seconds of the window covered by samples (gap-capped). */
  coveredS: number;
  windowS: number;
  /** coveredS / windowS, 0..1. */
  coverage: number;
  /** Time-weighted mean (each sample weighted by the duration it represents). */
  avgBpm: number | null;
  minBpm: number | null;
  maxBpm: number | null;
  /** Median sampling interval actually observed (s) — documents data resolution. */
  medianIntervalS: number | null;
}

/** Samples within [startMs, endMs), sorted. Duration of each sample is clipped to the window end. */
export function sliceSamples(samples: HrSample[], startMs: number, endMs: number): HrSample[] {
  return samples.filter((s) => s.tMs >= startMs && s.tMs < endMs).sort((a, b) => a.tMs - b.tMs);
}

function weights(samples: HrSample[], endMs: number, maxGapS: number): number[] {
  return samples.map((s, i) => {
    const next = i + 1 < samples.length ? samples[i + 1]!.tMs : endMs;
    const gapS = (next - s.tMs) / 1000;
    return Math.max(0, Math.min(gapS, maxGapS));
  });
}

export function medianInterval(samples: HrSample[]): number | null {
  if (samples.length < 2) return null;
  const d = samples.slice(1).map((s, i) => (s.tMs - samples[i]!.tMs) / 1000).sort((a, b) => a - b);
  const m = Math.floor(d.length / 2);
  return d.length % 2 ? d[m]! : (d[m - 1]! + d[m]!) / 2;
}

export function hrWindowStats(all: HrSample[], startMs: number, endMs: number, maxGapS = 30): HrWindowStats {
  const s = sliceSamples(all, startMs, endMs);
  const windowS = Math.max(0, (endMs - startMs) / 1000);
  if (s.length === 0) {
    return { version: HR_STATS_VERSION, sampleCount: 0, coveredS: 0, windowS, coverage: 0, avgBpm: null, minBpm: null, maxBpm: null, medianIntervalS: null };
  }
  const w = weights(s, endMs, maxGapS);
  const covered = w.reduce((a, b) => a + b, 0);
  const weighted = s.reduce((acc, x, i) => acc + x.bpm * w[i]!, 0);
  let min = Infinity, max = -Infinity;
  for (const x of s) { if (x.bpm < min) min = x.bpm; if (x.bpm > max) max = x.bpm; }
  return {
    version: HR_STATS_VERSION,
    sampleCount: s.length,
    coveredS: covered,
    windowS,
    coverage: windowS > 0 ? Math.min(1, covered / windowS) : 0,
    avgBpm: covered > 0 ? weighted / covered : s.reduce((a, x) => a + x.bpm, 0) / s.length,
    minBpm: min,
    maxBpm: max,
    medianIntervalS: medianInterval(s),
  };
}

/**
 * Heart-rate-reserve (Karvonen) zones. Boundaries are fractions of HRR above resting HR:
 *   bpm(p) = HRrest + p · (HRmax − HRrest)
 * Default 5-zone model: Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 90–100 % HRR.
 * Ref: Karvonen, Kentala & Mustala (1957) Ann Med Exp Biol Fenn 35:307–315; ACSM Guidelines (11th ed.).
 */
export interface ZoneModel { name: string; lowerPct: number; upperPct: number }
export const DEFAULT_HRR_ZONES: ZoneModel[] = [
  { name: "Z1", lowerPct: 0.5, upperPct: 0.6 },
  { name: "Z2", lowerPct: 0.6, upperPct: 0.7 },
  { name: "Z3", lowerPct: 0.7, upperPct: 0.8 },
  { name: "Z4", lowerPct: 0.8, upperPct: 0.9 },
  { name: "Z5", lowerPct: 0.9, upperPct: Infinity },
];

export function zoneBoundsBpm(restingHr: number, maxHr: number, zones = DEFAULT_HRR_ZONES) {
  if (!(maxHr > restingHr)) throw new Error("maxHr must exceed restingHr");
  const hrr = maxHr - restingHr;
  return zones.map((z) => ({ name: z.name, lowerBpm: restingHr + z.lowerPct * hrr, upperBpm: z.upperPct === Infinity ? Infinity : restingHr + z.upperPct * hrr }));
}

/** Seconds spent in each zone (plus "below" Z1). Uses the same gap-capped weighting as hrWindowStats. */
export function timeInZones(all: HrSample[], startMs: number, endMs: number, restingHr: number, maxHr: number, maxGapS = 30, zones = DEFAULT_HRR_ZONES) {
  const bounds = zoneBoundsBpm(restingHr, maxHr, zones);
  const s = sliceSamples(all, startMs, endMs);
  const w = weights(s, endMs, maxGapS);
  const result: Record<string, number> = { below: 0 };
  for (const b of bounds) result[b.name] = 0;
  s.forEach((x, i) => {
    const zone = [...bounds].reverse().find((b) => x.bpm >= b.lowerBpm);
    result[zone ? zone.name : "below"]! += w[i]!;
  });
  return { version: HR_ZONES_VERSION, bounds, seconds: result };
}

/**
 * Seconds spent in arbitrary bpm bands [lowerBpm, upperBpm), e.g. the provider's own daily zones
 * (Google Health `daily-heart-rate-zones`: LIGHT/MODERATE/VIGOROUS/PEAK). Time below the lowest band is "below".
 */
export function timeInBands(all: HrSample[], startMs: number, endMs: number, bands: { name: string; lowerBpm: number; upperBpm: number }[], maxGapS = 30) {
  const sorted = [...bands].sort((a, b) => a.lowerBpm - b.lowerBpm);
  const s = sliceSamples(all, startMs, endMs);
  const w = weights(s, endMs, maxGapS);
  const seconds: Record<string, number> = { below: 0 };
  for (const b of sorted) seconds[b.name] = 0;
  s.forEach((x, i) => {
    const band = [...sorted].reverse().find((b) => x.bpm >= b.lowerBpm);
    seconds[band ? band.name : "below"]! += w[i]!;
  });
  return { version: HR_ZONES_VERSION, bands: sorted, seconds };
}

/** Tanaka, Monahan & Seals (2001) J Am Coll Cardiol 37:153–156: HRmax ≈ 208 − 0.7·age. Population estimate only. */
export function estimateMaxHrTanaka(ageYears: number): number {
  return 208 - 0.7 * ageYears;
}
