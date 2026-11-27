/** Server-renderable small charts. */

/** Progress ring. `value` null → empty track (unknown), never a filled zero. */
export function Ring({ value, max, color, size = 92, stroke = 10, children, label }: {
  value: number | null; max: number; color: string; size?: number; stroke?: number; children?: React.ReactNode; label: string;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = value === null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`} style={{ filter: `drop-shadow(0 0 6px color-mix(in oklab, ${color} 35%, transparent))` }} />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** 7-day sparkline for stat tiles. Points are connected only between consecutive days. */
export function Sparkline({ points, dates, color, width = 96, height = 28 }: { points: { date: string; value: number }[]; dates: string[]; color: string; width?: number; height?: number }) {
  const vals = points.map((p) => p.value);
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (d: string) => (dates.indexOf(d) / Math.max(1, dates.length - 1)) * (width - 6) + 3;
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (height - 6);
  let d = "";
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const consecutive = prev && dates.indexOf(p.date) - dates.indexOf(prev.date) === 1;
    d += `${consecutive ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const last = points[points.length - 1]!;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={x(last.date)} cy={y(last.value)} r={3} fill={color} stroke="var(--bg)" strokeWidth={1.5} />
    </svg>
  );
}

/** Horizontal bars for time in zones; labels in text ink, minutes always printed. */
export function ZoneBars({ seconds, order, labels }: { seconds: Record<string, number>; order: string[]; labels: Record<string, string> }) {
  const total = order.reduce((a, k) => a + (seconds[k] ?? 0), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {order.map((k, i) => {
        const s = seconds[k] ?? 0;
        return (
          <li key={k} className="grid grid-cols-[72px_1fr_56px] items-center gap-3 text-[13px]">
            <span className="font-medium text-ink-2">{labels[k] ?? k}</span>
            <span className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
              <span className="block h-full rounded-full" style={{ width: `${(s / total) * 100}%`, background: "var(--heart)", opacity: 0.35 + (i / Math.max(1, order.length - 1)) * 0.65 }} />
            </span>
            <span className="text-right font-semibold tabular">{Math.round(s / 60)} min</span>
          </li>
        );
      })}
    </ul>
  );
}
