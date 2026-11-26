/**
 * Runs every registered metric and Baseline score over real data and reports COVERAGE AND STATUS ONLY (no values):
 * days with data per metric, calibration state of baselines/scores, timing. Use after changing analytics code.
 *   npm run check:analytics            # last 30 days
 */
import "./_env";
import { env } from "../src/server/env";
import { openDatabase } from "../src/server/db/client";
import { METRICS } from "../src/server/analytics/registry";
import { metricDetail } from "../src/server/analytics/values";
import { computeScores, sleepConsistency } from "../src/server/analytics/scores";
import { offsetMs } from "../src/lib/time";

const db = openDatabase(env().DATABASE_PATH);
const tz = env().HOME_TIME_ZONE;
const fb = Math.round(offsetMs(Date.now(), tz) / 1000);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
let errors = 0;
for (const m of METRICS) {
  const t0 = performance.now();
  try {
    const d = metricDetail(db, m.id, "30d", today, fb)!;
    const days = d.points.filter((p) => p.value !== null).length;
    const base = d.baseline ? ("calibrating" in d.baseline ? `baseline calibrating ${d.baseline.have}/${d.baseline.need}` : `baseline ok (n=${d.baseline.n})`) : "";
    console.log(`  ${m.id.padEnd(24)} ${String(days).padStart(2)}/30 days  ${base.padEnd(28)} ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) { errors++; console.log(`  ${m.id.padEnd(24)} ERROR ${(e as Error).message}`); }
}
const sc = computeScores(db, today, today, fb).get(today)!;
console.log(`\nToday: recovery ${sc.recovery.status}${sc.recovery.status === "calibrating" ? ` (HRV ${sc.recovery.hrv?.have ?? "-"}/14, RHR ${sc.recovery.rhr?.have ?? "-"}/14)` : ""}; readiness ${sc.readiness.status}; ` +
  `sleep score ${sc.sleepScore ? "ok" : "none"}; debt nights ${sc.sleepDebtNights}/7; ACWR tracked ${sc.acwr.trackedDays}/${sc.acwr.requiredDays}; flags ${sc.flags.length}`);
const cons = sleepConsistency(db, today, fb);
console.log(`Sleep consistency: ${cons.status}${cons.status === "calibrating" ? ` ${cons.have}/${cons.need} nights` : ""}`);
console.log(errors ? `${errors} errors` : "No errors.");
process.exit(errors ? 1 : 0);
