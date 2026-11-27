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
import { listWorkouts, workoutDetail } from "../src/server/analytics/workouts";
import { healthIndex, sleepView, todayView, trainingView, trendSeries } from "../src/server/views";
import { METRICS as ALL } from "../src/server/analytics/registry";
import { cardioView } from "../src/server/analytics/cardio";

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
    const base = d.baseline ? (d.baseline.status === "calibrating" ? `baseline calibrating ${d.baseline.have}/${d.baseline.need}` : `baseline ok (n=${d.baseline.n})`) : "";
    console.log(`  ${m.id.padEnd(24)} ${String(days).padStart(2)}/30 days  ${base.padEnd(28)} ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) { errors++; console.log(`  ${m.id.padEnd(24)} ERROR ${(e as Error).message}`); }
}
const sc = computeScores(db, today, today, fb).get(today)!;
console.log(`\nToday: recovery ${sc.recovery.status}${sc.recovery.status === "calibrating" ? ` (HRV ${sc.recovery.hrv?.have ?? "-"}/14, RHR ${sc.recovery.rhr?.have ?? "-"}/14)` : ""}; readiness ${sc.readiness.status}; ` +
  `sleep score ${sc.sleepScore ? "ok" : "none"}; debt nights ${sc.sleepDebtNights}/7; ACWR tracked ${sc.acwr.trackedDays}/${sc.acwr.requiredDays}; flags ${sc.flags.length}`);
const cons = sleepConsistency(db, today, fb);
console.log(`Sleep consistency: ${cons.status}${cons.status === "calibrating" ? ` ${cons.have}/${cons.need} nights` : ""}`);
const ws = listWorkouts(db, Date.now() - 365 * 86_400_000, Date.now() + 86_400_000, tz);
console.log(`
Workouts: ${ws.length} (from ${ws.reduce((a, w) => a + w.sources.length, 0)} Google sessions)`);
for (const w of ws) {
  const d = workoutDetail(db, w.id, tz)!;
  console.log(`  ${w.date} ${w.type.padEnd(18)} sources: ${w.sources.map((s) => s.label).join(" + ")}${w.tooShort ? "  [too short]" : ""}  HR coverage ${(d.stats.coverage * 100).toFixed(0)}%  history ${d.history.length}  google zones ${d.googleZones ? "yes" : "no"}`);
}
console.log("\nPage read models (real data, timings only):");
for (const [name, fn] of [
  ["today", () => todayView(today)], ["today -1", () => todayView(new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10))],
  ["sleep", () => sleepView(today)], ["health", () => healthIndex(today)],
  ["trends 30d", () => trendSeries(ALL.map((m) => m.id), "30d", today)], ["trends 1y", () => trendSeries(["recovery", "hrv", "steps", "strain"], "1y", today)],
  ["training 90d", () => trainingView("90d")],
  ["cardio", () => cardioView(db, today, fb, tz)],
] as [string, () => unknown][]) {
  const t0 = performance.now();
  try { fn(); console.log(`  ${name.padEnd(14)} ok   ${(performance.now() - t0).toFixed(0)} ms`); }
  catch (e) { errors++; console.log(`  ${name.padEnd(14)} ERROR ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
}
console.log(errors ? `${errors} errors` : "No errors.");
process.exit(errors ? 1 : 0);
