import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Glass({ children, className, strong, as: As = "section" }: { children: ReactNode; className?: string; strong?: boolean; as?: "section" | "div" | "article" }) {
  return <As className={cx("glass", strong && "glass-strong", className)}>{children}</As>;
}

/** Large iOS-style navigation title. */
export function PageTitle({ eyebrow, title, trailing }: { eyebrow?: ReactNode; title: string; trailing?: ReactNode }) {
  return (
    <header className="safe-top flex items-end justify-between gap-4 px-1 pb-5">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium tracking-wide text-ink-2">{eyebrow}</div>}
        <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em]">{title}</h1>
      </div>
      {trailing}
    </header>
  );
}

export function SectionLabel({ children, href }: { children: ReactNode; href?: string }) {
  const inner = (
    <span className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
      {children}
      {href && <Icon name="chevronRight" size={14} strokeWidth={2.25} />}
    </span>
  );
  return <div className="mt-7 mb-2.5 px-1">{href ? <Link href={href}>{inner}</Link> : inner}</div>;
}

/** Big number with unit. `value` null renders an em dash, never 0. */
export function Stat({ value, unit, size = "md", tone }: { value: string; unit?: string; size?: "sm" | "md" | "lg" | "xl"; tone?: string }) {
  const sizes = { sm: "text-[20px]", md: "text-[26px]", lg: "text-[34px]", xl: "text-[48px]" };
  return (
    <span className="tabular inline-flex items-baseline gap-1 font-display font-semibold tracking-[-0.02em]" style={tone ? { color: tone } : undefined}>
      <span className={cx(sizes[size], "leading-none")}>{value}</span>
      {unit && value !== "—" && <span className="text-[13px] font-medium tracking-normal text-ink-2">{unit}</span>}
    </span>
  );
}

export function MetricLabel({ icon, children, tone }: { icon?: IconName; children: ReactNode; tone?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
      {icon && <span style={{ color: tone }}><Icon name={icon} size={16} strokeWidth={2} /></span>}
      {children}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "ok" | "danger" }) {
  const tones = {
    neutral: "text-ink-2 bg-[var(--track)]",
    warn: "text-warn bg-[color-mix(in_oklab,var(--warn)_14%,transparent)]",
    ok: "text-recovery bg-[color-mix(in_oklab,var(--recovery)_14%,transparent)]",
    danger: "text-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}
