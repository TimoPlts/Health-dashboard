import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import type { DB } from "../db/client";
import { env, isDemoMode } from "../env";
import { getConnection, getGoogleAccessToken, getHevyApiKey } from "../connections";
import { GoogleHealthClient } from "../providers/google/client";
import { HevyClient } from "../providers/hevy/client";
import { closeInterruptedRuns, syncGoogle, syncHevy, describeError, type SyncLogger } from "./engine";
import { computeDerived, datesNeedingDerive } from "../analytics/derive";
import { getSettings, setSetting } from "../settings";
import { offsetMs } from "@/lib/time";
import { todayDate } from "../queries";
import { ensureSafeDir, runtimePaths } from "../runtime-home";
import { autoBackupIfDue } from "../data/backup";
import { applyRetention } from "../data/retention";

const g = globalThis as unknown as { __syncRunning?: Promise<unknown>; __syncStartedAt?: number };

export function isSyncRunning() {
  return g.__syncRunning !== undefined;
}
export function syncStartedAt() {
  return g.__syncStartedAt ?? null;
}

const LOCK_STALE_MS = 45 * 60_000;

/** True unless the lock names a process that no longer exists (server killed mid-sync). */
export function lockOwnerAlive(content: string, isAlive = pidAlive): boolean {
  try {
    const pid = (JSON.parse(content) as { pid?: unknown }).pid;
    return typeof pid !== "number" || pid === process.pid || isAlive(pid);
  } catch { return true; } // unreadable: fall back to the age rule
}
function pidAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

/**
 * Cross-process lock (web server + CLI/Task Scheduler) via an exclusive lock file in the runtime folder.
 * A lock older than 45 min, or whose owner process is gone, is treated as stale and replaced.
 */
function acquireLock(): (() => void) | null {
  const file = path.join(isDemoMode() ? "./data" : ensureSafeDir(runtimePaths().home), "sync.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, "wx");
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return () => { try { unlinkSync(file); } catch { /* already gone */ } };
    } catch {
      try {
        const age = Date.now() - statSync(file).mtimeMs;
        if (age > LOCK_STALE_MS || !lockOwnerAlive(readFileSync(file, "utf8"))) { unlinkSync(file); continue; }
      } catch { continue; }
      return null;
    }
  }
  return null;
}

/**
 * Sync every connected provider, then refresh derived metrics. Only one sync runs at a time — within this process
 * a second call joins the running one; across processes the lock file makes the second caller skip.
 * Hevy is optional: nothing in Baseline depends on it.
 */
export function syncAll(db: DB, trigger: string, log?: SyncLogger) {
  if (g.__syncRunning) return g.__syncRunning;
  const run = (async () => {
    const out: Record<string, unknown> = {};
    const release = acquireLock();
    if (!release) { log?.warn("Another Baseline sync is running (lock file present) — skipped."); return { skipped: true }; }
    try {
      closeInterruptedRuns(db);
      const tz = env().HOME_TIME_ZONE;
      const google = getConnection(db, "google");
      if (google?.status === "connected") {
        const client = new GoogleHealthClient(() => getGoogleAccessToken(db), {}, async () => { await getGoogleAccessToken(db, { force: true }); });
        out.google = await syncGoogle(db, client, { backfillDays: env().BACKFILL_DAYS, trigger, log, timeZone: tz });
        try {
          const p = await client.getProfile();
          if (typeof p.age === "number") setSetting(db, "profileAge", p.age);
        } catch (e) { log?.warn(`profile: ${describeError(e)}`); }
        const fb = Math.round(offsetMs(Date.now(), tz) / 1000);
        const dates = datesNeedingDerive(db, todayDate(), 3, fb);
        const d = computeDerived(db, dates, tz);
        log?.info(`derived metrics: ${d.days} days`);
      }
      const hevyKey = getHevyApiKey(db);
      if (hevyKey) out.hevy = await syncHevy(db, new HevyClient(hevyKey), { trigger, log });
      if (!isDemoMode()) {
        // Housekeeping after each sync: daily automatic backup, then retention (docs/SECURITY.md → Retention).
        try { const b = await autoBackupIfDue(db, getSettings(db).backupKeep); if (b) log?.info(`automatic backup ${b.name}`); }
        catch (e) { log?.warn(`automatic backup failed: ${describeError(e)}`); }
        try { applyRetention(db); } catch (e) { log?.warn(`retention failed: ${describeError(e)}`); }
      }
      return out;
    } finally { release(); }
  })().finally(() => { g.__syncRunning = undefined; g.__syncStartedAt = undefined; });
  g.__syncRunning = run;
  g.__syncStartedAt = Date.now();
  return run;
}
