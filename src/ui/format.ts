/** Display formatting. All times are rendered in the configured home time zone. */

export function fmtDuration(minutes: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  const m = Math.round(minutes);
  const h = Math.floor(m / 60), r = m % 60;
  if (opts.compact) return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
  return h ? `${h} h ${r} min` : `${r} min`;
}

export function fmtTime(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(ms);
}

export function fmtDayLong(date: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(Date.parse(`${date}T12:00:00Z`));
}

export function fmtDateShort(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(ms);
}

export function fmtNumber(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtRelative(ms: number | null | undefined, now = Date.now()) {
  if (!ms) return "never";
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function fmtSignedNumber(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = fmtNumber(Math.abs(v), digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
