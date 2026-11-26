import { sql } from "drizzle-orm";
import { db as getDb, type DB } from "./db/client";
import { env } from "./env";
import { civilDayBounds, offsetMs } from "@/lib/time";
import { METRICS, METRIC_BY_ID, type MetricDef } from "./analytics/registry";
import { computeScores, nightValue, sleepConsistency } from "./analytics/scores";
import { dateRange, nightSeries, shiftDate } from "./analytics/series";
import { metricSeries, RANGE_DAYS, type MetricBaseline, type RangeKey } from "./analytics/values";
import { listWorkouts, workoutHr } from "./analytics/workouts";
import { getSettings } from "./settings";
import { todayDate } from "./queries";

/** Request-level context: database, home time zone, fallback UTC offset and today's civil date. */
export function ctx() {
  const tz = env().HOME_TIME_ZONE;
  return { db: getDb(), tz, fb: Math.round(offsetMs(Date.now(), tz) / 1000), today: todayDate() };
}

export function parseDate(v: string | string[] | undefined, today: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= today ? s : today;
}
export function parseRange(v: string | string[] | undefined, fallback: RangeKey = "30d"): RangeKey {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s in RANGE_DAYS ? (s as RangeKey) : fallback;
}

export function earliestDataDate(db: DB, fb: number): string | null {
  const r = db.get(sql.raw(`select min(d) as d from (
    select min(date) as d from daily_metrics union all
    select date((min(t_ms) + ${fb} * 1000) / 1000, 'unixepoch') from heart_rate_samples union all
    select date((min(start_ms) + ${fb} * 1000) / 1000, 'unixepoch') from observations)`)) as { d: string | null } | undefined;
  return r?.d ?? null;
}

/** Last N days of a metric (oldest first, null = no data) for sparklines + latest value. */
function recent(db: DB, def: MetricDef, end: string, fb: number, days = 7, scores?: ReturnType<typeof computeScores>) {
  const from = shiftDate(end, -days + 1);
  const s = metricSeries(db, def, from, end, fb, scores);
  return dateRange(from, end).map((d) => s.get(d) ?? null);
}

/** Baseline (28 d before `date`) of any metric: mean ± sd once 14 values exist. */
function metricBaseline(db: DB, def: MetricDef, date: string, fb: number, scores?: ReturnType<typeof computeScores>): MetricBaseline {
  const s = metricSeries(db, def, shiftDate(date, -28), shiftDate(date, -1), fb, scores);
  const v = [...s.values()];
  if (v.length < 14) return { status: "calibrating", have: v.length, need: 14 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { status: "ok", mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)), n: v.length };
}

export function todayView(date: string) {
  const { db, tz, fb, today } = ctx();
  const scores = computeScores(db, shiftDate(date, -29), date, fb);
  const day = scores.get(date)!;
  const settings = getSettings(db);
  const vital = (id: string) => {
    const def = METRIC_BY_ID.get(id)!;
    const spark = recent(db, def, date, fb, 7);
    const value = spark.at(-1) ?? null;
    const base = def.baseline ? metricBaseline(db, def, date, fb) : null;
    return { def, value, spark, base: base?.status === "ok" ? base : null, calibrating: base?.status === "calibrating" ? base : null };
  };
  const [dayStart, dayEnd] = civilDayBounds(date, tz);
  const workouts = listWorkouts(db, dayStart, dayEnd, tz).filter((w) => w.date === date)
    .map((w) => ({ ...w, hr: w.tooShort ? null : workoutHr(db, w) }));
  const activity = (id: string) => metricSeries(db, METRIC_BY_ID.get(id)!, date, date, fb).get(date) ?? null;
  const recoverySpark = dateRange(shiftDate(date, -6), date).map((d) => { const r = scores.get(d)?.recovery; return r?.status === "ok" ? r.score : null; });
  return {
    date, today, tz, earliest: earliestDataDate(db, fb), settings,
    day, recoverySpark,
    vitals: ["resting_hr", "hrv", "respiratory_rate", "spo2", "skin_temp_abs", "sleeping_hr"].map(vital),
    activity: { steps: activity("steps"), distance: activity("distance"), activeKcal: activity("active_kcal"), totalKcal: activity("total_kcal"), azm: activity("azm"), floors: activity("floors") },
    zone2: activity("zone2"),
    workouts,
    sleepStages: day.night ? db.all(sql`select start_ms as startMs, end_ms as endMs, stage from sleep_stages where session_id = ${day.night.id} and is_short_awakening = 0 order by start_ms`) as { startMs: number; endMs: number; stage: string }[] : [],
  };
}

export function sleepView(date: string) {
  const { db, tz, fb, today } = ctx();
  const settings = getSettings(db);
  const scores = computeScores(db, shiftDate(date, -13), date, fb);
  const day = scores.get(date)!;
  const { nights } = nightSeries(db, shiftDate(date, -13), date, fb);
  const last14 = dateRange(shiftDate(date, -13), date).map((d) => {
    const n = nights.get(d);
    return { date: d, asleepH: nightValue(n, "asleep"), bed: nightValue(n, "bedtime"), wake: nightValue(n, "wake"), score: scores.get(d)?.sleepScore?.score ?? null };
  });
  const night = day.night;
  const stages = night ? db.all(sql`select start_ms as startMs, end_ms as endMs, stage from sleep_stages where session_id = ${night.id} and is_short_awakening = 0 order by start_ms`) as { startMs: number; endMs: number; stage: string }[] : [];
  const vit = (id: string) => { const def = METRIC_BY_ID.get(id)!; const s = recent(db, def, date, fb, 7); return { def, value: s.at(-1) ?? null, spark: s }; };
  return {
    date, today, tz, earliest: earliestDataDate(db, fb), needMin: settings.sleepNeedMin, day, night, stages, last14,
    consistency: sleepConsistency(db, date, fb),
    vitals: ["hrv", "sleeping_hr", "respiratory_rate", "spo2", "skin_temp"].map(vit),
  };
}

export function healthIndex(end: string) {
  const { db, fb } = ctx();
  const scores = computeScores(db, shiftDate(end, -13), end, fb);
  return METRICS.map((def) => {
    const s = metricSeries(db, def, shiftDate(end, -89), end, fb, def.series.kind === "score" ? scores : undefined);
    const dates = [...s.keys()].sort();
    const last = dates.at(-1);
    return { def, latest: last ? { date: last, value: s.get(last)! } : null, spark: dateRange(shiftDate(end, -13), end).map((d) => s.get(d) ?? null), days: s.size };
  });
}

export function trendSeries(ids: string[], range: RangeKey, end: string) {
  const { db, fb } = ctx();
  const days = RANGE_DAYS[range];
  const from = shiftDate(end, -days + 1);
  const needsScores = ids.some((id) => METRIC_BY_ID.get(id)?.series.kind === "score");
  const scores = needsScores ? computeScores(db, from, end, fb) : undefined;
  return Object.fromEntries(ids.map((id) => {
    const def = METRIC_BY_ID.get(id)!;
    const s = metricSeries(db, def, from, end, fb, scores);
    const pts = dateRange(from, end).map((date) => ({ date, value: s.get(date) ?? null }));
    const vals = pts.map((p) => p.value).filter((v): v is number => v !== null);
    const base = def.baseline ? metricBaseline(db, def, end, fb, scores) : null;
    return [id, { def, points: pts, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, days: vals.length, baseline: base?.status === "ok" ? base : null }];
  }));
}

export function trainingView(range: RangeKey) {
  const { db, tz, fb, today } = ctx();
  const days = RANGE_DAYS[range];
  const from = shiftDate(today, -days + 1);
  const [fromMs] = civilDayBounds(from, tz);
  const [, toMs] = civilDayBounds(today, tz);
  const workouts = listWorkouts(db, fromMs, toMs, tz).map((w) => ({ ...w, hr: w.tooShort ? null : workoutHr(db, w) }));
  const scores = computeScores(db, today, today, fb).get(today)!;
  const zones = [1, 2, 3, 4, 5].map((z) => { const s = metricSeries(db, METRIC_BY_ID.get(`zone${z}`)!, from, today, fb); return [...s.values()].reduce((a, b) => a + b, 0); });
  const zoneDays = metricSeries(db, METRIC_BY_ID.get("zone2")!, from, today, fb).size;
  const hevy = db.get(sql`select count(*) as n from hevy_workouts where deleted_at is null`) as { n: number };
  return { range, from, today, tz, workouts, acwr: scores.acwr, zones, zoneDays, hevyWorkouts: hevy.n };
}
