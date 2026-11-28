/**
 * Lightweight training planner (training-plan@1). Pure; documented in docs/CALCULATIONS.md § PLAN.
 *
 * A plan is a weekly split (Monday … Sunday) of training days, rest days and unplanned ("free") days, each with an
 * optional name and category, plus per-date overrides. It is evaluated against the workouts Baseline already has
 * (Google exercise sessions, grouped, with the owner's labels). Excluded and too-short workouts never count.
 *
 * Day status:
 *   done        — training planned and a matching workout was recorded (see matchesPlan)
 *   different   — training planned, a workout was recorded but its labelled category differs from the plan
 *   missed      — training planned, the day is complete, no workout
 *   rest        — rest planned and no workout
 *   restTrained — rest planned but a workout was recorded (counted separately, never as a failure)
 *   extra       — free day with a workout
 *   free        — free day without a workout
 *   upcoming    — today (not yet complete, nothing recorded) or later
 *   before      — before the plan existed (not evaluated)
 * Adherence = (done + different) ÷ (done + different + missed): only planned training days that are complete or
 * already done count. No recommendation is ever derived from it.
 */
import { CATEGORY_LABEL, isCategory, type WorkoutCategory } from "./workout-labels";
import { addDays, daysBetween, weekStart } from "./periods";

export const TRAINING_PLAN_VERSION = "training-plan@1";

export type PlanKind = "train" | "rest" | "free";
export interface PlanDay { kind: PlanKind; name: string | null; category: WorkoutCategory | null }
export interface TrainingPlan {
  /** Index 0 = Monday … 6 = Sunday. */
  split: PlanDay[];
  /** First civil date the plan applies to; earlier days are not evaluated. */
  since: string;
  overrides: Record<string, PlanDay>;
  /** Earlier splits, so changing the plan never rewrites past weeks: a day ≤ `until` uses the first matching split. */
  previous: { until: string; split: PlanDay[] }[];
}

export type DayStatus = "done" | "different" | "missed" | "rest" | "restTrained" | "extra" | "free" | "upcoming" | "before";

export const FREE_DAY: PlanDay = { kind: "free", name: null, category: null };

export const weekdayIndex = (date: string) => (new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay() + 6) % 7;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function emptyPlan(since: string): TrainingPlan {
  return { split: Array.from({ length: 7 }, () => ({ ...FREE_DAY })), since, overrides: {}, previous: [] };
}

/**
 * Replace the weekly split from `today` on. The old split is kept for the days before today (if the plan already
 * applied then), so past adherence is unchanged. Overrides for today and later are kept.
 */
export function withSplit(plan: TrainingPlan | null, split: PlanDay[], today: string): TrainingPlan {
  if (!plan) return { ...emptyPlan(today), split };
  const yesterday = addDays(today, -1);
  // A second change on the same day must not archive a split that never applied to a past day.
  const archived = plan.since > yesterday || plan.previous.some((p) => p.until >= yesterday);
  const previous = archived ? plan.previous : [...plan.previous, { until: yesterday, split: plan.split }];
  return { ...plan, split, previous: [...previous].sort((a, b) => a.until.localeCompare(b.until)) };
}

/** Validate untrusted plan JSON (settings may come from an older version); invalid parts fall back safely. */
export function normalisePlan(v: unknown): TrainingPlan | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.since !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.since) || !Array.isArray(o.split)) return null;
  const day = (x: unknown): PlanDay => {
    const d = (x ?? {}) as Record<string, unknown>;
    const kind: PlanKind = d.kind === "train" || d.kind === "rest" ? d.kind : "free";
    const name = typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, 40) : null;
    return { kind, name: kind === "free" ? null : name, category: kind === "train" && isCategory(d.category) ? d.category : null };
  };
  const split = Array.from({ length: 7 }, (_, i) => day(o.split instanceof Array ? o.split[i] : null));
  const overrides: Record<string, PlanDay> = {};
  if (o.overrides && typeof o.overrides === "object") {
    for (const [k, x] of Object.entries(o.overrides as Record<string, unknown>)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) overrides[k] = day(x);
  }
  const previous = Array.isArray(o.previous)
    ? (o.previous as unknown[]).flatMap((p) => {
        const q = (p ?? {}) as Record<string, unknown>;
        return typeof q.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.until) && Array.isArray(q.split)
          ? [{ until: q.until, split: Array.from({ length: 7 }, (_, i) => day((q.split as unknown[])[i])) }] : [];
      }).sort((a, b) => a.until.localeCompare(b.until))
    : [];
  return { split, since: o.since, overrides, previous };
}

export function plannedFor(plan: TrainingPlan | null, date: string): PlanDay {
  if (!plan) return FREE_DAY;
  const split = plan.previous.find((p) => date <= p.until)?.split ?? plan.split;
  return plan.overrides[date] ?? split[weekdayIndex(date)] ?? FREE_DAY;
}

export const planDayLabel = (d: PlanDay) =>
  d.kind === "rest" ? d.name ?? "Rest" : d.kind === "free" ? "Unplanned" : d.name ?? (d.category ? CATEGORY_LABEL[d.category] : "Training");

/** `cardio` (from the exercise type) is used only for unlabelled workouts; see `matchesPlan`. */
export interface DoneWorkout { id: string; date: string; category: WorkoutCategory | null; cardio?: boolean }

/**
 * Does a workout fulfil a planned training day? No planned category → any workout. A labelled workout must have the
 * planned category. An unlabelled workout matches by kind: a cardio-type session (walk, run, …) fulfils a planned
 * Cardio day, any other session fulfils a planned strength day (Push, Pull, Legs, …).
 */
export function matchesPlan(planned: WorkoutCategory | null, w: DoneWorkout): boolean {
  if (!planned) return true;
  if (w.category) return w.category === planned;
  return (planned === "cardio") === Boolean(w.cardio);
}

export function dayStatus(plan: TrainingPlan | null, date: string, today: string, workouts: DoneWorkout[]): DayStatus {
  if (!plan || date < plan.since) return "before";
  const p = plannedFor(plan, date);
  const ws = workouts.filter((w) => w.date === date);
  const has = ws.length > 0;
  const complete = date < today;
  if (p.kind === "train") {
    if (has) return ws.some((w) => matchesPlan(p.category, w)) ? "done" : "different";
    return complete ? "missed" : "upcoming";
  }
  if (p.kind === "rest") return has ? "restTrained" : complete ? "rest" : "upcoming";
  return has ? "extra" : complete ? "free" : "upcoming";
}

export function adherence(statuses: DayStatus[]) {
  const done = statuses.filter((s) => s === "done").length, different = statuses.filter((s) => s === "different").length;
  const missed = statuses.filter((s) => s === "missed").length;
  const planned = done + different + missed;
  return {
    done, different, missed, planned,
    restKept: statuses.filter((s) => s === "rest").length, restTrained: statuses.filter((s) => s === "restTrained").length,
    extra: statuses.filter((s) => s === "extra").length,
    rate: planned ? (done + different) / planned : null,
  };
}

/** Per ISO week (oldest first), `weeks` weeks ending with the week of `today`. */
export function weeklyAdherence(plan: TrainingPlan | null, today: string, workouts: DoneWorkout[], weeks = 12) {
  const cur = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(cur, -7 * (weeks - 1 - i));
    const days = daysBetween(start, addDays(start, 6));
    const statuses = days.map((d) => (d > today ? ("upcoming" as const) : dayStatus(plan, d, today, workouts)));
    return { start, statuses, partial: start === cur, ...adherence(statuses) };
  });
}

/**
 * Consistency: consecutive complete weeks (most recent first) in which every planned training day was done.
 * Weeks before the plan or without planned training are skipped, not counted.
 */
export function consistentWeeks(weeks: ReturnType<typeof weeklyAdherence>): number {
  let n = 0;
  for (const w of [...weeks].reverse()) {
    if (w.partial || w.planned === 0) continue;
    if (w.missed === 0) n++; else break;
  }
  return n;
}
