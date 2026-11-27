/**
 * CLI sync — same engine as the web app. Suitable for Windows Task Scheduler / cron.
 *   npm run sync                 # incremental (first run: BACKFILL_DAYS of history, default 365)
 *   npm run sync -- --days 2     # small verification import; a later larger --days extends history backwards
 */
import "./_env";
const daysArg = process.argv.indexOf("--days");
if (daysArg > -1) process.env.BACKFILL_DAYS = process.argv[daysArg + 1];
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { syncAll } from "../src/server/sync/run";

const db = openDatabase(env().DATABASE_PATH);
const started = Date.now();
const raw = (await syncAll(db, "cli", { info: (m) => console.log(m), warn: (m) => console.warn(m) })) as Record<string, unknown>;
if (raw.skipped) { console.log("Skipped: another sync is running."); process.exit(0); }
const result = raw as Record<string, { status: string }>;
const statuses = Object.entries(result).map(([p, r]) => `${p}: ${r.status}`);
console.log(statuses.length ? statuses.join(", ") : "No providers connected.", `(${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(Object.values(result).some((r) => r.status === "failed") ? 1 : 0);
