/**
 * Baseline mark: a flat line with one gentle rise that returns to it — deviation from, and return to,
 * your personal baseline. Deliberately quiet: one stroke, no gradients.
 */
export const BASELINE_MARK_PATH = "M2.5 15.5H8c1.4 0 1.9-7 4-7s2.6 7 4 7h5.5";

export function LogoMark({ size = 28, accent = "var(--heart)" }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 15.5h19" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1.75} strokeLinecap="round" />
      <path d={BASELINE_MARK_PATH} stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size + 6} />
      <span className="font-display font-semibold tracking-[-0.025em]" style={{ fontSize: size }}>Baseline</span>
    </span>
  );
}
