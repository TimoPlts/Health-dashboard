/**
 * Seeds ./data/demo.db with FICTIONAL data for UI development and screenshots.
 * Never touches the real database. The app shows a permanent "DEMO MODE" banner when DEMO_MODE=1.
 *   npm run db:seed-demo
 */
import { rmSync } from "node:fs";
import { openDatabase } from "../src/server/db/client";
import { emptyBatch, type SourceDescriptor } from "../src/server/providers/google/normalize";
import { upsertHevyTemplate, upsertHevyWorkout, writeBatch } from "../src/server/store";
import type { HevyWorkout } from "../src/server/providers/hevy/client";
import { civilDayBounds } from "../src/lib/time";

const FILE = "./data/demo.db";
for (const f of [FILE, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
const db = openDatabase(FILE);

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const src: SourceDescriptor = { provider: "google", platform: "DEMO_FICTIONAL", deviceName: "Demo band (fictional)" };
const TZ = "Europe/Brussels";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const dayStr = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

for (let d = -27; d <= 0; d++) {
  const date = dayStr(d);
  const [dayStart] = civilDayBounds(date, TZ);
  const b = emptyBatch();

  // Sleep: bed ~23:10, wake ~07:00 local
  const bed = dayStart - 50 * 60_000 + gauss() * 25 * 60_000;
  const wake = dayStart + 7 * 3_600_000 + gauss() * 20 * 60_000;
  const stages: { startMs: number; endMs: number; stage: string; isShortAwakening: boolean }[] = [];
  let t = bed;
  const push = (stage: string, min: number) => { const e = Math.min(wake, t + min * 60_000); if (e > t) stages.push({ startMs: t, endMs: e, stage, isShortAwakening: false }); t = e; };
  push("AWAKE", 8 + rnd() * 10);
  while (t < wake) {
    push("LIGHT", 20 + rnd() * 25); push("DEEP", t - bed < 4 * 3.6e6 ? 15 + rnd() * 30 : 5 + rnd() * 8);
    push("LIGHT", 10 + rnd() * 15); push("REM", t - bed > 3 * 3.6e6 ? 20 + rnd() * 20 : 8 + rnd() * 10);
    if (rnd() < 0.5) push("AWAKE", 1 + rnd() * 5);
  }
  const asleep = stages.filter((s) => s.stage !== "AWAKE").reduce((a, s) => a + (s.endMs - s.startMs) / 60_000, 0);
  const awake = stages.filter((s) => s.stage === "AWAKE").reduce((a, s) => a + (s.endMs - s.startMs) / 60_000, 0);
  b.sleep.push({
    source: src, id: `demo-sleep-${date}`, startMs: bed, endMs: wake, startOffsetS: 3600, endOffsetS: 3600, sleepType: "STAGES", isMain: true, isNap: false,
    stagesStatus: "SUCCEEDED", summary: { minutesAsleep: String(Math.round(asleep)), minutesAwake: String(Math.round(awake)), minutesToFallAsleep: String(Math.round((stages[0]!.endMs - stages[0]!.startMs) / 60_000)) },
    updatedAt: wake, stages,
  });

  const rhr = 52 + gauss() * 2;
  b.daily.push(
    { source: src, metric: "resting_hr", date, value: Math.round(rhr), unit: "bpm" },
    { source: src, metric: "hrv_rmssd_daily", date, value: Math.round(58 + gauss() * 7), unit: "ms" },
    { source: src, metric: "spo2_avg", date, value: 96 + rnd() * 2, unit: "%" },
    { source: src, metric: "respiratory_rate", date, value: 14 + gauss() * 0.6, unit: "breaths/min" },
    { source: src, metric: "skin_temp_deviation", date, value: gauss() * 0.3, unit: "°C" },
    ...["light:113:132", "moderate:132:151", "vigorous:151:170", "peak:170:220"].flatMap((z) => {
      const [name, lo, hi] = z.split(":");
      return [{ source: src, metric: `hr_zone_${name}_min`, date, value: Number(lo), unit: "bpm" }, { source: src, metric: `hr_zone_${name}_max`, date, value: Number(hi), unit: "bpm" }];
    }),
  );

  // Hourly activity 07–22 (today only up to now)
  for (let h = 7; h < 23; h++) {
    const s = dayStart + h * 3_600_000;
    if (s > Date.now()) break;
    const steps = Math.max(0, Math.round(500 + gauss() * 350 + (h === 8 || h === 18 ? 1500 : 0)));
    b.obs.push({ source: src, dataType: "steps", startMs: s, endMs: s + 3_600_000, variant: "", utcOffsetS: 3600, value: steps, unit: "count" });
    b.obs.push({ source: src, dataType: "distance", startMs: s, endMs: s + 3_600_000, variant: "", utcOffsetS: 3600, value: steps * 0.74, unit: "m" });
    b.obs.push({ source: src, dataType: "active-energy-burned", startMs: s, endMs: s + 3_600_000, variant: "", utcOffsetS: 3600, value: steps * 0.045, unit: "kcal" });
  }
  for (let h = 0; h < 24; h++) {
    const s = dayStart + h * 3_600_000;
    if (s > Date.now()) break;
    b.obs.push({ source: src, dataType: "basal-energy-burned", startMs: s, endMs: s + 3_600_000, variant: "", utcOffsetS: 3600, value: 73, unit: "kcal" });
  }
  writeBatch(db, b, null);

  // Strength workout every other day at ~18:00 with 5 s heart-rate samples
  if (Math.abs(d) % 2 === 0) {
    const start = dayStart + 17 * 3_600_000 + Math.round(gauss() * 15) * 60_000;
    const dur = (55 + rnd() * 20) * 60_000;
    const end = start + dur;
    const hrB = emptyBatch();
    let hr = 85;
    for (let ts = start - 5 * 60_000; ts < end + 10 * 60_000; ts += 5000) {
      if (ts > start + 20 * 60_000 && ts < start + 23 * 60_000) continue; // deliberate gap: band off-wrist
      const inWorkout = ts >= start && ts <= end;
      const phase = ((ts - start) / 1000) % 180; // 3-min set/rest cycle
      const target = inWorkout ? (phase < 45 ? 150 : 112) : ts > end ? 95 - Math.min(20, (ts - end) / 30_000) : 82;
      hr += (target - hr) * 0.12 + gauss() * 1.5;
      hrB.hr.push({ source: src, tMs: ts, utcOffsetS: 3600, bpm: Math.round(hr), motion: "ACTIVE" });
    }
    writeBatch(db, hrB, null);
    const push = d % 4 === 0;
    const w: HevyWorkout = {
      id: `demo-${date}`, title: push ? "Push Day" : "Pull Day", routine_id: push ? "demo-push" : "demo-pull", description: null,
      start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), created_at: new Date(end).toISOString(), updated_at: new Date(end).toISOString(),
      exercises: (push
        ? [["Bench Press (Barbell)", "demo-bench", 80], ["Overhead Press (Dumbbell)", "demo-ohp", 24], ["Triceps Pushdown", "demo-tri", 30]]
        : [["Deadlift (Barbell)", "demo-dl", 140], ["Lat Pulldown (Cable)", "demo-lat", 65], ["Bicep Curl (Dumbbell)", "demo-curl", 14]]
      ).map(([title, tpl, base], i) => ({
        index: i, title: title as string, notes: null, exercise_template_id: tpl as string, superset_id: null,
        sets: [
          { index: 0, type: "warmup", weight_kg: Math.round((base as number) * 0.5), reps: 10, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
          ...[1, 2, 3].map((k) => ({ index: k, type: "normal", weight_kg: (base as number) + Math.round((27 + d) / 7) * 2.5, reps: 8 - (k === 3 ? 1 : 0), distance_meters: null, duration_seconds: null, rpe: 7 + k * 0.5, custom_metric: null })),
        ],
      })),
    };
    upsertHevyWorkout(db, w, null);
  }
}

for (const [id, title, primary, secondary] of [
  ["demo-bench", "Bench Press (Barbell)", "chest", ["triceps", "shoulders"]], ["demo-ohp", "Overhead Press (Dumbbell)", "shoulders", ["triceps"]],
  ["demo-tri", "Triceps Pushdown", "triceps", []], ["demo-dl", "Deadlift (Barbell)", "lower_back", ["glutes", "hamstrings"]],
  ["demo-lat", "Lat Pulldown (Cable)", "lats", ["biceps"]], ["demo-curl", "Bicep Curl (Dumbbell)", "biceps", []],
] as const) {
  upsertHevyTemplate(db, { id, title, type: "weight_reps", primary_muscle_group: primary, secondary_muscle_groups: [...secondary], equipment: "barbell", is_custom: false });
}
console.log(`Seeded FICTIONAL demo data into ${FILE}. Run with DEMO_MODE=1.`);
