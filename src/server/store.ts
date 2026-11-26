import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { and, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { sourceKey, type NormalizedBatch, type SourceDescriptor } from "./providers/google/normalize";
import type { HevyTemplate, HevyWorkout } from "./providers/hevy/client";

/** Store an original provider response verbatim (gzip). Identical bodies are stored once. */
export function storeRawPage(db: DB, provider: string, resource: string, requestKey: string, status: number, bodyText: string): number {
  const sha = createHash("sha256").update(bodyText).digest("hex");
  const existing = db.select({ id: t.rawPages.id }).from(t.rawPages)
    .where(and(eq(t.rawPages.provider, provider), eq(t.rawPages.resource, resource), eq(t.rawPages.bodySha256, sha))).get();
  if (existing) return existing.id;
  const row = db.insert(t.rawPages).values({
    provider, resource, requestKey, fetchedAt: Date.now(), httpStatus: status, bodySha256: sha, bodyGz: gzipSync(bodyText),
  }).returning({ id: t.rawPages.id }).get();
  return row.id;
}

export function readRawPage(db: DB, id: number): string | undefined {
  const row = db.select({ body: t.rawPages.bodyGz }).from(t.rawPages).where(eq(t.rawPages.id, id)).get();
  return row ? gunzipSync(row.body).toString("utf8") : undefined;
}

export function resolveSourceId(db: DB, s: SourceDescriptor, cache = new Map<string, number>()): number {
  const key = sourceKey(s);
  const cacheKey = `${s.provider}:${key}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;
  db.insert(t.sources).values({
    provider: s.provider, key, platform: s.platform, recordingMethod: s.recordingMethod, deviceFormFactor: s.deviceFormFactor,
    deviceManufacturer: s.deviceManufacturer, deviceName: s.deviceName, appPackage: s.appPackage,
  }).onConflictDoNothing().run();
  const id = db.select({ id: t.sources.id }).from(t.sources).where(and(eq(t.sources.provider, s.provider), eq(t.sources.key, key))).get()!.id;
  cache.set(cacheKey, id);
  return id;
}

export interface WriteStats { hr: number; obs: number; daily: number; sleep: number; exercise: number; deleted: number }

/**
 * Upsert a normalized batch in one transaction. Primary keys make this idempotent: re-importing the
 * same window updates rows in place instead of duplicating them.
 */
export function writeBatch(
  db: DB,
  batch: NormalizedBatch,
  rawPageId: number | null,
  replace?: { kind: "sleep" | "exercise"; startMs: number; endMs: number },
): WriteStats {
  const stats: WriteStats = { hr: 0, obs: 0, daily: 0, sleep: 0, exercise: 0, deleted: 0 };
  const cache = new Map<string, number>();
  db.transaction((tx) => {
    const d = tx as unknown as DB;
    for (const r of batch.hr) {
      d.insert(t.heartRateSamples).values({ sourceId: resolveSourceId(d, r.source, cache), tMs: r.tMs, utcOffsetS: r.utcOffsetS, bpm: r.bpm, motion: r.motion, rawPageId })
        .onConflictDoUpdate({ target: [t.heartRateSamples.sourceId, t.heartRateSamples.tMs], set: { bpm: r.bpm, motion: r.motion, utcOffsetS: r.utcOffsetS, rawPageId } }).run();
      stats.hr++;
    }
    for (const r of batch.obs) {
      const sourceId = resolveSourceId(d, r.source, cache);
      d.insert(t.observations).values({ dataType: r.dataType, sourceId, startMs: r.startMs, endMs: r.endMs, variant: r.variant, utcOffsetS: r.utcOffsetS, value: r.value, unit: r.unit, attrs: r.attrs, recordName: r.recordName, rawPageId })
        .onConflictDoUpdate({
          target: [t.observations.dataType, t.observations.sourceId, t.observations.startMs, t.observations.endMs, t.observations.variant],
          set: { value: r.value, unit: r.unit, attrs: r.attrs, utcOffsetS: r.utcOffsetS, recordName: r.recordName, rawPageId },
        }).run();
      stats.obs++;
    }
    for (const r of batch.daily) {
      const sourceId = resolveSourceId(d, r.source, cache);
      d.insert(t.dailyMetrics).values({ metric: r.metric, date: r.date, sourceId, value: r.value, unit: r.unit, attrs: r.attrs, rawPageId })
        .onConflictDoUpdate({ target: [t.dailyMetrics.metric, t.dailyMetrics.date, t.dailyMetrics.sourceId], set: { value: r.value, unit: r.unit, attrs: r.attrs, rawPageId } }).run();
      stats.daily++;
    }
    if (replace?.kind === "sleep") {
      const keep = batch.sleep.map((s) => s.id);
      const stale = d.select({ id: t.sleepSessions.id }).from(t.sleepSessions)
        .where(and(gte(t.sleepSessions.endMs, replace.startMs), lt(t.sleepSessions.endMs, replace.endMs), keep.length ? notInArray(t.sleepSessions.id, keep) : sql`1=1`)).all();
      for (const s of stale) {
        d.delete(t.sleepStages).where(eq(t.sleepStages.sessionId, s.id)).run();
        d.delete(t.sleepSessions).where(eq(t.sleepSessions.id, s.id)).run();
        stats.deleted++;
      }
    }
    for (const s of batch.sleep) {
      const sourceId = resolveSourceId(d, s.source, cache);
      const row = { sourceId, startMs: s.startMs, endMs: s.endMs, startOffsetS: s.startOffsetS, endOffsetS: s.endOffsetS, sleepType: s.sleepType, isMain: s.isMain, isNap: s.isNap, stagesStatus: s.stagesStatus, summary: s.summary, updatedAt: s.updatedAt, rawPageId };
      d.insert(t.sleepSessions).values({ id: s.id, ...row }).onConflictDoUpdate({ target: t.sleepSessions.id, set: row }).run();
      d.delete(t.sleepStages).where(eq(t.sleepStages.sessionId, s.id)).run();
      for (const st of s.stages) d.insert(t.sleepStages).values({ sessionId: s.id, ...st }).onConflictDoNothing().run();
      stats.sleep++;
    }
    if (replace?.kind === "exercise") {
      const keep = batch.exercise.map((e) => e.id);
      const res = d.delete(t.exerciseSessions)
        .where(and(gte(t.exerciseSessions.startMs, replace.startMs), lt(t.exerciseSessions.startMs, replace.endMs), keep.length ? notInArray(t.exerciseSessions.id, keep) : sql`1=1`)).run();
      stats.deleted += res.changes;
    }
    for (const e of batch.exercise) {
      const sourceId = resolveSourceId(d, e.source, cache);
      const row = { sourceId, startMs: e.startMs, endMs: e.endMs, startOffsetS: e.startOffsetS, exerciseType: e.exerciseType, displayName: e.displayName, activeDurationS: e.activeDurationS, metrics: e.metrics, rawPageId };
      d.insert(t.exerciseSessions).values({ id: e.id, ...row }).onConflictDoUpdate({ target: t.exerciseSessions.id, set: row }).run();
      stats.exercise++;
    }
  });
  return stats;
}

/** Idempotently replace one Hevy workout (and its exercises/sets) from the API representation. */
export function upsertHevyWorkout(db: DB, w: HevyWorkout, rawPageId: number | null) {
  const startMs = Date.parse(w.start_time), endMs = Date.parse(w.end_time);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error(`Hevy workout ${w.id} has invalid timestamps`);
  db.transaction((tx) => {
    const d = tx as unknown as DB;
    const row = { title: w.title, description: w.description, routineId: w.routine_id ?? null, startMs, endMs, createdAt: w.created_at, updatedAt: w.updated_at, deletedAt: null, rawPageId };
    d.insert(t.hevyWorkouts).values({ id: w.id, ...row }).onConflictDoUpdate({ target: t.hevyWorkouts.id, set: row }).run();
    d.delete(t.hevySets).where(eq(t.hevySets.workoutId, w.id)).run();
    d.delete(t.hevyExercises).where(eq(t.hevyExercises.workoutId, w.id)).run();
    for (const ex of w.exercises ?? []) {
      d.insert(t.hevyExercises).values({ workoutId: w.id, idx: ex.index, templateId: ex.exercise_template_id, title: ex.title, notes: ex.notes, supersetId: ex.superset_id }).run();
      for (const s of ex.sets ?? []) {
        d.insert(t.hevySets).values({
          workoutId: w.id, exerciseIdx: ex.index, idx: s.index, setType: s.type, weightKg: s.weight_kg, reps: s.reps,
          distanceM: s.distance_meters, durationS: s.duration_seconds, rpe: s.rpe, customMetric: s.custom_metric,
        }).run();
      }
    }
  });
}

/** Soft delete: keeps history auditable; deleted workouts are excluded from analytics. */
export function markHevyWorkoutDeleted(db: DB, id: string, deletedAt: string | undefined) {
  db.update(t.hevyWorkouts).set({ deletedAt: deletedAt ?? new Date().toISOString() }).where(eq(t.hevyWorkouts.id, id)).run();
}

export function upsertHevyTemplate(db: DB, x: HevyTemplate) {
  const row = { title: x.title, type: x.type, primaryMuscle: x.primary_muscle_group, secondaryMuscles: x.secondary_muscle_groups ?? [], equipment: x.equipment ?? null, isCustom: x.is_custom };
  db.insert(t.hevyExerciseTemplates).values({ id: x.id, ...row }).onConflictDoUpdate({ target: t.hevyExerciseTemplates.id, set: row }).run();
}
