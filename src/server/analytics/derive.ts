import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as t from "../db/schema";
import { chooseHrMax, zoneLoad, EDWARDS_VERSION } from "@/lib/metrics/load";
import { civilDayBounds } from "@/lib/time";
import { hrSamples } from "../queries";
import { getSettings } from "../settings";
import { dateRange, shiftDate } from "./series";

/**
 * Recompute derived per-day metrics (layer 3 cache) from stored heart-rate samples:
 *   load_trimp (Edwards), zone1..zone5_min, zone2_min alias, hr_worn_min (minutes covered by samples).
 * HRmax: owner override → Google's model 220 − age (profile age).
 * Days without HR samples get no rows (missing ≠ 0). Days where HRmax is unknown get worn time only.
 */
export function computeDerived(db: DB, dates: string[], timeZone: string): { days: number } {
  const s = getSettings(db);
  const now = Date.now();
  let days = 0;
  for (const date of dates) {
    const [start, end] = civilDayBounds(date, timeZone);
    const samples = hrSamples(db, start, end);
    db.delete(t.derivedDaily).where(sql`${t.derivedDaily.date} = ${date}`).run();
    if (samples.length === 0) continue;
    const hm = chooseHrMax({ override: s.hrMaxOverride, age: s.profileAge });
    const put = (metric: string, value: number, version: string, attrs?: Record<string, unknown>) =>
      db.insert(t.derivedDaily).values({ metric, date, value, version, attrs, computedAt: now })
        .onConflictDoUpdate({ target: [t.derivedDaily.metric, t.derivedDaily.date], set: { value, version, attrs, computedAt: now } }).run();
    // Worn time = sample-covered minutes (gap-capped); uses a nominal HRmax only to run the shared integrator.
    const z = zoneLoad(samples, start, end, hm?.hrMax ?? 200);
    put("hr_worn_min", z.coveredMinutes, EDWARDS_VERSION);
    if (hm) {
      const attrs = { hrMax: Math.round(hm.hrMax), hrMaxSource: hm.source, coverage: z.coverage };
      put("load_trimp", z.trimp, EDWARDS_VERSION, attrs);
      z.zoneMinutes.forEach((m, i) => put(`zone${i + 1}_min`, m, EDWARDS_VERSION, attrs));
    }
    days++;
  }
  return { days };
}

/** Dates to (re)derive after a sync: the last `recentDays` days plus any day with HR samples but no derived row. */
export function datesNeedingDerive(db: DB, today: string, recentDays: number, fbOffsetS: number): string[] {
  const have = new Set((db.all(sql`select distinct date from derived_daily where metric = 'hr_worn_min'`) as { date: string }[]).map((r) => r.date));
  const withHr = (db.all(sql.raw(`select distinct date((t_ms + coalesce(utc_offset_s, ${fbOffsetS}) * 1000) / 1000, 'unixepoch') as date from heart_rate_samples`)) as { date: string }[]).map((r) => r.date);
  const recent = dateRange(shiftDate(today, -recentDays + 1), today);
  return [...new Set([...withHr.filter((d) => !have.has(d)), ...recent])].sort();
}
