import type { DB } from "../db/client";
import { daysBetween, periodOf } from "@/lib/metrics/periods";
import { evaluateAtLeast, evaluateBedtime, evaluateWake, type GoalStatus } from "@/lib/metrics/goals";
import { dayStatus, plannedFor, type DayStatus, type PlanDay } from "@/lib/metrics/training-plan";
import { isCardio, type WorkoutCategory } from "@/lib/metrics/workout-labels";
import { getSettings } from "../settings";
import { entriesBetween, listHabits } from "../journal";
import { METRIC_BY_ID } from "./registry";
import { metricSeries } from "./values";
import { computeScores, nightValue } from "./scores";
import { nightSeries } from "./series";
import { countedWorkouts, toDone } from "./planner";
import { weightData } from "../weight";

export interface CalendarDay {
  date: string; future: boolean; today: boolean;
  recovery: number | null; recoveryStatus: "ok" | "calibrating" | "missing";
  readiness: "ready" | "caution" | "recover" | null;
  sleepScore: number | null; asleepMin: number | null;
  strain: number | null; steps: number | null; activeMin: number | null;
  /** The day's weigh-in (weight-trend@2) and how many weigh-ins the day has; null = not weighed. */
  weightKg: number | null; weighIns: number;
  /** Edwards zone minutes (Z1–Z5) of all-day heart rate; null = no heart rate that day. */
  hrMin: number | null;
  workouts: { id: string; title: string; category: WorkoutCategory | null; cardio: boolean; durationMin: number }[];
  /** No counted workout on a complete day that has heart-rate data (a tracked day without training). */
  restDay: boolean;
  planned: PlanDay | null; planStatus: DayStatus | null;
  goals: { met: number; evaluated: number };
  journal: { logged: number; habits: number };
}

/**
 * One month of day summaries for the calendar (calendar@1). Every field is null when there is no data for that day
 * (never 0); a real zero (e.g. 0 steps recorded) stays 0. Future days carry no values.
 */
export function calendarView(db: DB, month: string, today: string, fb: number, tz: string) {
  const p = periodOf("month", `${month}-01`);
  const to = p.to < today ? p.to : today;
  const days = p.from <= today ? daysBetween(p.from, to) : [];
  const settings = getSettings(db);
  const scores = days.length ? computeScores(db, p.from, to, fb) : new Map();
  const ser = (id: string) => (days.length ? metricSeries(db, METRIC_BY_ID.get(id)!, p.from, to, fb) : new Map<string, number>());
  const steps = ser("steps"), active = ser("active_min"), worn = ser("worn");
  const { nights } = days.length ? nightSeries(db, p.from, to, fb) : { nights: new Map() };
  const workouts = days.length ? countedWorkouts(db, p.from, to, tz) : [];
  const done = workouts.map(toDone);
  const habits = listHabits(db);
  const entries = days.length ? entriesBetween(db, p.from, to) : new Map<string, Map<string, number>>();
  const g = settings.goals;
  const weights = new Map(weightData(db, fb).daily.map((d) => [d.date, d]));

  const out: CalendarDay[] = p.days.map((date) => {
    const future = date > today;
    const sc = future ? null : scores.get(date) ?? null;
    const rec = sc?.recovery;
    const ws = workouts.filter((w) => w.date === date);
    const n = nights.get(date);
    const goalStatuses: GoalStatus[] = [];
    if (!future) {
      const complete = date < today;
      if (g.stepsDaily !== null) goalStatuses.push(evaluateAtLeast(steps.get(date) ?? null, g.stepsDaily, complete));
      if (g.activeMinDaily !== null) goalStatuses.push(evaluateAtLeast(active.get(date) ?? null, g.activeMinDaily, complete));
      if (g.sleepMin !== null) goalStatuses.push(evaluateAtLeast(n?.minutesAsleep ?? null, g.sleepMin, complete));
      if (g.bedtimeMin !== null) goalStatuses.push(evaluateBedtime(nightValue(n, "bedtime"), g.bedtimeMin));
      if (g.wakeMin !== null) goalStatuses.push(evaluateWake(nightValue(n, "wake"), g.wakeMin));
    }
    const evaluated = goalStatuses.filter((s) => s === "met" || s === "missed");
    return {
      date, future, today: date === today,
      recovery: rec?.status === "ok" ? rec.score : null, recoveryStatus: rec ? rec.status : "missing",
      readiness: sc?.readiness.status === "ok" ? sc.readiness.level : null,
      sleepScore: sc?.sleepScore?.score ?? null, asleepMin: n?.minutesAsleep ?? null,
      strain: sc?.strain ?? null, steps: steps.get(date) ?? null, activeMin: active.get(date) ?? null,
      weightKg: future ? null : weights.get(date)?.weightKg ?? null, weighIns: future ? 0 : weights.get(date)?.count ?? 0,
      hrMin: worn.has(date) ? worn.get(date)! * 60 : null,
      workouts: ws.map((w) => ({ id: w.id, title: w.title, category: w.label?.category ?? null, cardio: isCardio(w.type, w.label?.category), durationMin: w.durationMin })),
      restDay: !future && date < today && ws.length === 0 && worn.has(date),
      planned: settings.trainingPlan ? plannedFor(settings.trainingPlan, date) : null,
      planStatus: settings.trainingPlan && !future ? dayStatus(settings.trainingPlan, date, today, done) : null,
      goals: { met: evaluated.filter((s) => s === "met").length, evaluated: evaluated.length },
      journal: { logged: habits.filter((h) => entries.get(h.id)?.has(date)).length, habits: habits.length },
    };
  });
  return { month, from: p.from, to: p.to, days: out };
}
