import Link from "next/link";
import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export type Tone = "recovery" | "sleep" | "load" | "heart" | "activity" | "vitals" | "body";
export const toneVar = (t: Tone) => `var(--${t})`;

/**
 * Page shell: directional view transitions (forward/back links) and a cross-fade between tabs.
 * `accent` tints the ambient light field for the page's domain.
 */
export function Page({ children, accent }: { children: ReactNode; accent?: Tone }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }}
      default="none">
      <div style={accent ? ({ "--amb-accent": `color-mix(in oklab, var(--${accent}) 22%, transparent)` } as CSSProperties) : undefined}>
        {accent && <div className="ambient" aria-hidden="true" style={{ zIndex: -1 }} />}
        {children}
      </div>
    </ViewTransition>
  );
}

export function Glass({ children, className, thick, as: As = "section", style, tabIndex, "aria-label": ariaLabel }: { children: ReactNode; className?: string; thick?: boolean; as?: "section" | "div" | "article" | "li"; style?: CSSProperties; tabIndex?: number; "aria-label"?: string }) {
  return <As className={cx("glass", thick && "glass-thick", className)} style={style} tabIndex={tabIndex} aria-label={ariaLabel}>{children}</As>;
}

/** iOS large title with optional eyebrow and trailing controls. */
export function LargeTitle({ title, eyebrow, trailing, back }: { title: string; eyebrow?: ReactNode; trailing?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="safe-top px-1 pb-4">
      {back && (
        <Link href={back.href} transitionTypes={["nav-back"]} className="pressable -ml-1.5 mb-2 inline-flex items-center gap-0.5 text-[16px] font-medium text-ink-2">
          <Icon name="chevronLeft" size={20} strokeWidth={2.2} />{back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{eyebrow}</div>}
          <h1 className="font-display text-[34px] leading-[1.06] font-bold tracking-[-0.025em]">{title}</h1>
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2 pb-1">{trailing}</div>}
      </div>
    </header>
  );
}

export function SectionHeader({ children, href, action }: { children: ReactNode; href?: string; action?: ReactNode }) {
  const label = <span className="text-[20px] font-bold tracking-[-0.02em]">{children}</span>;
  return (
    <div className="mt-8 mb-3 flex items-center justify-between px-1">
      {href ? (
        <Link href={href} transitionTypes={["nav-forward"]} className="pressable inline-flex items-center gap-1">{label}<span className="text-ink-3"><Icon name="chevronRight" size={18} strokeWidth={2.4} /></span></Link>
      ) : label}
      {action}
    </div>
  );
}

/** Number + unit. null → em dash (never 0). */
export function Value({ value, unit, size = "md", className }: { value: string; unit?: string; size?: "sm" | "md" | "lg" | "xl" | "hero"; className?: string }) {
  const sizes = { sm: "text-[19px]", md: "text-[26px]", lg: "text-[34px]", xl: "text-[46px]", hero: "text-[64px]" };
  const empty = value === "—";
  return (
    <span className={cx("num inline-flex items-baseline gap-1 font-semibold", className)}>
      <span className={cx(sizes[size], "leading-none", empty && "text-ink-4")}>{value}</span>
      {unit && !empty && <span className="text-[13px] font-semibold tracking-normal text-ink-3">{unit}</span>}
    </span>
  );
}

export function Label({ icon, tone, children, className }: { icon?: IconName; tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("flex items-center gap-1.5 text-[13px] font-semibold text-ink-2", className)}>
      {icon && <span style={{ color: tone ? toneVar(tone) : undefined }}><Icon name={icon} size={15} strokeWidth={2.2} /></span>}
      {children}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "ok" | "danger" | "info" }) {
  const c = { neutral: "var(--ink-2)", warn: "var(--warn)", ok: "var(--ok)", danger: "var(--danger)", info: "var(--sleep)" }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ color: c, background: tone === "neutral" ? "var(--fill-2)" : `color-mix(in oklab, ${c} 15%, transparent)` }}>
      {children}
    </span>
  );
}

/** Calibration / insufficient data state with progress. */
export function Calibrating({ have, need, what, compact }: { have: number; need: number; what: string; compact?: boolean }) {
  const pct = Math.min(1, have / need);
  return (
    <div className={cx("flex flex-col gap-1.5", compact ? "text-[12px]" : "text-[13px]")}>
      <span className="font-semibold text-ink-2">Calibrating {what}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={have} aria-label={`Calibrating ${what}`}>
        <div className="h-full rounded-full bg-ink-3" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-ink-3">{have} of {need} days</span>
    </div>
  );
}

export function EmptyState({ title, children, icon = "clock" }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="text-ink-4"><Icon name={icon} size={28} /></span>
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <p className="max-w-[34ch] text-[13px] leading-snug text-ink-3">{children}</p>}
    </div>
  );
}

/** Grouped list row (iOS style). */
export function Row({ href, icon, tone, title, subtitle, trailing, forward = true }: { href?: string; icon?: IconName; tone?: Tone; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; forward?: boolean }) {
  const inner = (
    <div className="flex min-h-[54px] items-center gap-3 px-4 py-2.5">
      {icon && (
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: tone ? toneVar(tone) : "var(--ink-2)", background: tone ? `color-mix(in oklab, ${toneVar(tone)} 14%, transparent)` : "var(--fill-2)" }}>
          <Icon name={icon} size={18} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {trailing}
      {href && forward && <span className="text-ink-4"><Icon name="chevronRight" size={16} strokeWidth={2.4} /></span>}
    </div>
  );
  return href ? <Link href={href} transitionTypes={["nav-forward"]} className="pressable hoverable block">{inner}</Link> : inner;
}

/** Signed change with direction wording, no red/green judgement of health values. */
export function Delta({ value, unit, digits = 0, suffix }: { value: number | null; unit?: string; digits?: number; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value).toFixed(digits);
  const sign = Number(abs) === 0 ? "±" : value > 0 ? "+" : "−";
  return <span className="num text-[13px] font-semibold text-ink-2">{sign}{abs}{unit ? ` ${unit}` : ""}{suffix ? <span className="font-medium text-ink-3"> {suffix}</span> : null}</span>;
}
