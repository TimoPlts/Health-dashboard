/**
 * Daily timeline helpers (timeline@1). Pure; documented in docs/CALCULATIONS.md § TIMELINE.
 *
 * Storage keeps every sample at its original resolution. Only the DISPLAY is reduced:
 *   - Heart rate is summarised per fixed bucket (mean / min / max / n). A bucket without samples is null, and a line
 *     is never drawn across a gap longer than `maxGapMs` (no interpolation over missing data).
 *   - Interval data (steps, Active Zone Minutes) is spread over buckets in proportion to overlap, so totals are kept.
 * Buckets are aligned to the day start instant, which comes from civilDayBounds() (23 h / 25 h on DST days).
 */
export const TIMELINE_VERSION = "timeline@1";

export interface Bucket { startMs: number; endMs: number; mean: number | null; min: number | null; max: number | null; n: number }

export function bucketSamples(samples: { tMs: number; bpm: number }[], fromMs: number, toMs: number, bucketMs: number): Bucket[] {
  const count = Math.max(0, Math.ceil((toMs - fromMs) / bucketMs));
  const acc = Array.from({ length: count }, () => ({ sum: 0, n: 0, min: Infinity, max: -Infinity }));
  for (const s of samples) {
    if (s.tMs < fromMs || s.tMs >= toMs) continue;
    const a = acc[Math.floor((s.tMs - fromMs) / bucketMs)]!;
    a.sum += s.bpm; a.n++; a.min = Math.min(a.min, s.bpm); a.max = Math.max(a.max, s.bpm);
  }
  return acc.map((a, i) => {
    const startMs = fromMs + i * bucketMs;
    return { startMs, endMs: Math.min(toMs, startMs + bucketMs), n: a.n, mean: a.n ? a.sum / a.n : null, min: a.n ? a.min : null, max: a.n ? a.max : null };
  });
}

/**
 * Runs of buckets that may be joined by a line: consecutive non-empty buckets, split wherever the gap between the
 * last sample time of one bucket and the next exceeds `maxGapMs`. Approximated at bucket resolution: an empty bucket
 * longer than maxGapMs always splits.
 */
export function lineRuns(buckets: Bucket[], maxGapMs: number): Bucket[][] {
  const runs: Bucket[][] = [];
  let cur: Bucket[] = [];
  let lastEnd = -Infinity;
  for (const b of buckets) {
    if (b.mean === null) continue;
    if (cur.length && b.startMs - lastEnd > maxGapMs) { runs.push(cur); cur = []; }
    cur.push(b); lastEnd = b.endMs;
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Proportional allocation of interval values into buckets. Buckets with no overlapping interval stay null (≠ 0). */
export function allocateIntervals(intervals: { startMs: number; endMs: number; value: number }[], fromMs: number, toMs: number, bucketMs: number): (number | null)[] {
  const count = Math.max(0, Math.ceil((toMs - fromMs) / bucketMs));
  const out: (number | null)[] = Array(count).fill(null);
  for (const iv of intervals) {
    const s = Math.max(iv.startMs, fromMs), e = Math.min(Math.max(iv.endMs, iv.startMs), toMs);
    if (iv.endMs <= iv.startMs) { // point value
      if (iv.startMs >= fromMs && iv.startMs < toMs) { const i = Math.floor((iv.startMs - fromMs) / bucketMs); out[i] = (out[i] ?? 0) + iv.value; }
      continue;
    }
    if (e <= s) continue;
    const span = iv.endMs - iv.startMs;
    for (let i = Math.floor((s - fromMs) / bucketMs); i < count && fromMs + i * bucketMs < e; i++) {
      const bs = fromMs + i * bucketMs, be = bs + bucketMs;
      const ov = Math.min(be, e) - Math.max(bs, s);
      if (ov > 0) out[i] = (out[i] ?? 0) + iv.value * (ov / span);
    }
  }
  return out;
}

/** Edwards %HRmax zone (1–5) of a heart rate, 0 below 50 % HRmax. Same bounds as LOAD-ZONES. */
export function hrZone(bpm: number, hrMax: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const p = bpm / hrMax;
  return p >= 0.9 ? 5 : p >= 0.8 ? 4 : p >= 0.7 ? 3 : p >= 0.6 ? 2 : p >= 0.5 ? 1 : 0;
}

/** Local hour ticks for a day [fromMs, toMs): every whole local hour, correct on 23 h and 25 h days. */
export function hourTicks(fromMs: number, toMs: number, offsetAt: (tMs: number) => number, everyHours = 1): { tMs: number; hour: number }[] {
  const out: { tMs: number; hour: number }[] = [];
  // Whole UTC hours are whole local hours for every zone with an hourly offset; half-hour zones are shifted below.
  for (let t = Math.floor(fromMs / 3_600_000) * 3_600_000; t < toMs; t += 3_600_000) {
    const localMs = t + offsetAt(t);
    const minute = ((localMs / 60_000) % 60 + 60) % 60;
    const tt = t - minute * 60_000 + (minute ? 3_600_000 : 0);
    if (tt < fromMs || tt >= toMs) continue;
    const hour = Math.floor((((tt + offsetAt(tt)) / 3_600_000) % 24 + 24) % 24);
    if (hour % everyHours === 0 && !out.some((x) => x.tMs === tt)) out.push({ tMs: tt, hour });
  }
  return out;
}

/** Summary of an inspected interval [a, b): HR stats from raw samples, sums of interval data, zone minutes. */
export function summariseInterval(
  samples: { tMs: number; bpm: number }[], a: number, b: number, hrMax: number | null, maxGapMs = 30_000,
) {
  const inside = samples.filter((s) => s.tMs >= a && s.tMs < b);
  const zoneMin = [0, 0, 0, 0, 0, 0];
  let covered = 0;
  inside.forEach((s, i) => {
    const next = inside[i + 1]?.tMs ?? b;
    const dt = Math.min(next - s.tMs, maxGapMs);
    if (dt <= 0) return;
    covered += dt;
    if (hrMax) zoneMin[hrZone(s.bpm, hrMax)]! += dt / 60_000;
  });
  const bpm = inside.map((s) => s.bpm);
  return {
    n: inside.length,
    avg: bpm.length ? bpm.reduce((x, y) => x + y, 0) / bpm.length : null,
    min: bpm.length ? Math.min(...bpm) : null,
    max: bpm.length ? Math.max(...bpm) : null,
    coveredMin: covered / 60_000,
    zoneMin: hrMax ? zoneMin : null,
  };
}

/**
 * Per-bucket covered seconds and seconds per Edwards zone (index 0 = below Z1 … 5 = Z5), computed from RAW samples:
 * each sample represents the time to the next one, capped at `maxGapMs` (same rule as HR-STATS / LOAD-ZONES).
 * Lets the UI inspect any interval at bucket resolution without shipping every raw sample.
 */
export function bucketZones(samples: { tMs: number; bpm: number }[], fromMs: number, toMs: number, bucketMs: number, hrMax: number | null, maxGapMs = 30_000) {
  const count = Math.max(0, Math.ceil((toMs - fromMs) / bucketMs));
  const covered = new Array<number>(count).fill(0);
  const zones = hrMax ? Array.from({ length: count }, () => [0, 0, 0, 0, 0, 0]) : null;
  const inside = samples.filter((s) => s.tMs >= fromMs && s.tMs < toMs);
  inside.forEach((s, i) => {
    let t = s.tMs;
    const end = Math.min(t + Math.min((inside[i + 1]?.tMs ?? toMs) - t, maxGapMs), toMs);
    const z = hrMax ? hrZone(s.bpm, hrMax) : 0;
    while (t < end) { // split across bucket boundaries
      const b = Math.floor((t - fromMs) / bucketMs);
      const be = Math.min(end, fromMs + (b + 1) * bucketMs);
      covered[b]! += (be - t) / 1000;
      if (zones) zones[b]![z]! += (be - t) / 1000;
      t = be;
    }
  });
  return { covered, zones };
}
