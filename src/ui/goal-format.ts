import type { GoalId, GoalStatus } from "@/lib/metrics/goals";
import type { Tone } from "@/server/analytics/registry";
import { fmtDuration, fmtNumber } from "./format";

export const GOAL_TONE: Record<GoalId, Tone> = {
  stepsDaily: "activity", activeMinDaily: "activity", sleepMin: "sleep", bedtimeMin: "sleep", wakeMin: "sleep",
  azmWeekly: "heart", zone2WeeklyMin: "load", cardioSessionsWeekly: "heart",
};
export const STATUS_TEXT: Record<GoalStatus, string> = { met: "Met", missed: "Missed", inProgress: "In progress", noData: "No data" };
const hhmm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(Math.round((((m % 1440) + 1440) % 1440) % 60)).padStart(2, "0")}`;

/** A goal's measured value: bedtime values are minutes after noon, wake-up values minutes after midnight. */
export function formatGoalValue(id: GoalId, v: number | null) {
  if (v === null) return "—";
  if (id === "sleepMin") return fmtDuration(v, { compact: true });
  if (id === "bedtimeMin") return hhmm(v + 720);
  if (id === "wakeMin") return hhmm(v);
  if (id === "zone2WeeklyMin" || id === "activeMinDaily") return `${fmtNumber(v)} min`;
  return fmtNumber(v);
}
/** A goal's target: clock targets are minutes after midnight. */
export const formatTarget = (id: GoalId, t: number) => (id === "bedtimeMin" || id === "wakeMin" ? hhmm(t) : formatGoalValue(id, t));
