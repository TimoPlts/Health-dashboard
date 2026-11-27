import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as t from "../db/schema";
import { hrWindowStats, timeInBands } from "@/lib/metrics/heart-rate";
import { chooseHrMax, zoneLoad } from "@/lib/metrics/load";
import { civilDate } from "@/lib/time";
import { hrSamples } from "../queries";
import { getSettings } from "../settings";
import { isCardio, isCategory, validEffort, type WorkoutCategory } from "@/lib/metrics/workout-labels";

/**
 * Workouts from Google Health exercise sessions (no Hevy Pro needed). Documented in docs/CALCULATIONS.md § WORKOUTS.
 *
 * Verified on real data: Hevy writes each workout to Apple Health, which Google imports as a HEALTH_KIT session
 * (type STRENGTH_TRAINING, generic name, Hevy's calorie estimate — no exercises, sets, reps or weights). Hevy sometimes
 * writes the same workout twice, and the Fitbit Air may detect it as well. Sessions are therefore GROUPED:
 *   same exerciseType AND overlap ≥ 50 % of the shorter session → one workout.
 * Primary session (labels, calories) = Fitbit-recorded if present, else the longest. The analysis window is the union
 * of the grouped intervals (a Hevy log usually spans the whole session; Fitbit auto-detection may start late).
 * Sessions shorter than 60 s are listed but not analysed. Exclusions are stored separately; provider rows are untouched.
 */
export const WORKOUT_VERSION = "workouts@1";
const MIN_ANALYSABLE_MS = 60_000;

interface SessionRow {
  id: string; startMs: number; endMs: number; startOffsetS: number | null; exerciseType: string; displayName: string | null;
  activeDurationS: number | null; metrics: string | null; platform: string | null; recordingMethod: string | null; appPackage: string | null; deviceName: string | null;
}

export interface WorkoutSource { sessionId: string; platform: string | null; app: string | null; recordingMethod: string | null; label: string }

export interface WorkoutLabel { name: string | null; category: WorkoutCategory | null; effort: number | null }

export interface WorkoutSummary {
  id: string; type: string; title: string; typeTitle: string; label: WorkoutLabel | null; cardio: boolean; startMs: number; endMs: number; offsetS: number | null; date: string;
  durationMin: number; activeMin: number | null; sources: WorkoutSource[];
  calories: { kcal: number; source: string } | null;
  providerAvgHr: number | null; providerAzm: number | null; distanceM: number | null; steps: number | null;
  excluded: boolean; tooShort: boolean;
}

export const typeLabel = (t: string) => t.toLowerCase().split("_").map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
const sourceLabel = (r: SessionRow) =>
  r.appPackage === "com.hevyapp.hevy" ? "Hevy (via Apple Health)" : r.platform === "FITBIT" ? (r.recordingMethod === "ACTIVELY_MEASURED" ? "Fitbit Air (started on device)" : "Fitbit Air (auto-detected)")
    : r.platform === "HEALTH_KIT" ? `Apple Health${r.appPackage ? ` (${r.appPackage})` : ""}` : r.platform ?? "Google";

function loadSessions(db: DB, fromMs: number, toMs: number): SessionRow[] {
  return db.all(sql`
    select e.id, e.start_ms as startMs, e.end_ms as endMs, e.start_offset_s as startOffsetS, e.exercise_type as exerciseType, e.display_name as displayName,
      e.active_duration_s as activeDurationS, e.metrics, s.platform, s.recording_method as recordingMethod, s.app_package as appPackage, s.device_name as deviceName
    from exercise_sessions e left join sources s on s.id = e.source_id
    where e.end_ms >= ${fromMs} and e.start_ms < ${toMs} order by e.start_ms`) as SessionRow[];
}

/** Pure grouping step (exported for tests). */
export function groupSessions<T extends { id: string; startMs: number; endMs: number; exerciseType: string }>(rows: T[]): T[][] {
  const groups: T[][] = [];
  for (const r of [...rows].sort((a, b) => a.startMs - b.startMs)) {
    const g = groups.find((grp) => grp.some((x) => {
      if (x.exerciseType !== r.exerciseType) return false;
      const overlap = Math.min(x.endMs, r.endMs) - Math.max(x.startMs, r.startMs);
      const shorter = Math.min(x.endMs - x.startMs, r.endMs - r.startMs);
      return overlap > 0 && (shorter <= 0 || overlap >= 0.5 * shorter);
    }));
    if (g) g.push(r); else groups.push([r]);
  }
  return groups;
}

type AnnotationRow = { sessionId: string; name: string | null; category: string | null; effort: number | null; updatedAt: number };

function summarise(group: SessionRow[], excluded: Set<string>, tz: string, annotations: Map<string, AnnotationRow>): WorkoutSummary {
  const primary = [...group].sort((a, b) => Number(b.platform === "FITBIT") - Number(a.platform === "FITBIT") || (b.endMs - b.startMs) - (a.endMs - a.startMs))[0]!;
  const startMs = Math.min(...group.map((g) => g.startMs)), endMs = Math.max(...group.map((g) => g.endMs));
  const m = (r: SessionRow) => (r.metrics ? (JSON.parse(r.metrics) as Record<string, unknown>) : {});
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const calSrc = [primary, ...group.filter((g) => g !== primary)].find((r) => num(m(r).caloriesKcal) !== null);
  const pm = m(primary);
  // The newest label written to any session of the group (labels are written to all of them).
  const ann = group.map((g) => annotations.get(g.id)).filter((a): a is AnnotationRow => Boolean(a)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const label: WorkoutLabel | null = ann ? { name: ann.name, category: isCategory(ann.category) ? ann.category : null, effort: validEffort(ann.effort) ? ann.effort : null } : null;
  return {
    id: primary.id, type: primary.exerciseType, typeTitle: typeLabel(primary.exerciseType), title: label?.name || typeLabel(primary.exerciseType),
    label, cardio: isCardio(primary.exerciseType, label?.category), startMs, endMs, offsetS: primary.startOffsetS,
    date: civilDate(startMs, primary.startOffsetS, tz), durationMin: (endMs - startMs) / 60_000,
    activeMin: primary.activeDurationS !== null ? primary.activeDurationS / 60 : null,
    sources: group.map((r) => ({ sessionId: r.id, platform: r.platform, app: r.appPackage, recordingMethod: r.recordingMethod, label: sourceLabel(r) })),
    calories: calSrc ? { kcal: num(m(calSrc).caloriesKcal)!, source: sourceLabel(calSrc) } : null,
    providerAvgHr: num(pm.averageHeartRateBeatsPerMinute), providerAzm: num(pm.activeZoneMinutes),
    distanceM: num(pm.distanceMillimeters) !== null ? num(pm.distanceMillimeters)! / 1000 : null, steps: num(pm.steps),
    excluded: group.some((g) => excluded.has(g.id)), tooShort: endMs - startMs < MIN_ANALYSABLE_MS,
  };
}

function exclusions(db: DB) {
  return new Set(db.select({ id: t.exerciseExclusions.sessionId }).from(t.exerciseExclusions).all().map((r) => r.id));
}

function annotations(db: DB) {
  return new Map(db.select().from(t.workoutAnnotations).all().map((r) => [r.sessionId, r as AnnotationRow]));
}

export function listWorkouts(db: DB, fromMs: number, toMs: number, tz: string): WorkoutSummary[] {
  const ex = exclusions(db), ann = annotations(db);
  return groupSessions(loadSessions(db, fromMs, toMs)).map((g) => summarise(g, ex, tz, ann)).sort((a, b) => b.startMs - a.startMs);
}

/** Workouts that are comparable with `w`: the same owner category when labelled, otherwise the same exercise type. */
export function isSimilarWorkout(w: Pick<WorkoutSummary, "type" | "label">, x: Pick<WorkoutSummary, "type" | "label">) {
  if (w.label?.category) return x.label?.category === w.label.category;
  return x.type === w.type && !x.label?.category;
}

/** HR-derived metrics for one workout window (gap-aware). */
export function workoutHr(db: DB, w: Pick<WorkoutSummary, "startMs" | "endMs" | "date">) {
  const s = getSettings(db);
  const samples = hrSamples(db, w.startMs, w.endMs);
  const stats = hrWindowStats(samples, w.startMs, w.endMs);
  const hm = chooseHrMax({ override: s.hrMaxOverride, age: s.profileAge });
  const load = hm && samples.length ? zoneLoad(samples, w.startMs, w.endMs, hm.hrMax) : null;
  return { stats, load, hrMax: hm };
}

export function workoutDetail(db: DB, id: string, tz: string) {
  const row = db.select().from(t.exerciseSessions).where(sql`${t.exerciseSessions.id} = ${id}`).get();
  if (!row) return null;
  const all = listWorkouts(db, row.startMs - 6 * 3_600_000, row.endMs + 6 * 3_600_000, tz);
  const w = all.find((x) => x.sources.some((s) => s.sessionId === id));
  if (!w) return null;
  const { stats, load, hrMax } = workoutHr(db, w);
  const pre = 5 * 60_000, post = 10 * 60_000;
  const timeline = hrSamples(db, w.startMs - pre, w.endMs + post);
  // Google's own zones (40/60/85 % HRR) for that day, if present.
  const zr = db.all(sql`select metric, value from daily_metrics where date = ${w.date} and metric like 'hr_zone_%'`) as { metric: string; value: number }[];
  const bands = ["light", "moderate", "vigorous", "peak"].flatMap((z) => {
    const lo = zr.find((r) => r.metric === `hr_zone_${z}_min`)?.value, hi = zr.find((r) => r.metric === `hr_zone_${z}_max`)?.value;
    return lo !== undefined ? [{ name: z, lowerBpm: lo, upperBpm: hi ?? Infinity }] : [];
  });
  const googleZones = bands.length ? timeInBands(timeline, w.startMs, w.endMs, bands) : null;
  const at = (ms: number) => timeline.filter((x) => Math.abs(x.tMs - ms) <= 10_000).sort((a, b) => Math.abs(a.tMs - ms) - Math.abs(b.tMs - ms))[0]?.bpm ?? null;
  const endHr = at(w.endMs), hr60 = at(w.endMs + 60_000), hr120 = at(w.endMs + 120_000);
  // Similar earlier workouts (same category, else same type), excluding excluded / too-short ones.
  const history = listWorkouts(db, w.startMs - 180 * 86_400_000, w.startMs, tz)
    .filter((x) => isSimilarWorkout(w, x) && !x.excluded && !x.tooShort && x.id !== w.id).slice(0, 12)
    .map((x) => { const h = workoutHr(db, x); return { id: x.id, date: x.date, title: x.title, startMs: x.startMs, durationMin: x.durationMin, avgHr: h.stats.avgBpm, maxHr: h.stats.maxBpm, trimp: h.load?.trimp ?? null, kcal: x.calories?.kcal ?? null, effort: x.label?.effort ?? null }; });
  const mean = (v: (number | null)[]) => { const x = v.filter((n): n is number => n !== null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const similarAverage = history.length >= 2 ? {
    n: history.length, durationMin: mean(history.map((h) => h.durationMin)), avgHr: mean(history.map((h) => h.avgHr)),
    trimp: mean(history.map((h) => h.trimp)), effort: mean(history.map((h) => h.effort)),
  } : null;
  return {
    workout: w, stats, load, hrMax, timeline, googleZones, preMs: pre, postMs: post,
    recovery: { endHr, drop60: endHr !== null && hr60 !== null ? endHr - hr60 : null, drop120: endHr !== null && hr120 !== null ? endHr - hr120 : null },
    history, similarAverage, similarBy: w.label?.category ? ("category" as const) : ("type" as const),
  };
}

/**
 * Label a workout (name, category, effort). Written for every session of the group; provider rows are untouched.
 * All fields null → the label is removed.
 */
export function setWorkoutLabel(db: DB, sessionIds: string[], l: WorkoutLabel) {
  const empty = !l.name && !l.category && l.effort === null;
  for (const id of sessionIds) {
    if (empty) { db.delete(t.workoutAnnotations).where(sql`${t.workoutAnnotations.sessionId} = ${id}`).run(); continue; }
    const v = { name: l.name?.trim() || null, category: l.category, effort: l.effort, updatedAt: Date.now() };
    db.insert(t.workoutAnnotations).values({ sessionId: id, ...v }).onConflictDoUpdate({ target: t.workoutAnnotations.sessionId, set: v }).run();
  }
}

export function setExcluded(db: DB, sessionIds: string[], excluded: boolean, reason?: string) {
  for (const id of sessionIds) {
    if (excluded) db.insert(t.exerciseExclusions).values({ sessionId: id, reason: reason ?? null, excludedAt: Date.now() }).onConflictDoNothing().run();
    else db.delete(t.exerciseExclusions).where(sql`${t.exerciseExclusions.sessionId} = ${id}`).run();
  }
}
