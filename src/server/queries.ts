import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { env } from "./env";
import { civilDate, civilDayBounds } from "@/lib/time";
import { hrWindowStats, timeInBands, type HrSample } from "@/lib/metrics/heart-rate";
import { sleepEfficiency, stageMinutes } from "@/lib/metrics/sleep-baseline";
import { volumeLoad } from "@/lib/metrics/strength";

/* ------------------------------------------------------------------------------------------------
 * Read models for the UI. Every value is either a provider measurement, a documented calculation,
 * or null (missing). Nothing here substitutes zeros or fictional values for missing data.
 * ---------------------------------------------------------------------------------------------- */

export function getSyncOverview(db: DB) {
  const connections = db.select({
    provider: t.providerConnections.provider, status: t.providerConnections.status, connectedAt: t.providerConnections.connectedAt,
    lastError: t.providerConnections.lastError, scopes: t.providerConnections.scopes,
  }).from(t.providerConnections).all();
  const streams = db.select().from(t.syncState).orderBy(asc(t.syncState.provider), asc(t.syncState.stream)).all();
  const lastRuns = db.select().from(t.syncRuns).orderBy(desc(t.syncRuns.startedAt)).limit(6).all()
    .map((r) => ({ id: r.id, provider: r.provider, trigger: r.trigger, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status, error: r.error }));
  const lastSuccess = (p: string) => streams.filter((s) => s.provider === p && s.lastSuccessAt).reduce<number | null>((m, s) => Math.max(m ?? 0, s.lastSuccessAt!), null);
  return { connections, streams, lastRuns, lastSuccess: { google: lastSuccess("google"), hevy: lastSuccess("hevy") } };
}

function dailyValue(db: DB, metric: string, date: string) {
  const r = db.select({ value: t.dailyMetrics.value, unit: t.dailyMetrics.unit }).from(t.dailyMetrics)
    .where(and(eq(t.dailyMetrics.metric, metric), eq(t.dailyMetrics.date, date))).get();
  return r ? r.value : null;
}

function dailySeries(db: DB, metric: string, fromDate: string, toDate: string) {
  return db.select({ date: t.dailyMetrics.date, value: t.dailyMetrics.value }).from(t.dailyMetrics)
    .where(and(eq(t.dailyMetrics.metric, metric), gte(t.dailyMetrics.date, fromDate), lte(t.dailyMetrics.date, toDate)))
    .orderBy(asc(t.dailyMetrics.date)).all();
}

/** Sum of an interval observation type over [start, end). null when there are no rows at all (≠ 0). */
function intervalSum(db: DB, dataType: string, startMs: number, endMs: number, variant?: string) {
  const r = db.select({ total: sql<number | null>`sum(${t.observations.value})`, n: sql<number>`count(*)` }).from(t.observations)
    .where(and(eq(t.observations.dataType, dataType), gte(t.observations.startMs, startMs), lt(t.observations.startMs, endMs), variant !== undefined ? eq(t.observations.variant, variant) : undefined))
    .get();
  return r && r.n > 0 ? r.total : null;
}

export function hrSamples(db: DB, startMs: number, endMs: number): HrSample[] {
  // If several wearables report HR, prefer the source with the most samples in the window (no silent merging).
  const rows = db.select({ tMs: t.heartRateSamples.tMs, bpm: t.heartRateSamples.bpm, sourceId: t.heartRateSamples.sourceId }).from(t.heartRateSamples)
    .where(and(gte(t.heartRateSamples.tMs, startMs), lt(t.heartRateSamples.tMs, endMs))).orderBy(asc(t.heartRateSamples.tMs)).all();
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.sourceId, (counts.get(r.sourceId) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return rows.filter((r) => r.sourceId === best).map(({ tMs, bpm }) => ({ tMs, bpm }));
}

export function todayDate(now = Date.now()) {
  return civilDate(now, null, env().HOME_TIME_ZONE);
}

const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function getLastNightSleep(db: DB, date: string) {
  const [dayStart, dayEnd] = civilDayBounds(date, env().HOME_TIME_ZONE);
  // Main sleep that ENDED on this civil day (morning wake-up attributes the night to this day).
  const s = db.select().from(t.sleepSessions)
    .where(and(gte(t.sleepSessions.endMs, dayStart), lt(t.sleepSessions.endMs, dayEnd)))
    .orderBy(desc(t.sleepSessions.isMain), desc(sql`${t.sleepSessions.endMs} - ${t.sleepSessions.startMs}`)).get();
  if (!s) return null;
  const stages = db.select().from(t.sleepStages).where(eq(t.sleepStages.sessionId, s.id)).orderBy(asc(t.sleepStages.startMs)).all();
  const summary = (s.summary ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const minutesAsleep = n(summary.minutesAsleep);
  const inBed = (s.endMs - s.startMs) / 60_000;
  return {
    id: s.id, startMs: s.startMs, endMs: s.endMs, startOffsetS: s.startOffsetS, endOffsetS: s.endOffsetS, sleepType: s.sleepType, isNap: s.isNap,
    minutesAsleep, minutesAwake: n(summary.minutesAwake), minutesToFallAsleep: n(summary.minutesToFallAsleep), timeInBedMin: inBed,
    efficiency: sleepEfficiency(minutesAsleep, inBed),
    stageMinutes: stageMinutes(stages),
    stages: stages.filter((x) => !x.isShortAwakening).map((x) => ({ startMs: x.startMs, endMs: x.endMs, stage: x.stage })),
  };
}

export function getToday(db: DB, date = todayDate()) {
  const tz = env().HOME_TIME_ZONE;
  const [dayStart, dayEnd] = civilDayBounds(date, tz);
  const weekAgo = shiftDate(date, -6);
  const active = intervalSum(db, "active-energy-burned", dayStart, dayEnd);
  const basal = intervalSum(db, "basal-energy-burned", dayStart, dayEnd);
  return {
    date,
    sleep: getLastNightSleep(db, date),
    vitals: {
      restingHr: dailyValue(db, "resting_hr", date),
      hrv: dailyValue(db, "hrv_rmssd_daily", date),
      spo2: dailyValue(db, "spo2_avg", date),
      respiratoryRate: dailyValue(db, "respiratory_rate", date),
      skinTempDeviation: dailyValue(db, "skin_temp_deviation", date),
      vo2max: dailyValue(db, "vo2max", date),
    },
    trends: {
      restingHr: dailySeries(db, "resting_hr", weekAgo, date),
      hrv: dailySeries(db, "hrv_rmssd_daily", weekAgo, date),
    },
    activity: {
      steps: intervalSum(db, "steps", dayStart, dayEnd),
      distanceM: intervalSum(db, "distance", dayStart, dayEnd),
      activeKcal: active,
      basalKcal: basal,
      // Google's own daily total (dailyRollUp total-calories). Basal energy is not exposed for the Fitbit Air
      // (verified: always empty), so active + basal cannot be used. Fallback kept for other sources.
      totalKcal: dailyValue(db, "total_kcal", date) ?? (active !== null && basal !== null ? active + basal : null),
      azm: intervalSum(db, "active-zone-minutes", dayStart, dayEnd),
    },
    workouts: getWorkouts(db, 3),
  };
}

export function getWorkouts(db: DB, limit = 50) {
  const ws = db.select().from(t.hevyWorkouts).where(isNull(t.hevyWorkouts.deletedAt)).orderBy(desc(t.hevyWorkouts.startMs)).limit(limit).all();
  if (!ws.length) return [];
  const ids = ws.map((w) => w.id);
  const sets = db.select().from(t.hevySets).where(inArray(t.hevySets.workoutId, ids)).all();
  const exCount = db.select({ workoutId: t.hevyExercises.workoutId, n: sql<number>`count(*)` }).from(t.hevyExercises).where(inArray(t.hevyExercises.workoutId, ids)).groupBy(t.hevyExercises.workoutId).all();
  return ws.map((w) => {
    const hr = hrWindowStats(hrSamples(db, w.startMs, w.endMs), w.startMs, w.endMs);
    return {
      id: w.id, title: w.title, startMs: w.startMs, endMs: w.endMs,
      exercises: exCount.find((e) => e.workoutId === w.id)?.n ?? 0,
      volume: volumeLoad(sets.filter((s) => s.workoutId === w.id)),
      hr: { avg: hr.avgBpm, max: hr.maxBpm, coverage: hr.coverage },
    };
  });
}

export function getWorkoutDetail(db: DB, id: string) {
  const w = db.select().from(t.hevyWorkouts).where(eq(t.hevyWorkouts.id, id)).get();
  if (!w || w.deletedAt) return null;
  const exercises = db.select().from(t.hevyExercises).where(eq(t.hevyExercises.workoutId, id)).orderBy(asc(t.hevyExercises.idx)).all();
  const sets = db.select().from(t.hevySets).where(eq(t.hevySets.workoutId, id)).orderBy(asc(t.hevySets.exerciseIdx), asc(t.hevySets.idx)).all();
  const templates = exercises.length
    ? db.select().from(t.hevyExerciseTemplates).where(inArray(t.hevyExerciseTemplates.id, exercises.map((e) => e.templateId))).all() : [];

  // HR timeline: 5 min before to 10 min after (for context and recovery), stats strictly within the workout interval.
  const preMs = 5 * 60_000, postMs = 10 * 60_000;
  const timeline = hrSamples(db, w.startMs - preMs, w.endMs + postMs);
  const stats = hrWindowStats(timeline, w.startMs, w.endMs);

  // Zones: provider-original Google daily zones for that civil day, if available.
  const date = civilDate(w.startMs, null, env().HOME_TIME_ZONE);
  const zoneRows = db.select().from(t.dailyMetrics).where(and(eq(t.dailyMetrics.date, date), sql`${t.dailyMetrics.metric} like 'hr_zone_%'`)).all();
  const bands = ["light", "moderate", "vigorous", "peak"].flatMap((z) => {
    const lo = zoneRows.find((r) => r.metric === `hr_zone_${z}_min`)?.value;
    const hi = zoneRows.find((r) => r.metric === `hr_zone_${z}_max`)?.value;
    return lo !== undefined ? [{ name: z, lowerBpm: lo, upperBpm: hi ?? Infinity }] : [];
  });
  const zones = bands.length ? timeInBands(timeline, w.startMs, w.endMs, bands) : null;

  // HR recovery: drop from HR at workout end to HR 60 s / 120 s later (only if both points exist within ±10 s).
  const at = (ms: number) => {
    const near = timeline.filter((s) => Math.abs(s.tMs - ms) <= 10_000).sort((a, b) => Math.abs(a.tMs - ms) - Math.abs(b.tMs - ms))[0];
    return near?.bpm ?? null;
  };
  const endHr = at(w.endMs), hr60 = at(w.endMs + 60_000), hr120 = at(w.endMs + 120_000);

  // Overlapping Google exercise session (provider calorie estimate). Never summed with anything else.
  // Prefer a Fitbit-recorded session: Hevy also writes each workout to Apple Health, which Google then imports
  // (verified in real data) — that copy carries Hevy's own estimate, not a measurement from the wearable.
  const google = db.select({ s: t.exerciseSessions, platform: t.sources.platform }).from(t.exerciseSessions)
    .leftJoin(t.sources, eq(t.sources.id, t.exerciseSessions.sourceId))
    .where(and(lt(t.exerciseSessions.startMs, w.endMs), gte(t.exerciseSessions.endMs, w.startMs))).all()
    .map(({ s: g, platform }) => ({ ...g, platform, overlapS: (Math.min(g.endMs, w.endMs) - Math.max(g.startMs, w.startMs)) / 1000 }))
    .sort((a, b) => Number(b.platform === "FITBIT") - Number(a.platform === "FITBIT") || b.overlapS - a.overlapS)[0] ?? null;

  // Previous similar workout: same routine, else same title.
  const prev = db.select().from(t.hevyWorkouts)
    .where(and(isNull(t.hevyWorkouts.deletedAt), lt(t.hevyWorkouts.startMs, w.startMs), w.routineId ? eq(t.hevyWorkouts.routineId, w.routineId) : eq(t.hevyWorkouts.title, w.title)))
    .orderBy(desc(t.hevyWorkouts.startMs)).get();
  const prevSets = prev ? db.select().from(t.hevySets).where(eq(t.hevySets.workoutId, prev.id)).all() : [];

  return {
    id: w.id, title: w.title, description: w.description, startMs: w.startMs, endMs: w.endMs,
    exercises: exercises.map((e) => {
      const tpl = templates.find((x) => x.id === e.templateId);
      const es = sets.filter((s) => s.exerciseIdx === e.idx);
      return { idx: e.idx, title: e.title, notes: e.notes, primaryMuscle: tpl?.primaryMuscle ?? null, sets: es, volume: volumeLoad(es) };
    }),
    volume: volumeLoad(sets),
    hr: { timeline, stats, zones, recovery: { endHr, drop60: endHr !== null && hr60 !== null ? endHr - hr60 : null, drop120: endHr !== null && hr120 !== null ? endHr - hr120 : null } },
    googleSession: google ? { exerciseType: google.exerciseType, platform: google.platform, caloriesKcal: (google.metrics as Record<string, unknown> | null)?.caloriesKcal ?? null, overlapS: google.overlapS } : null,
    previous: prev ? { id: prev.id, title: prev.title, startMs: prev.startMs, volume: volumeLoad(prevSets) } : null,
  };
}

export function hasAnyData(db: DB) {
  const a = db.select({ n: sql<number>`count(*)` }).from(t.dailyMetrics).get()!.n;
  const b = db.select({ n: sql<number>`count(*)` }).from(t.hevyWorkouts).get()!.n;
  const c = db.select({ n: sql<number>`count(*)` }).from(t.sleepSessions).get()!.n;
  return a + b + c > 0;
}
