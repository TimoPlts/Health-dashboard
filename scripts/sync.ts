/**
 * CLI sync — same engine as the web app. Suitable for Windows Task Scheduler / cron.
 *   npm run sync
 */
import "./_env";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { syncAll } from "../src/server/sync/run";

const db = openDatabase(env().DATABASE_PATH);
const started = Date.now();
const result = (await syncAll(db, "cli", { info: (m) => console.log(m), warn: (m) => console.warn(m) })) as Record<string, { status: string }>;
const statuses = Object.entries(result).map(([p, r]) => `${p}: ${r.status}`);
console.log(statuses.length ? statuses.join(", ") : "No providers connected.", `(${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(Object.values(result).some((r) => r.status === "failed") ? 1 : 0);
