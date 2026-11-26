import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { DB } from "../db/client";
import { runtimePaths } from "../runtime-home";
import { getSettings } from "../settings";
import { pruneAutoBackups } from "./backup";

/**
 * Retention (applied after each sync). What is kept is chosen so that NO health measurement is lost by default:
 *  - Normalized health data (samples, sleep, workouts, daily values): kept until you delete it.
 *  - Raw API responses (raw_pages): only a cache for re-processing; `rawRetentionDays` (default 90, 0 = forever).
 *    Provenance links from measurements to deleted pages are cleared.
 *  - Sync history (sync_runs): 90 days.
 *  - Automatic backups: newest `backupKeep` (default 14). Manual / pre-restore backups are kept until you delete them.
 *  - Exports: deleted after 7 days. They are complete copies of your data and should not linger.
 *  - Server logs: 14 days (supervisor).
 */
export const EXPORT_RETENTION_DAYS = 7;
export const SYNC_RUNS_RETENTION_DAYS = 90;
const DAY = 86_400_000;
const PROVENANCE_TABLES = ["heart_rate_samples", "observations", "daily_metrics", "sleep_sessions", "exercise_sessions"];

export function applyRetention(db: DB, now = Date.now(), home = runtimePaths().home) {
  const s = getSettings(db);
  const out = { rawPages: 0, syncRuns: 0, backups: 0, exports: 0 };
  const c = db.$client;
  if (s.rawRetentionDays > 0) {
    const cutoff = now - s.rawRetentionDays * DAY;
    c.transaction(() => {
      for (const t of PROVENANCE_TABLES) {
        const cols = (c.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((x) => x.name);
        if (cols.includes("raw_page_id")) c.prepare(`update ${t} set raw_page_id = null where raw_page_id in (select id from raw_pages where fetched_at < ?)`).run(cutoff);
      }
      out.rawPages = c.prepare("delete from raw_pages where fetched_at < ?").run(cutoff).changes;
    })();
  }
  out.syncRuns = c.prepare("delete from sync_runs where started_at < ? and status != 'running'").run(now - SYNC_RUNS_RETENTION_DAYS * DAY).changes;
  if (existsSync(path.join(home, "backups"))) out.backups = pruneAutoBackups(s.backupKeep, path.join(home, "backups"));
  const exports = path.join(home, "exports");
  if (existsSync(exports)) {
    for (const name of readdirSync(exports)) {
      const p = path.join(exports, name);
      if (now - statSync(p).mtimeMs > EXPORT_RETENTION_DAYS * DAY) { rmSync(p, { recursive: true, force: true }); out.exports++; }
    }
  }
  return out;
}
