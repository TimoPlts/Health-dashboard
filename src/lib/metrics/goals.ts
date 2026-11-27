/**
 * Personal goals: definitions and evaluation (goals@1). Pure; documented in docs/CALCULATIONS.md § GOALS.
 *
 * Status of a goal for one day or week:
 *   met        — reached (a total that reaches the target early counts as met immediately)
 *   missed     — the period is complete and the target was not reached
 *   inProgress — the period is still running and the target is not reached yet
 *   noData     — nothing was recorded (never counted as missed)
 * Completion rate = met ÷ (met + missed); periods without data are left out.
 */
export type GoalId = "stepsDaily" | "activeMinDaily" | "sleepMin" | "bedtimeMin" | "wakeMin" | "azmWeekly" | "zone2WeeklyMin" | "cardioSessionsWeekly";
export type GoalStatus = "met" | "missed" | "inProgress" | "noData";

export interface GoalDef { id: GoalId; label: string; period: "day" | "week"; kind: "atLeast" | "bedtime" | "wake"; unit: string; hint: string }
export const GOAL_DEFS: GoalDef[] = [
  { id: "stepsDaily", label: "Steps", period: "day", kind: "atLeast", unit: "steps", hint: "Daily step total from Google (Fitbit Air + phone, reconciled)." },
  { id: "activeMinDaily", label: "Active minutes", period: "day", kind: "atLeast", unit: "min", hint: "Light, moderate and vigorous minutes per day (Google)." },
  { id: "sleepMin", label: "Sleep", period: "day", kind: "atLeast", unit: "min", hint: "Minutes asleep in the main sleep, counted on the morning you wake up." },
  { id: "bedtimeMin", label: "In bed by", period: "day", kind: "bedtime", unit: "", hint: "Met when you got into bed no later than 15 minutes after the target." },
  { id: "wakeMin", label: "Wake-up time", period: "day", kind: "wake", unit: "", hint: "Met when you woke within 30 minutes of the target. Also used for the recommended bedtime." },
  { id: "azmWeekly", label: "Active Zone Minutes", period: "week", kind: "atLeast", unit: "AZM", hint: "Google Active Zone Minutes per ISO week. WHO guideline: 150 (moderate) per week." },
  { id: "zone2WeeklyMin", label: "Zone 2", period: "week", kind: "atLeast", unit: "min", hint: "Minutes at 60–70 % of HRmax per week (an approximation of the aerobic zone)." },
  { id: "cardioSessionsWeekly", label: "Cardio sessions", period: "week", kind: "atLeast", unit: "sessions", hint: "Cardio workouts per week (by type or by your Cardio label)." },
];
export const GOAL_BY_ID = new Map(GOAL_DEFS.map((g) => [g.id, g]));

export const BEDTIME_GRACE_MIN = 15;
export const WAKE_WINDOW_MIN = 30;

/** Totals that grow during the period (steps, minutes, sessions). */
export function evaluateAtLeast(value: number | null, target: number, complete: boolean): GoalStatus {
  if (value !== null && value >= target) return "met";
  if (!complete) return "inProgress";
  return value === null ? "noData" : "missed";
}

/**
 * Clock goals, evaluated on the night that ends on the day. `bedtimeAfterNoon` is minutes after 12:00 (so 23:30 and
 * 00:30 compare correctly); targets are minutes after midnight.
 */
export function evaluateBedtime(bedtimeAfterNoon: number | null, targetMin: number): GoalStatus {
  if (bedtimeAfterNoon === null) return "noData";
  const targetAfterNoon = (targetMin - 720 + 1440) % 1440;
  return bedtimeAfterNoon <= targetAfterNoon + BEDTIME_GRACE_MIN ? "met" : "missed";
}
export function evaluateWake(wakeMin: number | null, targetMin: number): GoalStatus {
  if (wakeMin === null) return "noData";
  const diff = Math.abs(wakeMin - targetMin);
  return Math.min(diff, 1440 - diff) <= WAKE_WINDOW_MIN ? "met" : "missed";
}

export function completion(statuses: GoalStatus[]) {
  const met = statuses.filter((s) => s === "met").length, missed = statuses.filter((s) => s === "missed").length;
  return { met, missed, rate: met + missed > 0 ? met / (met + missed) : null };
}

/** Progress fraction for rings (0–1); null when there is no value yet. */
export const progress = (value: number | null, target: number) => (value === null ? null : Math.max(0, Math.min(1, value / target)));
