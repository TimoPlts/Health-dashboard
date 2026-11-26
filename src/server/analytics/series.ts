import { sql } from "drizzle-orm";
import type { DB } from "../db/client";

/**
 * Per-civil-day series from the normalized tables. A date absent from a returned map means "no data", never 0.
 * Civil dates use the UTC offset Google supplied with each row (falls back to `fallbackOffsetS` when absent).
 */
export type DaySeries = Map<string, number>;

const civil = (msCol: string, offCol: string, fb: number) =>
  sql.raw(`date((${msCol} + coalesce(${offCol}, ${fb}) * 1000) / 1000, 'unixepoch')`);

/** Provider (or rollup) daily values. If several sources report a metric, Fitbit/rollup is preferred over others. */
export function dailyMetricSeries(db: DB, metric: string, from: string, to: string): DaySeries {
  const rows = db.all(sql`
    select d.date as date, d.value as value from daily_metrics d left join sources s on s.id = d.source_id
    where d.metric = ${metric} and d.date >= ${from} and d.date <= ${to}
    order by d.date, case when s.platform in ('FITBIT','ROLLUP') then 0 else 1 end`) as { date: string; value: number }[];
  const m: DaySeries = new Map();
  for (const r of rows) if (!m.has(r.date)) m.set(r.date, r.value);
  return m;
}

/** Σ of interval observations per civil start date (reconciled streams are non-overlapping — verified). */
export function intervalSumSeries(db: DB, dataType: string, from: string, to: string, fbOffsetS: number, variant?: string): DaySeries {
  const d = civil("start_ms", "utc_offset_s", fbOffsetS);
  const rows = db.all(sql`
    select ${d} as date, sum(value) as value from observations
    where data_type = ${dataType} ${variant !== undefined ? sql`and variant = ${variant}` : sql``}
      and start_ms >= ${Date.parse(from) - 2 * 86_400_000} and start_ms < ${Date.parse(to) + 2 * 86_400_000}
    group by 1 having date >= ${from} and date <= ${to}`) as { date: string; value: number }[];
  return new Map(rows.map((r) => [r.date, r.value]));
}

/** Per-variant Σ per day, e.g. time-in-heart-rate-zone by zone. */
export function intervalVariantSeries(db: DB, dataType: string, from: string, to: string, fbOffsetS: number) {
  const d = civil("start_ms", "utc_offset_s", fbOffsetS);
  const rows = db.all(sql`
    select ${d} as date, variant, sum(value) as value from observations
    where data_type = ${dataType} and start_ms >= ${Date.parse(from) - 2 * 86_400_000} and start_ms < ${Date.parse(to) + 2 * 86_400_000}
    group by 1, 2 having date >= ${from} and date <= ${to}`) as { date: string; variant: string; value: number }[];
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) out.set(r.date, { ...(out.get(r.date) ?? {}), [r.variant]: r.value });
  return out;
}

/** Daily mean (and min/max/n) of point samples, e.g. weight, SpO2 samples, HRV samples. */
export function sampleDailySeries(db: DB, dataType: string, from: string, to: string, fbOffsetS: number, agg: "avg" | "min" | "max" = "avg"): DaySeries {
  const d = civil("start_ms", "utc_offset_s", fbOffsetS);
  const fn = sql.raw(`${agg}(value) as value`);
  const rows = db.all(sql`
    select ${d} as date, ${fn} from observations
    where data_type = ${dataType} and start_ms >= ${Date.parse(from) - 2 * 86_400_000} and start_ms < ${Date.parse(to) + 2 * 86_400_000}
    group by 1 having date >= ${from} and date <= ${to}`) as { date: string; value: number }[];
  return new Map(rows.map((r) => [r.date, r.value]));
}

/** A numeric attribute of a provider daily value (same source preference as dailyMetricSeries). */
export function dailyAttrSeries(db: DB, metric: string, attr: string, from: string, to: string): DaySeries {
  if (!/^[A-Za-z0-9_]+$/.test(attr)) throw new Error("invalid attr");
  const rows = db.all(sql`
    select d.date as date, json_extract(d.attrs, ${"$." + attr}) as value from daily_metrics d left join sources s on s.id = d.source_id
    where d.metric = ${metric} and d.date >= ${from} and d.date <= ${to}
    order by d.date, case when s.platform in ('FITBIT','ROLLUP') then 0 else 1 end`) as { date: string; value: number | null }[];
  const m: DaySeries = new Map();
  for (const r of rows) if (!m.has(r.date) && typeof r.value === "number" && Number.isFinite(r.value)) m.set(r.date, r.value);
  return m;
}

/**
 * Samples recorded during the main sleep of each night, keyed by wake date. Civil-day grouping would split a night
 * at midnight; this does not. `attr` reads a numeric attribute instead of the main value.
 */
export function nightSampleSeries(db: DB, dataType: string, from: string, to: string, fbOffsetS: number, agg: "avg" | "min" | "max", attr?: string): DaySeries {
  if (attr !== undefined && !/^[A-Za-z0-9_]+$/.test(attr)) throw new Error("invalid attr");
  const { nights } = nightSeries(db, from, to, fbOffsetS);
  const col = attr ? sql`json_extract(attrs, ${"$." + attr})` : sql`value`;
  const out: DaySeries = new Map();
  for (const [date, n] of nights) {
    const vals = (db.all(sql`select ${col} as v from observations where data_type = ${dataType} and start_ms >= ${n.startMs} and start_ms <= ${n.endMs}`) as { v: number | null }[])
      .map((r) => r.v).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!vals.length) continue;
    out.set(date, agg === "min" ? Math.min(...vals) : agg === "max" ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

export function derivedSeries(db: DB, metric: string, from: string, to: string): DaySeries {
  const rows = db.all(sql`select date, value from derived_daily where metric = ${metric} and date >= ${from} and date <= ${to}`) as { date: string; value: number }[];
  return new Map(rows.map((r) => [r.date, r.value]));
}

export interface NightRow {
  /** Civil date of waking up — the night "belongs" to the morning it ends. */
  date: string; id: string; startMs: number; endMs: number; startOffsetS: number | null; endOffsetS: number | null;
  isMain: boolean | null; sleepType: string | null;
  minutesAsleep: number | null; minutesAwake: number | null; minutesToFallAsleep: number | null; timeInBedMin: number;
  stages: Record<string, number>;
}

/** Main sleep per wake date (longest session if `mainSleep` is missing). Naps are returned separately. */
export function nightSeries(db: DB, from: string, to: string, fbOffsetS: number): { nights: Map<string, NightRow>; naps: NightRow[] } {
  const d = civil("s.end_ms", "s.end_offset_s", fbOffsetS);
  const rows = db.all(sql`
    select ${d} as date, s.id, s.start_ms as startMs, s.end_ms as endMs, s.start_offset_s as startOffsetS, s.end_offset_s as endOffsetS,
      s.is_main as isMain, s.sleep_type as sleepType, s.summary as summary
    from sleep_sessions s where s.end_ms >= ${Date.parse(from) - 2 * 86_400_000} and s.end_ms < ${Date.parse(to) + 2 * 86_400_000}
    order by s.end_ms`) as (Omit<NightRow, "minutesAsleep" | "minutesAwake" | "minutesToFallAsleep" | "timeInBedMin" | "stages"> & { summary: string | null })[];
  const ids = rows.map((r) => r.id);
  const stageRows = ids.length
    ? (db.all(sql`select session_id as id, stage, sum(end_ms - start_ms) / 60000.0 as min from sleep_stages
        where is_short_awakening = 0 and session_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) group by 1, 2`) as { id: string; stage: string; min: number }[])
    : [];
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const nights = new Map<string, NightRow>(); const naps: NightRow[] = [];
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    const sum = r.summary ? (JSON.parse(r.summary) as Record<string, unknown>) : {};
    const stages: Record<string, number> = {};
    for (const s of stageRows) if (s.id === r.id) stages[s.stage] = s.min;
    const row: NightRow = {
      date: r.date, id: r.id, startMs: r.startMs, endMs: r.endMs, startOffsetS: r.startOffsetS, endOffsetS: r.endOffsetS,
      isMain: r.isMain === null ? null : Boolean(r.isMain), sleepType: r.sleepType,
      minutesAsleep: n(sum.minutesAsleep), minutesAwake: n(sum.minutesAwake), minutesToFallAsleep: n(sum.minutesToFallAsleep),
      timeInBedMin: (r.endMs - r.startMs) / 60_000, stages,
    };
    const existing = nights.get(r.date);
    const isMain = row.isMain ?? null;
    if (isMain === false) { naps.push(row); continue; }
    if (!existing || (row.minutesAsleep ?? 0) > (existing.minutesAsleep ?? 0)) { if (existing) naps.push(existing); nights.set(r.date, row); }
    else naps.push(row);
  }
  return { nights, naps };
}

/** Inclusive list of civil dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
/** Civil date "now" for a UTC offset in seconds. Used to treat the current, incomplete day differently. */
export const localToday = (fbOffsetS: number, now = Date.now()) => new Date(now + fbOffsetS * 1000).toISOString().slice(0, 10);
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
