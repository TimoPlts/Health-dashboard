import { eq } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { DEFAULT_SLEEP_NEED_MIN } from "@/lib/metrics/sleep";

/**
 * Personal targets. Every goal is optional (null = not set); nothing is assumed for you. Times are minutes after
 * midnight. Weekly goals use ISO weeks (Monday–Sunday). Evaluated by src/lib/metrics/goals.ts.
 */
export interface Goals {
  stepsDaily: number | null;
  activeMinDaily: number | null;
  azmWeekly: number | null;
  zone2WeeklyMin: number | null;
  cardioSessionsWeekly: number | null;
  sleepMin: number | null;
  bedtimeMin: number | null;
  wakeMin: number | null;
  weightKg: number | null;
}
export const EMPTY_GOALS: Goals = { stepsDaily: null, activeMinDaily: null, azmWeekly: null, zone2WeeklyMin: null, cardioSessionsWeekly: null, sleepMin: null, bedtimeMin: null, wakeMin: null, weightKg: null };

/** Owner preferences and provider profile facts (not secrets). Stored in the `settings` table. */
export interface AppSettings {
  sleepNeedMin: number;
  hrMaxOverride: number | null;
  /** Age from the Google Health profile (`users/me/profile`), refreshed on sync. */
  profileAge: number | null;
  /** Minutes between automatic syncs while the server runs; 0 = off. */
  autoSyncMinutes: number;
  /** Days to keep raw API responses (a re-processing cache, not needed for any page); 0 = forever. */
  rawRetentionDays: number;
  /** Number of daily automatic backups to keep; 0 = no automatic backups. */
  backupKeep: number;
  goals: Goals;
}
const DEFAULTS: AppSettings = { sleepNeedMin: DEFAULT_SLEEP_NEED_MIN, hrMaxOverride: null, profileAge: null, autoSyncMinutes: 30, rawRetentionDays: 90, backupKeep: 14, goals: EMPTY_GOALS };

export function getSettings(db: DB): AppSettings {
  const rows = db.select().from(t.settings).all();
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.key === "goals" ? { ...EMPTY_GOALS, ...(r.value as object) } : r.value;
  return out as unknown as AppSettings;
}

export function setSetting<K extends keyof AppSettings>(db: DB, key: K, value: AppSettings[K]) {
  db.insert(t.settings).values({ key, value: value as never, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: value as never, updatedAt: Date.now() } }).run();
}

export function deleteSetting(db: DB, key: keyof AppSettings) {
  db.delete(t.settings).where(eq(t.settings.key, key)).run();
}
