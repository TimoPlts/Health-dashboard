/**
 * Seeds ./data/demo.db with FICTIONAL data for UI development, screenshots and E2E tests. Never touches the real DB.
 * The app shows a permanent "DEMO MODE" banner when DEMO_MODE=1. Covers every Google stream Baseline uses, 60 days,
 * so baselines, recovery and ACWR are calibrated, plus the last 2 days with a deliberately poor night.
 *   npm run db:seed-demo
 */
import { rmSync } from "node:fs";
import { openDatabase } from "../src/server/db/client";
import { emptyBatch, type SourceDescriptor, type NormalizedBatch } from "../src/server/providers/google/normalize";
import { writeBatch } from "../src/server/store";
import { civilDayBounds } from "../src/lib/time";
import { setSetting } from "../src/server/settings";
import { computeDerived } from "../src/server/analytics/derive";
import { dateRange } from "../src/server/analytics/series";

const FILE = "./data/demo.db";
for (const f of [FILE, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
const db = openDatabase(FILE);

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const band: SourceDescriptor = { provider: "google", platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED", deviceName: "Demo band (fictional)" };
const rec: SourceDescriptor = { provider: "google", platform: "RECONCILED" };
const rollup: SourceDescriptor = { provider: "google", platform: "ROLLUP" };
const hk: SourceDescriptor = { provider: "google", platform: "HEALTH_KIT", recordingMethod: "UNKNOWN", appPackage: "com.hevyapp.hevy" };
const TZ = "Europe/Brussels", OFF = 3600, AGE = 32, HRMAX = 220 - AGE, DAYS = 60;
setSetting(db, "profileAge", AGE);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const dayStr = (o: number) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const now = Date.now();

for (let o = -(DAYS - 1); o <= 0; o++) {
  const date = dayStr(o);
  const [d0] = civilDayBounds(date, TZ);
  const b: NormalizedBatch = emptyBatch();
  const poor = o === 0; // last night short and restless
  const trainingDay = (o + 60) % 7 === 1 || (o + 60) % 7 === 3 || (o + 60) % 7 === 5;
  const fitness = (o + DAYS) / DAYS; // slow improvement over the period

  // ---- Sleep (ends this morning) ----
  const bed = d0 - (poor ? 10 : 55) * 60_000 + gauss() * 22 * 60_000;
  const wake = d0 + (poor ? 6.1 : 7.05) * 3_600_000 + gauss() * 18 * 60_000;
  const stages: { startMs: number; endMs: number; stage: string; isShortAwakening: boolean }[] = [];
  let t = bed;
  const push = (stage: string, min: number) => { const e = Math.min(wake, t + min * 60_000); if (e > t) stages.push({ startMs: t, endMs: e, stage, isShortAwakening: false }); t = e; };
  push("AWAKE", 6 + rnd() * 10);
  while (t < wake) {
    push("LIGHT", 18 + rnd() * 22); push("DEEP", t - bed < 4 * 3.6e6 ? (poor ? 8 : 16) + rnd() * 22 : 4 + rnd() * 6);
    push("LIGHT", 10 + rnd() * 14); push("REM", t - bed > 3 * 3.6e6 ? 18 + rnd() * 18 : 8 + rnd() * 8);
    if (rnd() < (poor ? 0.8 : 0.4)) push("AWAKE", 1 + rnd() * (poor ? 12 : 4));
  }
  const asleep = stages.filter((s) => s.stage !== "AWAKE").reduce((a, s) => a + (s.endMs - s.startMs) / 60_000, 0);
  const awake = stages.filter((s) => s.stage === "AWAKE").reduce((a, s) => a + (s.endMs - s.startMs) / 60_000, 0);
  b.sleep.push({
    source: rec, id: `demo-sleep-${date}`, startMs: bed, endMs: wake, startOffsetS: OFF, endOffsetS: OFF, sleepType: "STAGES", isMain: true, isNap: false,
    stagesStatus: "SUCCEEDED", updatedAt: wake, stages,
    summary: { minutesAsleep: String(Math.round(asleep)), minutesAwake: String(Math.round(awake)), minutesToFallAsleep: String(Math.round((stages[0]!.endMs - stages[0]!.startMs) / 60_000)), minutesInSleepPeriod: String(Math.round((wake - bed) / 60_000)) },
  });

  // Overnight samples (fictional): HRV every 5 min, SpO2 every minute.
  for (let tt = bed + 10 * 60_000; tt < wake; tt += 5 * 60_000) b.obs.push({ source: band, dataType: "heart-rate-variability", startMs: tt, endMs: tt, variant: "", utcOffsetS: OFF, value: Math.max(15, (poor ? 38 : 52) + gauss() * 9), unit: "ms" });
  for (let tt = bed + 5 * 60_000; tt < wake; tt += 60_000) b.obs.push({ source: band, dataType: "oxygen-saturation", startMs: tt, endMs: tt, variant: "", utcOffsetS: OFF, value: Math.min(100, 95.8 + gauss() * 0.9), unit: "%" });
  if (o === -2) {
    const ns = d0 + 14.5 * 3.6e6, ne = ns + 32 * 60_000;
    b.sleep.push({ source: rec, id: `demo-nap-${date}`, startMs: ns, endMs: ne, startOffsetS: OFF, endOffsetS: OFF, sleepType: "CLASSIC", isMain: false, isNap: true,
      stagesStatus: "SUCCEEDED", updatedAt: ne, stages: [], summary: { minutesAsleep: "27", minutesAwake: "5" } });
  }

  // ---- Nightly vitals ----
  const rhr = Math.round(55 - 2 * fitness + (poor ? 4 : 0) + gauss() * 1.5);
  const hrv = Math.max(20, 52 + 6 * fitness - (poor ? 14 : 0) + gauss() * 6);
  const daily = (metric: string, value: number, unit: string, attrs?: Record<string, unknown>) => b.daily.push({ source: band, metric, date, value, unit, attrs });
  daily("resting_hr", rhr, "bpm");
  daily("hrv_rmssd_daily", Math.round(hrv), "ms");
  daily("hrv_rmssd_deep_sleep", Math.round(hrv * 1.18), "ms");
  daily("hr_non_rem", rhr + 3 + gauss(), "bpm");
  daily("hrv_entropy", 2.2 + gauss() * 0.15, "");
  const spo2 = 95.6 + rnd() * 1.8;
  daily("spo2_avg", spo2, "%", { lower: spo2 - 2.5 - rnd() * 1.5, upper: Math.min(100, spo2 + 1.8) });
  const resp = 14.2 + gauss() * 0.4 + (poor ? 0.8 : 0);
  daily("respiratory_rate", resp, "breaths/min");
  b.obs.push({ source: band, dataType: "respiratory-rate-sleep-summary", startMs: wake - 3_600_000, endMs: wake - 3_600_000, variant: "", utcOffsetS: OFF, value: resp, unit: "breaths/min", attrs: { deep: resp - 0.6, light: resp + 0.2, rem: resp + 0.7 } });
  const skin = 34.1 + gauss() * 0.25 + (poor ? 0.4 : 0);
  daily("skin_temp_nightly", skin, "°C");
  if (o > -(DAYS - 3)) daily("skin_temp_deviation", skin - 34.1, "°C");
  if (o % 7 === 0) daily("vo2max", 46 + 2 * fitness + gauss() * 0.3, "mL/kg/min");
  for (const [z, lo, hi] of [["light", 0.4, 0.6], ["moderate", 0.6, 0.85], ["vigorous", 0.85, 1], ["peak", 1, 1.15]] as const) {
    const rv = (p: number) => Math.round(rhr + p * (HRMAX - rhr));
    daily(`hr_zone_${z}_min`, z === "light" ? Math.round(HRMAX * 0.3) : rv(lo), "bpm"); daily(`hr_zone_${z}_max`, rv(hi), "bpm");
  }

  // ---- All-day heart rate (15 s) + activity per minute-ish (5 min) ----
  const hr = emptyBatch();
  const workoutStart = d0 + (17.5 + gauss() * 0.4) * 3_600_000, workoutEnd = workoutStart + (52 + rnd() * 18) * 60_000;
  let bpm = rhr + 5, steps = 0, active = 0, azm = 0;
  for (let ts = bed; ts < d0 + 86_400_000 && ts < now; ts += 15_000) {
    if (ts > d0 + 12.2 * 3.6e6 && ts < d0 + 12.6 * 3.6e6) continue; // off-wrist gap (charging)
    const sleeping = ts < wake;
    const inW = trainingDay && ts >= workoutStart && ts <= workoutEnd;
    const phase = ((ts - workoutStart) / 1000) % 210;
    const target = sleeping ? rhr + 2 : inW ? (phase < 50 ? 0.82 * HRMAX : 0.64 * HRMAX) : (ts % 3_600_000 < 600_000 ? rhr + 38 : rhr + 16);
    bpm += (target - bpm) * 0.15 + gauss() * 1.2;
    hr.hr.push({ source: band, tMs: ts, utcOffsetS: OFF, bpm: Math.round(bpm), motion: null });
  }
  writeBatch(db, hr, null);
  for (let ts = d0 + 7 * 3.6e6; ts < d0 + 22.5 * 3.6e6 && ts < now; ts += 300_000) {
    const st = Math.max(0, Math.round((ts % 3_600_000 < 600_000 ? 380 : 55) + gauss() * 40));
    steps += st;
    const kcal = st * 0.045 + 1.2;
    active += kcal;
    b.obs.push({ source: rec, dataType: "steps", startMs: ts, endMs: ts + 300_000, variant: "", utcOffsetS: OFF, value: st, unit: "count" });
    b.obs.push({ source: rec, dataType: "distance", startMs: ts, endMs: ts + 300_000, variant: "", utcOffsetS: OFF, value: st * 0.76, unit: "m" });
    b.obs.push({ source: rec, dataType: "active-energy-burned", startMs: ts, endMs: ts + 300_000, variant: "", utcOffsetS: OFF, value: kcal, unit: "kcal" });
    if (ts % 3_600_000 < 600_000 && rnd() < 0.5) { b.obs.push({ source: rec, dataType: "active-zone-minutes", startMs: ts, endMs: ts + 60_000, variant: "FAT_BURN", utcOffsetS: OFF, value: 1, unit: "AZM" }); azm++; }
    if (rnd() < 0.08) b.obs.push({ source: rec, dataType: "floors", startMs: ts, endMs: ts + 300_000, variant: "", utcOffsetS: OFF, value: 1 + Math.round(rnd() * 2), unit: "count" });
  }
  for (let h = 9; h < 20; h += 3) if (d0 + h * 3.6e6 < now) b.obs.push({ source: rec, dataType: "sedentary-period", startMs: d0 + h * 3.6e6, endMs: d0 + (h + 1.2) * 3.6e6, variant: "", utcOffsetS: OFF, value: 72, unit: "min" });
  b.obs.push({ source: rec, dataType: "active-minutes", startMs: d0, endMs: d0 + 86_400_000, variant: "LIGHT", utcOffsetS: OFF, value: 140 + Math.round(gauss() * 20), unit: "min" });
  b.obs.push({ source: rec, dataType: "active-minutes", startMs: d0, endMs: d0 + 86_400_000, variant: "MODERATE", utcOffsetS: OFF, value: Math.max(0, 18 + Math.round(gauss() * 8)), unit: "min" });
  b.daily.push({ source: rollup, metric: "total_kcal", date, value: 1720 + active + gauss() * 40, unit: "kcal" });

  // ---- Workout: Fitbit-detected strength session + Hevy's Apple Health copy (as in the real data) ----
  if (trainingDay && workoutStart < now) {
    for (let ts = workoutStart; ts < workoutEnd; ts += 60_000) {
      if (((ts - workoutStart) / 1000) % 210 < 50) { b.obs.push({ source: rec, dataType: "active-zone-minutes", startMs: ts, endMs: ts + 60_000, variant: "CARDIO", utcOffsetS: OFF, value: 2, unit: "AZM" }); azm += 2; }
    }
    b.exercise.push({ source: { ...band }, id: `demo-ex-fitbit-${date}`, startMs: workoutStart + 6 * 60_000, endMs: workoutEnd - 4 * 60_000, startOffsetS: OFF, exerciseType: "STRENGTH_TRAINING", displayName: "Strength training",
      activeDurationS: (workoutEnd - workoutStart) / 1000 - 600, metrics: { caloriesKcal: 260 + rnd() * 60, averageHeartRateBeatsPerMinute: "131", activeZoneMinutes: "28" } });
    b.exercise.push({ source: hk, id: `demo-ex-hevy-${date}`, startMs: workoutStart, endMs: workoutEnd, startOffsetS: OFF, exerciseType: "STRENGTH_TRAINING", displayName: "Strength Training",
      activeDurationS: (workoutEnd - workoutStart) / 1000, metrics: { caloriesKcal: 240 + rnd() * 40 } });
  }
  if ((o + 60) % 7 === 6 && d0 + 10 * 3.6e6 < now) {
    const s = d0 + 10 * 3.6e6, e = s + 42 * 60_000;
    b.exercise.push({ source: band, id: `demo-ex-walk-${date}`, startMs: s, endMs: e, startOffsetS: OFF, exerciseType: "WALKING", displayName: "Walk",
      activeDurationS: 2520, metrics: { caloriesKcal: 180, steps: "4300", distanceMillimeters: "3300000", averageHeartRateBeatsPerMinute: "104" } });
  }
  if (o === -3) b.exercise.push({ source: { ...band, recordingMethod: "ACTIVELY_MEASURED" }, id: `demo-ex-short-${date}`, startMs: d0 + 15 * 3.6e6, endMs: d0 + 15 * 3.6e6 + 20_000, startOffsetS: OFF, exerciseType: "WALKING", displayName: "Walk", activeDurationS: 20, metrics: null });

  // Weight weekly, height once
  if (o % 7 === 0) b.obs.push({ source: { ...band, recordingMethod: "MANUAL" }, dataType: "weight", startMs: d0 + 7.3 * 3.6e6, endMs: d0 + 7.3 * 3.6e6, variant: "", utcOffsetS: OFF, value: 78.4 - fitness + gauss() * 0.3, unit: "kg" });
  if (o === -(DAYS - 1)) b.obs.push({ source: { ...band, recordingMethod: "MANUAL" }, dataType: "height", startMs: d0, endMs: d0, variant: "", utcOffsetS: OFF, value: 1.8, unit: "m" });
  writeBatch(db, b, null);
}

computeDerived(db, dateRange(dayStr(-(DAYS - 1)), today), TZ);
// One labelled workout (fictional owner label), written for both sessions of the grouped workout.
const lastStrength = db.$client.prepare("select id, start_ms from exercise_sessions where id like 'demo-ex-hevy-%' order by start_ms desc limit 1").get() as { id: string } | undefined;
if (lastStrength) {
  const day = lastStrength.id.replace("demo-ex-hevy-", "");
  for (const id of [lastStrength.id, `demo-ex-fitbit-${day}`]) db.$client.prepare("insert or replace into workout_annotations (session_id, name, category, effort, updated_at) values (?, 'Push day', 'push', 7, ?)").run(id, now);
}
// Google's own daily HR summary, consistent with the samples above.
const rows = db.$client.prepare(`select date((t_ms + 3600000) / 1000, 'unixepoch') as d, min(bpm) mn, avg(bpm) av, max(bpm) mx from heart_rate_samples group by 1`).all() as { d: string; mn: number; av: number; mx: number }[];
const rb = emptyBatch();
for (const r of rows) rb.daily.push({ source: rollup, metric: "hr_day_min", date: r.d, value: r.mn, unit: "bpm" }, { source: rollup, metric: "hr_day_avg", date: r.d, value: r.av, unit: "bpm" }, { source: rollup, metric: "hr_day_max", date: r.d, value: r.mx, unit: "bpm" });
writeBatch(db, rb, null);
db.$client.prepare(`insert into sync_state (provider, stream, synced_through_ms, last_success_at, rows_total) values ('google', 'heart-rate', ?, ?, ?)`).run(now, now, rows.length);
console.log(`Seeded FICTIONAL demo data (${DAYS} days) into ${FILE}. Run with DEMO_MODE=1.`);
