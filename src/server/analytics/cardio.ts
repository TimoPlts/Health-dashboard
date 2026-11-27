import type { DB } from "../db/client";
import { getSettings } from "../settings";
import { civilDayBounds } from "@/lib/time";
import { addDays, aggregateDays, daysBetween, weekStart } from "@/lib/metrics/periods";
import { chooseHrMax, PCT_HRMAX_ZONES } from "@/lib/metrics/load";
import { METRIC_BY_ID } from "./registry";
import { metricSeries } from "./values";
import { computeScores } from "./scores";
import { listWorkouts } from "./workouts";

/** WHO 2020 guideline: 150–300 min/week of moderate activity. Shown as a reference, never as your goal. */
export const WHO_WEEKLY_MODERATE_MIN = 150;

export interface CardioWeek {
  start: string; end: string; partial: boolean; daysElapsed: number; hrDays: number;
  zoneMin: number[]; zone2Min: number | null; azm: number | null; azmByZone: { fatBurn: number | null; cardio: number | null; peak: number | null };
  load: number | null; restingHr: number | null;
  /** null when the week has no heart rate and no workouts at all (not tracked ≠ zero sessions). */
  sessions: number | null; sessionMin: number | null;
}

/**
 * Weekly cardio picture (ISO weeks, Monday–Sunday) for the 12 weeks up to `weekOf`.
 * Totals are sums of the days that have data; the current week is partial ("so far"). Comparisons use complete
 * weeks only. Cardio sessions = non-excluded workouts that are cardio by label or by exercise type.
 */
export function cardioView(db: DB, today: string, fbOffsetS: number, tz: string, weekOf?: string) {
  const s = getSettings(db);
  const selected = weekStart(weekOf && weekOf <= today ? weekOf : today);
  const starts = Array.from({ length: 12 }, (_, i) => addDays(selected, -7 * (11 - i)));
  const from = starts[0]!, to = addDays(selected, 6) < today ? addDays(selected, 6) : today;
  const ser = (id: string) => metricSeries(db, METRIC_BY_ID.get(id)!, from, to, fbOffsetS);
  const zones = [1, 2, 3, 4, 5].map((z) => ser(`zone${z}`));
  const azm = ser("azm"), fat = ser("azm_fat_burn"), card = ser("azm_cardio"), peak = ser("azm_peak");
  const load = ser("strain"), rhr = ser("resting_hr");
  const [fromMs] = civilDayBounds(from, tz), [, toMs] = civilDayBounds(to, tz);
  const workouts = listWorkouts(db, fromMs, toMs, tz).filter((w) => !w.excluded && !w.tooShort && w.cardio);

  const weeks: CardioWeek[] = starts.map((start) => {
    const end = addDays(start, 6);
    const days = daysBetween(start, end).filter((d) => d <= today);
    const sum = (m: Map<string, number>) => aggregateDays(m, days).sum;
    const ws = workouts.filter((w) => w.date >= start && w.date <= end);
    const tracked = aggregateDays(zones[1]!, days).daysWithData > 0 || ws.length > 0;
    return {
      start, end, partial: end >= today, daysElapsed: days.filter((d) => d < today).length, hrDays: aggregateDays(zones[1]!, days).daysWithData,
      zoneMin: zones.map((z) => sum(z) ?? 0), zone2Min: sum(zones[1]!), azm: sum(azm),
      azmByZone: { fatBurn: sum(fat), cardio: sum(card), peak: sum(peak) },
      load: sum(load), restingHr: aggregateDays(rhr, days).mean,
      sessions: tracked ? ws.length : null, sessionMin: tracked ? ws.reduce((a, w) => a + w.durationMin, 0) : null,
    };
  });
  const current = weeks[weeks.length - 1]!;
  const complete = weeks.filter((w) => !w.partial);
  const prev = complete[complete.length - 1] ?? null;
  const prior4 = complete.slice(-4);
  const meanOf = (f: (w: CardioWeek) => number | null) => {
    const v = prior4.map(f).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const hm = chooseHrMax({ override: s.hrMaxOverride, age: s.profileAge });
  const scores = computeScores(db, today, today, fbOffsetS).get(today)!;
  return {
    selected, today, weeks, current, previous: prev,
    fourWeek: prior4.length ? {
      n: prior4.length, zone2Min: meanOf((w) => w.zone2Min), azm: meanOf((w) => w.azm), load: meanOf((w) => w.load),
      restingHr: meanOf((w) => w.restingHr), sessions: meanOf((w) => w.sessions), sessionMin: meanOf((w) => w.sessionMin),
    } : null,
    sessions: workouts.filter((w) => w.date >= current.start && w.date <= current.end),
    targets: { azmWeekly: s.goals.azmWeekly, zone2WeeklyMin: s.goals.zone2WeeklyMin, cardioSessionsWeekly: s.goals.cardioSessionsWeekly },
    zoneBpm: hm ? PCT_HRMAX_ZONES.map((p, i) => [Math.round(p * hm.hrMax), i < 4 ? Math.round(PCT_HRMAX_ZONES[i + 1]! * hm.hrMax) - 1 : null] as [number, number | null]) : null,
    hrMax: hm, acwr: scores.acwr,
  };
}
