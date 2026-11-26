import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DB } from "../db/client";
import { runtimePaths } from "../runtime-home";

/**
 * Complete deletion of personal data (the app keeps working, empty, so you can still sign in):
 *  - every row in every Baseline table: measurements, sleep, workouts, raw API responses, provider connections
 *    (tokens), settings, sync history — with SQLite `secure_delete` so freed pages are overwritten, then VACUUM and a
 *    WAL checkpoint so no copy remains in the database files;
 *  - all files in backups/, exports/, probe-output/ and logs/ under BASELINE_HOME.
 * NOT deleted: config.env (app password, secrets) — needed to sign in. Revoking Google access is done by the caller
 * before this runs (it needs the stored token). Full removal of the install: docs/SECURITY.md.
 */
export function deleteAllData(db: DB, home = runtimePaths().home) {
  const c = db.$client;
  const tables = (c.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations'").all() as { name: string }[]).map((r) => r.name);
  const counts: Record<string, number> = {};
  c.pragma("secure_delete = ON");
  c.pragma("foreign_keys = OFF");
  try {
    c.transaction(() => { for (const t of tables) counts[t] = c.prepare(`delete from "${t}"`).run().changes; })();
  } finally { c.pragma("foreign_keys = ON"); }
  c.exec("VACUUM");
  c.pragma("wal_checkpoint(TRUNCATE)");
  const files: Record<string, number> = {};
  for (const sub of ["backups", "exports", "probe-output", "logs"]) {
    const dir = path.join(home, sub);
    if (!existsSync(dir)) continue;
    let n = 0;
    for (const name of readdirSync(dir)) {
      try { rmSync(path.join(dir, name), { recursive: true, force: true }); n++; } catch { /* a log file in use is removed by retention later */ }
    }
    files[sub] = n;
  }
  return { rows: Object.values(counts).reduce((a, b) => a + b, 0), tables: tables.length, files };
}
