/**
 * Calendar periods and per-period aggregation. Pure (no database, no Node APIs), so it runs unchanged in the
 * future iOS app. Dates are civil dates "YYYY-MM-DD". Weeks start on Monday (ISO 8601).
 * Missing days are never counted as zero: aggregates report how many days had data, and the current day is
 * incomplete for totals (docs/CALCULATIONS.md § Aggregation rules).
 */
const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = toMs(from); t <= toMs(to); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function weekStart(date: string): string {
  const dow = (new Date(toMs(date)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

export type PeriodKind = "week" | "month";
export interface Period { kind: PeriodKind; from: string; to: string; days: string[] }

export function periodOf(kind: PeriodKind, date: string): Period {
  if (kind === "week") { const from = weekStart(date); const to = addDays(from, 6); return { kind, from, to, days: daysBetween(from, to) }; }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { kind, from, to: addDays(next, -1), days: daysBetween(from, addDays(next, -1)) };
}
export const previousPeriod = (p: Period) => periodOf(p.kind, addDays(p.from, -1));

/** Days of the period that are complete as of `today`: today itself is incomplete; future days do not exist yet. */
export const completeDays = (p: Pick<Period, "days">, today: string) => p.days.filter((d) => d < today);

export interface PeriodStat { sum: number | null; mean: number | null; daysWithData: number; daysCounted: number }

/** Totals and means over `days`. Days without a value are skipped (never zero); `daysWithData` says how many counted. */
export function aggregateDays(series: Map<string, number>, days: string[]): PeriodStat {
  const vals = days.map((d) => series.get(d)).filter((v): v is number => v !== undefined && Number.isFinite(v));
  const sum = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  return { sum, mean: sum !== null ? sum / vals.length : null, daysWithData: vals.length, daysCounted: days.length };
}

/** Mean per fixed time bucket, for drawing dense series. Gaps stay gaps: empty buckets are omitted. */
export function downsample(samples: { tMs: number; bpm: number }[], bucketMs: number): { tMs: number; bpm: number }[] {
  const out: { tMs: number; bpm: number }[] = [];
  let key = NaN, sum = 0, n = 0;
  for (const s of samples) {
    const k = Math.floor(s.tMs / bucketMs);
    if (k !== key && n) { out.push({ tMs: key * bucketMs + bucketMs / 2, bpm: sum / n }); sum = 0; n = 0; }
    key = k; sum += s.bpm; n++;
  }
  if (n) out.push({ tMs: key * bucketMs + bucketMs / 2, bpm: sum / n });
  return out;
}
