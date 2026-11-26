import type { CSSProperties, ReactNode } from "react";

/**
 * Score ring. A null value renders an empty dashed track ("no score"), never a filled zero.
 * The arc draws in once (CSS), with a faint same-hue glow under it for optical depth.
 */
export function Ring({ value, max = 100, color, size = 112, stroke = 11, children, label, dashed }: {
  value: number | null; max?: number; color: string; size?: number; stroke?: number; children?: ReactNode; label: string; dashed?: boolean;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = value === null ? 0 : Math.max(0.004, Math.min(1, value / max));
  const id = `rg-${label.replace(/\W/g, "")}`;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`color-mix(in oklab, ${color} 70%, white)`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} strokeDasharray={dashed || value === null ? "2 6" : undefined} strokeLinecap="round" />
        {value !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
            className="ring-arc" strokeDasharray={`${c} ${c}`}
            style={{ strokeDashoffset: c * (1 - frac), "--ring-len": `${c}`, "--ring-off": `${c * (1 - frac)}`, filter: `drop-shadow(0 0 8px color-mix(in oklab, ${color} 40%, transparent))` } as CSSProperties} />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Horizontal meter with optional target tick (e.g. sleep vs need). */
export function Meter({ value, max, color, target, label }: { value: number | null; max: number; color: string; target?: number; label: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="relative h-2 w-full rounded-full bg-[var(--track)]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? undefined}>
      {value !== null && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />}
      {target !== undefined && <div className="absolute -top-1 h-4 w-[2px] rounded-full bg-ink-2" style={{ left: `calc(${Math.min(100, (target / max) * 100)}% - 1px)` }} />}
    </div>
  );
}
