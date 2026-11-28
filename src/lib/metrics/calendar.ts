/**
 * Monthly calendar helpers (calendar@1). Pure; documented in docs/CALCULATIONS.md § CALENDAR.
 * Weeks start on Monday (ISO 8601). Days outside the month are null cells so the grid always has 7 columns.
 */
import { addDays, daysBetween, periodOf, weekStart } from "./periods";

export const CALENDAR_VERSION = "calendar@1";

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const monthOf = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** Rows of 7 cells (Mon–Sun); null = a day of the previous / next month. */
export function monthGrid(month: string): (string | null)[][] {
  const p = periodOf("month", `${month}-01`);
  const start = weekStart(p.from);
  const end = addDays(weekStart(p.to), 6);
  const cells = daysBetween(start, end).map((d) => (d >= p.from && d <= p.to ? d : null));
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/**
 * Colour intensity (0–1) for a value on a heat scale between lo and hi. null stays null (missing ≠ zero): the UI
 * draws a hollow cell for null and a filled, labelled cell for an actual 0.
 */
export function heat(value: number | null, lo: number, hi: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (hi <= lo) return 0.5;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}
