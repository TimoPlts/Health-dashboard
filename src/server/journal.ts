import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { getSettings, setSetting } from "./settings";
import { DEFAULT_HABITS, normaliseHabitValue, type HabitDef, type HabitKind } from "@/lib/metrics/journal";

/**
 * Habit journal storage. Business rules live in lib/metrics/journal.ts; this module only reads and writes.
 * No row for a habit on a day = not logged.
 */
export type Habit = HabitDef & { sortOrder: number; archivedAt: number | null };

export function ensureDefaultHabits(db: DB) {
  if (getSettings(db).habitsSeeded) return;
  const now = Date.now();
  db.transaction((tx) => {
    DEFAULT_HABITS.forEach((h, i) => tx.insert(t.habits).values({ id: crypto.randomUUID(), ...h, sortOrder: i, createdAt: now }).run());
  });
  setSetting(db, "habitsSeeded", true);
}

export function listHabits(db: DB, includeArchived = false): Habit[] {
  return db.select().from(t.habits).where(includeArchived ? undefined : isNull(t.habits.archivedAt)).orderBy(asc(t.habits.sortOrder), asc(t.habits.createdAt)).all() as Habit[];
}

export function createHabit(db: DB, h: { name: string; kind: HabitKind; unit?: string | null }) {
  const max = (db.get(sql`select coalesce(max(sort_order), -1) as m from habits`) as { m: number }).m;
  const bounds = h.kind === "scale" ? { min: 1, max: 5, step: 1 } : h.kind === "number" ? { min: 0, max: 10_000, step: 1 } : { min: null, max: null, step: null };
  const id = crypto.randomUUID();
  db.insert(t.habits).values({ id, name: h.name.trim(), kind: h.kind, unit: h.kind === "number" ? h.unit?.trim() || null : null, ...bounds, sortOrder: max + 1, createdAt: Date.now() }).run();
  return id;
}

export function updateHabit(db: DB, id: string, patch: { name?: string; unit?: string | null; archived?: boolean; sortOrder?: number }) {
  const set: Partial<typeof t.habits.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.unit !== undefined) set.unit = patch.unit?.trim() || null;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? Date.now() : null;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (Object.keys(set).length) db.update(t.habits).set(set).where(eq(t.habits.id, id)).run();
}

/** Permanently delete a habit and all its entries. (Archiving keeps them.) */
export function deleteHabit(db: DB, id: string) {
  db.transaction((tx) => {
    tx.delete(t.habitEntries).where(eq(t.habitEntries.habitId, id)).run();
    tx.delete(t.habits).where(eq(t.habits.id, id)).run();
  });
}

/** Log (or clear, with null) one habit for one day. Returns false when the value is not valid for the habit. */
export function setEntry(db: DB, habitId: string, date: string, value: unknown): boolean {
  const h = db.select().from(t.habits).where(eq(t.habits.id, habitId)).get();
  if (!h) return false;
  if (value === null) { db.delete(t.habitEntries).where(and(eq(t.habitEntries.habitId, habitId), eq(t.habitEntries.date, date))).run(); return true; }
  const v = normaliseHabitValue(h as HabitDef, value);
  if (v === null) return false;
  db.insert(t.habitEntries).values({ habitId, date, value: v, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: [t.habitEntries.habitId, t.habitEntries.date], set: { value: v, updatedAt: Date.now() } }).run();
  return true;
}

/** Entries in [from, to] as habitId → date → value. */
export function entriesBetween(db: DB, from: string, to: string): Map<string, Map<string, number>> {
  const rows = db.select().from(t.habitEntries).where(and(gte(t.habitEntries.date, from), lte(t.habitEntries.date, to))).all();
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) { if (!out.has(r.habitId)) out.set(r.habitId, new Map()); out.get(r.habitId)!.set(r.date, r.value); }
  return out;
}
