import type { DB } from "../db/client";
import { civilDayBounds } from "@/lib/time";
import { addDays, daysBetween, weekStart } from "@/lib/metrics/periods";
import { adherence, consistentWeeks, dayStatus, plannedFor, weeklyAdherence, type DoneWorkout, type TrainingPlan } from "@/lib/metrics/training-plan";
import { CATEGORY_LABEL, type WorkoutCategory } from "@/lib/metrics/workout-labels";
import { getSettings } from "../settings";
import { listWorkouts, typeLabel, workoutHr, type WorkoutSummary } from "./workouts";

/** Workouts that count for planning and history: not excluded by the owner and at least 60 s long. */
export function countedWorkouts(db: DB, from: string, to: string, tz: string): WorkoutSummary[] {
  const [fromMs] = civilDayBounds(from, tz), [, toMs] = civilDayBounds(to, tz);
  return listWorkouts(db, fromMs, toMs, tz).filter((w) => !w.excluded && !w.tooShort && w.date >= from && w.date <= to);
}

export const toDone = (w: WorkoutSummary): DoneWorkout => ({ id: w.id, date: w.date, category: w.label?.category ?? null, cardio: w.cardio });

const mean = (v: (number | null)[]) => { const x = v.filter((n): n is number => n !== null && Number.isFinite(n)); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };

/**
 * Planner read model: this week and next week day by day, 12 weeks of adherence, and comparisons between similar
 * workouts (same owner category; unlabelled workouts grouped by Google exercise type). Descriptive only.
 */
export function planView(db: DB, today: string, tz: string) {
  const plan: TrainingPlan | null = getSettings(db).trainingPlan;
  const wk = weekStart(today);
  const from = addDays(wk, -7 * 11);
  const workouts = countedWorkouts(db, addDays(today, -179), today, tz);
  const done = workouts.map(toDone);
  const days = daysBetween(wk, addDays(wk, 13)).map((date) => ({
    date, planned: plannedFor(plan, date), overridden: Boolean(plan?.overrides[date]),
    status: date > today ? ("upcoming" as const) : dayStatus(plan, date, today, done),
    workouts: workouts.filter((w) => w.date === date).map((w) => ({ id: w.id, title: w.title, category: w.label?.category ?? null })),
  }));
  const weeks = weeklyAdherence(plan, today, done, 12);
  const all = adherence(weeks.flatMap((w) => w.statuses));

  // Similar-workout comparison.
  const groups = new Map<string, { key: string; label: string; items: WorkoutSummary[] }>();
  for (const w of workouts) {
    const cat: WorkoutCategory | null = w.label?.category ?? null;
    const key = cat ? `cat:${cat}` : `type:${w.type}`;
    const label = cat ? CATEGORY_LABEL[cat] : `${typeLabel(w.type)} (unlabelled)`;
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key)!.items.push(w);
  }
  const similar = [...groups.values()].sort((a, b) => b.items.length - a.items.length).map((g) => {
    const recent = g.items.slice(0, 6).map((w) => { const h = workoutHr(db, w); return { id: w.id, date: w.date, title: w.title, durationMin: w.durationMin, avgHr: h.stats.avgBpm, trimp: h.load?.trimp ?? null, effort: w.label?.effort ?? null }; });
    return {
      key: g.key, label: g.label, count: g.items.length, lastDate: g.items[0]!.date, recent,
      average: { durationMin: mean(recent.map((r) => r.durationMin)), avgHr: mean(recent.map((r) => r.avgHr)), trimp: mean(recent.map((r) => r.trimp)), effort: mean(recent.map((r) => r.effort)) },
    };
  });
  return { plan, today, weekStart: wk, days, weeks, overall: all, consistentWeeks: consistentWeeks(weeks), similar, historyFrom: from };
}
