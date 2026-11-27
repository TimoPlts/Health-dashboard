import { db } from "../db/client";
import { isDemoMode } from "../env";
import { getSettings } from "../settings";
import { syncAll } from "./run";

/**
 * Automatic periodic sync while the Baseline server runs (started from src/instrumentation.ts).
 * - Interval from Settings (`autoSyncMinutes`, default 30, 0 = off); first run 1 min after start.
 * - Overlap protection: syncAll() joins a running sync in-process and the lock file blocks other processes.
 * - Retry: after a failed/partial run the next attempt is brought forward with backoff (2, 4, 8 … ≤ interval min).
 * - Auth errors (reconnect needed) stop retries until the next regular interval; the UI shows the error.
 */
const g = globalThis as unknown as { __scheduler?: { timer: NodeJS.Timeout | null; nextRunAt: number | null; failures: number; lastResult: string | null } };

export function schedulerState() {
  return g.__scheduler ? { nextRunAt: g.__scheduler.nextRunAt, failures: g.__scheduler.failures, lastResult: g.__scheduler.lastResult } : { nextRunAt: null, failures: 0, lastResult: null };
}

function schedule(ms: number) {
  const s = g.__scheduler!;
  if (s.timer) clearTimeout(s.timer);
  s.nextRunAt = Date.now() + ms;
  s.timer = setTimeout(tick, ms);
  s.timer.unref?.();
}

async function tick() {
  const s = g.__scheduler!;
  const minutes = getSettings(db()).autoSyncMinutes;
  if (!minutes) { s.nextRunAt = null; s.timer = setTimeout(tick, 5 * 60_000); s.timer.unref?.(); return; } // re-check setting later
  s.nextRunAt = null;
  let status = "success", authError = false;
  const t0 = Date.now();
  // Server log (BASELINE_HOME/logs via the supervisor): warnings + one summary line. Counts and statuses only.
  const log = { info: () => {}, warn: (m: string) => console.warn(`[sync] ${m}`) };
  try {
    const out = (await syncAll(db(), "scheduled", log)) as Record<string, { status?: string; results?: { error?: string }[]; skipped?: boolean }>;
    const statuses = Object.values(out).map((r) => r?.status).filter(Boolean) as string[];
    status = statuses.includes("failed") ? "failed" : statuses.includes("partial") ? "partial" : "success";
    authError = Object.values(out).some((r) => r?.results?.some((x) => /OAuth|HTTP 401|HTTP 403/.test(x.error ?? "")));
  } catch (e) { status = "failed"; console.warn(`[sync] scheduled sync threw: ${(e as Error).message?.slice(0, 200)}`); }
  s.lastResult = status;
  console.log(`[sync] scheduled sync ${status} in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (status === "success" || authError) { s.failures = 0; schedule(minutes * 60_000); }
  else { s.failures++; schedule(Math.min(minutes, 2 ** s.failures) * 60_000); }
}

export function startScheduler() {
  if (g.__scheduler || isDemoMode() || process.env.BASELINE_DISABLE_SCHEDULER === "1") return;
  g.__scheduler = { timer: null, nextRunAt: null, failures: 0, lastResult: null };
  schedule(60_000);
}

/** Re-plan after the interval setting changed. */
export function rescheduleFromSettings() {
  if (!g.__scheduler) return;
  const minutes = getSettings(db()).autoSyncMinutes;
  if (minutes) schedule(minutes * 60_000); else { if (g.__scheduler.timer) clearTimeout(g.__scheduler.timer); g.__scheduler.nextRunAt = null; g.__scheduler.timer = setTimeout(tick, 5 * 60_000); }
}
