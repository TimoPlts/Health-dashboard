import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { resolveSourceId, writeBatch } from "./store";
import { emptyBatch, type SourceDescriptor } from "./providers/google/normalize";
import { offsetMs, zonedInstant } from "@/lib/time";
import { weightTrend } from "@/lib/metrics/weight";
import { phaseProblem, selectDailyWeights, type PhaseKind, type WeighIn, type WeightPhase } from "@/lib/metrics/weight-tracker";

/**
 * Body weight storage. Google's weight records (synced with the other streams) plus manual entries stored as
 * observations with Baseline's own source, so every weight chart and metric includes both. Manual entries are never
 * sent to Google (read-only access) and never touched by sync. Notes on manual entries live in the row's `attrs`.
 * The designated morning weigh-in per day is kept in `weight_day_choice`; phases in `weight_phases`.
 */
export const MANUAL_SOURCE: SourceDescriptor = { provider: "baseline", platform: "MANUAL", deviceName: "Manual entry" };
export const DUPLICATE_WINDOW_MS = 30 * 60_000;
export const DUPLICATE_KG = 0.1;
export const NOTE_MAX = 200;
/** Time stamped on a morning weigh-in logged for an earlier day. */
export const BACKFILL_MORNING = { hh: 7, mm: 0 };

export interface WeightEntry {
  key: string; tMs: number; offsetS: number | null; kg: number; manual: boolean; source: string; sourceId: number; note: string | null;
}
export const entryKey = (sourceId: number, tMs: number) => `${sourceId}:${tMs}`;

export function listWeights(db: DB, fromMs: number, toMs: number): WeightEntry[] {
  const rows = db.all(sql`
    select o.start_ms as tMs, o.utc_offset_s as offsetS, o.value as kg, o.source_id as sourceId, o.attrs as attrs,
      s.provider as provider, s.device_name as deviceName, s.app_package as app
    from observations o left join sources s on s.id = o.source_id
    where o.data_type = 'weight' and o.start_ms >= ${fromMs} and o.start_ms < ${toMs} order by o.start_ms`) as { tMs: number; offsetS: number | null; kg: number; sourceId: number; attrs: string | null; provider: string; deviceName: string | null; app: string | null }[];
  return rows.map((r) => {
    const manual = r.provider === "baseline";
    let note: string | null = null;
    if (manual && r.attrs) { try { const a = JSON.parse(r.attrs) as { note?: unknown }; note = typeof a.note === "string" && a.note ? a.note : null; } catch { /* ignore */ } }
    return {
      key: entryKey(r.sourceId, r.tMs), tMs: r.tMs, offsetS: r.offsetS, kg: r.kg, manual, sourceId: r.sourceId, note,
      source: manual ? "Manual entry" : r.deviceName ?? (r.app ? `Google (${r.app})` : "Google Health"),
    };
  });
}

/** Civil date and minute of day of an entry, from its own UTC offset (fallback: the home offset). */
export function localOf(tMs: number, offsetS: number | null, fbOffsetS: number) {
  const local = tMs + (offsetS ?? fbOffsetS) * 1000;
  return { date: new Date(local).toISOString().slice(0, 10), localMin: Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / 60_000) };
}

export function dayChoices(db: DB): Map<string, string> {
  return new Map(db.select().from(t.weightDayChoice).all().map((r) => [r.date, entryKey(r.sourceId, r.tMs)]));
}

/**
 * All weight data, all time: entries with civil date, the one weight per day (weight-trend@2) and the smoothed trend.
 * The trend is computed over the whole history so its value never depends on the range being viewed.
 */
export function weightData(db: DB, fbOffsetS: number) {
  const entries = listWeights(db, 0, Number.MAX_SAFE_INTEGER).map((e) => ({ ...e, ...localOf(e.tMs, e.offsetS, fbOffsetS) }));
  const choices = dayChoices(db);
  const weighIns: WeighIn[] = entries.map((e) => ({ key: e.key, date: e.date, tMs: e.tMs, localMin: e.localMin, kg: e.kg, manual: e.manual }));
  const daily = selectDailyWeights(weighIns, choices);
  return { entries, choices, daily, trend: weightTrend(daily) };
}
export type WeightEntryLocal = ReturnType<typeof weightData>["entries"][number];

function insertManual(db: DB, tMs: number, offsetS: number, kg: number, note: string | null) {
  const b = emptyBatch();
  b.obs.push({ source: MANUAL_SOURCE, dataType: "weight", startMs: tMs, endMs: tMs, variant: "", utcOffsetS: offsetS, value: Math.round(kg * 100) / 100, unit: "kg", attrs: note ? { note } : undefined });
  writeBatch(db, b, null);
  return resolveSourceId(db, MANUAL_SOURCE);
}

function setChoice(db: DB, date: string, tMs: number, sourceId: number) {
  const v = { tMs, sourceId, updatedAt: Date.now() };
  db.insert(t.weightDayChoice).values({ date, ...v }).onConflictDoUpdate({ target: t.weightDayChoice.date, set: v }).run();
}

const cleanNote = (n: string | null | undefined) => (n?.trim() ? n.trim().slice(0, NOTE_MAX) : null);

/**
 * Add a manual weight at an exact time (history entry; not the day's designated weigh-in). Refused as a duplicate when
 * any entry (manual or from Google) lies within 30 minutes and 0.1 kg.
 */
export function addManualWeight(db: DB, e: { tMs: number; offsetS: number; kg: number; note?: string | null }): { ok: true } | { ok: false; reason: "duplicate" | "range" } {
  if (!(e.kg >= 25 && e.kg <= 350)) return { ok: false, reason: "range" };
  const near = listWeights(db, e.tMs - DUPLICATE_WINDOW_MS, e.tMs + DUPLICATE_WINDOW_MS + 1);
  if (near.some((w) => Math.abs(w.kg - e.kg) <= DUPLICATE_KG)) return { ok: false, reason: "duplicate" };
  insertManual(db, e.tMs, e.offsetS, e.kg, cleanNote(e.note));
  return { ok: true };
}

/**
 * Quick morning log for a civil date. One designated weigh-in per day:
 *   - the day's designated weigh-in is a manual entry → it is corrected (weight and note), not duplicated;
 *   - an existing entry within 30 min / 0.1 kg of the new one (e.g. the scale already sent it via Google) → that entry
 *     becomes the designated weigh-in, nothing is added;
 *   - otherwise a manual entry is added (now, or 07:00 local for an earlier day) and designated.
 * Other weigh-ins of the day, including Google's, are never deleted.
 */
export function logMorningWeight(db: DB, i: { date: string; kg: number; note?: string | null; today: string; nowMs: number; tz: string; fbOffsetS: number }):
  { ok: true; action: "created" | "updated" | "linked" } | { ok: false; reason: "range" | "future" } {
  if (!(i.kg >= 25 && i.kg <= 350)) return { ok: false, reason: "range" };
  if (i.date > i.today) return { ok: false, reason: "future" };
  const kg = Math.round(i.kg * 100) / 100, note = cleanNote(i.note);
  const choice = db.select().from(t.weightDayChoice).where(eq(t.weightDayChoice.date, i.date)).get();
  const manualId = resolveSourceId(db, MANUAL_SOURCE);
  if (choice && choice.sourceId === manualId && updateManualWeight(db, choice.tMs, { kg, note })) return { ok: true, action: "updated" };
  const at = i.date === i.today ? { tMs: i.nowMs, offsetS: Math.round(offsetMs(i.nowMs, i.tz) / 1000) } : zonedInstant(i.date, BACKFILL_MORNING.hh, BACKFILL_MORNING.mm, i.tz);
  const near = listWeights(db, at.tMs - DUPLICATE_WINDOW_MS, at.tMs + DUPLICATE_WINDOW_MS + 1)
    .filter((w) => Math.abs(w.kg - kg) <= DUPLICATE_KG && localOf(w.tMs, w.offsetS, i.fbOffsetS).date === i.date);
  if (near[0]) {
    setChoice(db, i.date, near[0].tMs, near[0].sourceId);
    if (near[0].manual && note) updateManualWeight(db, near[0].tMs, { kg: near[0].kg, note });
    return { ok: true, action: "linked" };
  }
  const sid = insertManual(db, at.tMs, at.offsetS, kg, note);
  setChoice(db, i.date, at.tMs, sid);
  return { ok: true, action: "created" };
}

/** Correct a manual entry (weight and/or note). Google entries cannot be edited (they come back with the next sync). */
export function updateManualWeight(db: DB, tMs: number, p: { kg?: number; note?: string | null }): boolean {
  const sid = resolveSourceId(db, MANUAL_SOURCE);
  const row = db.get(sql`select value, attrs from observations where data_type = 'weight' and source_id = ${sid} and start_ms = ${tMs}`) as { value: number; attrs: string | null } | undefined;
  if (!row) return false;
  if (p.kg !== undefined && !(p.kg >= 25 && p.kg <= 350)) return false;
  let attrs: Record<string, unknown> = {};
  try { attrs = row.attrs ? (JSON.parse(row.attrs) as Record<string, unknown>) : {}; } catch { attrs = {}; }
  if (p.note !== undefined) { const n = cleanNote(p.note); if (n) attrs.note = n; else delete attrs.note; }
  db.run(sql`update observations set value = ${p.kg !== undefined ? Math.round(p.kg * 100) / 100 : row.value}, attrs = ${Object.keys(attrs).length ? JSON.stringify(attrs) : null}
    where data_type = 'weight' and source_id = ${sid} and start_ms = ${tMs}`);
  return true;
}

/** Delete a manual entry (and its designation). Google records cannot be deleted here (they would come back with sync). */
export function deleteManualWeight(db: DB, tMs: number): boolean {
  const sid = resolveSourceId(db, MANUAL_SOURCE);
  const r = db.run(sql`delete from observations where data_type = 'weight' and start_ms = ${tMs} and source_id = ${sid}`);
  if (r.changes > 0) db.delete(t.weightDayChoice).where(and(eq(t.weightDayChoice.tMs, tMs), eq(t.weightDayChoice.sourceId, sid))).run();
  return r.changes > 0;
}

/** Designate an existing weigh-in (manual or Google) as its day's morning weigh-in. */
export function designateMorning(db: DB, tMs: number, sourceId: number, fbOffsetS: number): boolean {
  const e = listWeights(db, tMs, tMs + 1).find((w) => w.sourceId === sourceId);
  if (!e) return false;
  setChoice(db, localOf(e.tMs, e.offsetS, fbOffsetS).date, e.tMs, e.sourceId);
  return true;
}

/* ---------------------------------------------- Phases ---------------------------------------------- */

export function listPhases(db: DB): WeightPhase[] {
  return db.select().from(t.weightPhases).orderBy(asc(t.weightPhases.startDate)).all().map((r) => ({
    id: r.id, kind: r.kind as PhaseKind, name: r.name, startDate: r.startDate, startKg: r.startKg, endDate: r.endDate, goalKg: r.goalKg, targetRateKgWeek: r.targetRateKgWeek,
  }));
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Create a phase. Phases do not overlap: an open phase that started earlier is ended the day before the new one;
 * a new phase may not start inside a phase that has already ended, or on/before the start of an open phase.
 */
export function createPhase(db: DB, p: Omit<WeightPhase, "id">): { ok: true; id: string } | { ok: false; error: string } {
  const problem = phaseProblem(p);
  if (problem) return { ok: false, error: problem };
  const all = listPhases(db);
  const end = p.endDate ?? "9999-12-31";
  for (const q of all) {
    const qEnd = q.endDate ?? "9999-12-31";
    if (q.startDate < p.startDate && q.endDate === null) continue; // will be closed below
    if (q.startDate <= end && p.startDate <= qEnd) return { ok: false, error: `Overlaps “${q.name}” (${q.startDate} – ${q.endDate ?? "ongoing"}).` };
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    for (const q of all) if (q.endDate === null && q.startDate < p.startDate) tx.update(t.weightPhases).set({ endDate: dayBefore(p.startDate), updatedAt: now }).where(eq(t.weightPhases.id, q.id)).run();
    tx.insert(t.weightPhases).values({ id, ...p, name: p.name.trim().slice(0, 40) || "Phase", createdAt: now, updatedAt: now }).run();
  });
  return { ok: true, id };
}

export function updatePhase(db: DB, id: string, p: Omit<WeightPhase, "id">): { ok: true } | { ok: false; error: string } {
  const problem = phaseProblem(p);
  if (problem) return { ok: false, error: problem };
  const end = p.endDate ?? "9999-12-31";
  for (const q of listPhases(db)) {
    if (q.id === id) continue;
    if (q.startDate <= end && p.startDate <= (q.endDate ?? "9999-12-31")) return { ok: false, error: `Overlaps “${q.name}”.` };
  }
  const r = db.update(t.weightPhases).set({ ...p, name: p.name.trim().slice(0, 40) || "Phase", updatedAt: Date.now() }).where(eq(t.weightPhases.id, id)).run();
  return r.changes ? { ok: true } : { ok: false, error: "Phase not found." };
}

export function deletePhase(db: DB, id: string): boolean {
  return db.delete(t.weightPhases).where(eq(t.weightPhases.id, id)).run().changes > 0;
}
