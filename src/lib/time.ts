/** Civil date (YYYY-MM-DD) of an instant, preferring the provider-supplied UTC offset over a fallback zone. */
export function civilDate(tMs: number, utcOffsetS: number | null | undefined, fallbackTimeZone: string): string {
  if (utcOffsetS !== null && utcOffsetS !== undefined) {
    return new Date(tMs + utcOffsetS * 1000).toISOString().slice(0, 10);
  }
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: fallbackTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(tMs));
}

/** UTC instants [start, end) of a civil day in an IANA zone. Correct on DST transition days (23 h / 25 h). */
export function civilDayBounds(date: string, timeZone: string): [number, number] {
  const start = zonedMidnight(date, timeZone);
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return [start, zonedMidnight(next, timeZone)];
}

function zonedMidnight(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  // Iterate twice: offset at the guess, then at the corrected instant (handles DST boundaries).
  const t1 = guess - offsetMs(guess, timeZone);
  const t2 = guess - offsetMs(t1, timeZone);
  // Where DST starts AT midnight (e.g. America/Santiago, America/Asuncion), local 00:00 does not exist and t2 lands
  // in the previous civil day; the day then starts at the transition instant (t1). Earliest valid candidate wins.
  const valid = [t2, t1].filter((t) => civilDate(t, null, timeZone) === date).sort((a, b) => a - b);
  return valid[0] ?? t2;
}

/** Offset of `timeZone` from UTC at instant `t`, in ms. */
export function offsetMs(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** UTC instant of a local wall-clock time in an IANA zone, and the offset (s) that applies then. */
export function zonedInstant(date: string, hh: number, mm: number, timeZone: string): { tMs: number; offsetS: number } {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh, mm);
  const off = offsetMs(guess - offsetMs(guess, timeZone), timeZone);
  return { tMs: guess - off, offsetS: Math.round(off / 1000) };
}
