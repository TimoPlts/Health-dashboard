import { eq } from "drizzle-orm";
import type { DB } from "./db/client";
import * as t from "./db/schema";
import { DEFAULT_SLEEP_NEED_MIN } from "@/lib/metrics/sleep";

/** Owner preferences and provider profile facts (not secrets). Stored in the `settings` table. */
export interface AppSettings {
  sleepNeedMin: number;
  hrMaxOverride: number | null;
  /** Age from the Google Health profile (`users/me/profile`), refreshed on sync. */
  profileAge: number | null;
  /** Minutes between automatic syncs while the server runs; 0 = off. */
  autoSyncMinutes: number;
}
const DEFAULTS: AppSettings = { sleepNeedMin: DEFAULT_SLEEP_NEED_MIN, hrMaxOverride: null, profileAge: null, autoSyncMinutes: 30 };

export function getSettings(db: DB): AppSettings {
  const rows = db.select().from(t.settings).all();
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export function setSetting<K extends keyof AppSettings>(db: DB, key: K, value: AppSettings[K]) {
  db.insert(t.settings).values({ key, value: value as never, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: value as never, updatedAt: Date.now() } }).run();
}

export function deleteSetting(db: DB, key: keyof AppSettings) {
  db.delete(t.settings).where(eq(t.settings.key, key)).run();
}
