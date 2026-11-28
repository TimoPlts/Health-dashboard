"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { cx } from "./kit";

const shift = (date: string, d: number) => new Date(Date.parse(`${date}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const dayLabel = (date: string, today: string) => {
  if (date === today) return "Today";
  if (date === shift(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(Date.parse(`${date}T12:00:00Z`));
};

/** Previous / next day capsule. Uses ?date= so every day is a shareable, back-button-friendly URL. */
export function DateNav({ date, today, earliest }: { date: string; today: string; earliest?: string | null }) {
  const path = usePathname();
  const params = useSearchParams();
  const href = (d: string) => { const p = new URLSearchParams(params); if (d === today) p.delete("date"); else p.set("date", d); const q = p.toString(); return q ? `${path}?${q}` : path; };
  const canBack = !earliest || date > earliest, canFwd = date < today;
  const btn = "pressable grid size-9 place-items-center rounded-full text-ink-2 disabled:opacity-30";
  return (
    <div className="glass glass-pill flex items-center gap-0.5 p-1">
      {canBack ? <Link aria-label="Previous day" className={btn} href={href(shift(date, -1))} transitionTypes={["nav-back"]} scroll={false}><Icon name="chevronLeft" size={18} strokeWidth={2.4} /></Link>
        : <button aria-label="Previous day" className={btn} disabled><Icon name="chevronLeft" size={18} strokeWidth={2.4} /></button>}
      <Link href={href(today)} scroll={false} className="min-w-[84px] px-1 text-center text-[14px] font-semibold">{dayLabel(date, today)}</Link>
      {canFwd ? <Link aria-label="Next day" className={btn} href={href(shift(date, 1))} transitionTypes={["nav-forward"]} scroll={false}><Icon name="chevronRight" size={18} strokeWidth={2.4} /></Link>
        : <button aria-label="Next day" className={btn} disabled><Icon name="chevronRight" size={18} strokeWidth={2.4} /></button>}
    </div>
  );
}

/** iOS segmented control bound to a search param. */
export function Segmented({ param, options, value }: { param: string; options: { value: string; label: string }[]; value: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  return (
    <div role="tablist" className="relative flex rounded-[12px] bg-[var(--fill-2)] p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        const p = new URLSearchParams(params); p.set(param, o.value);
        return (
          <Link key={o.value} role="tab" aria-selected={on} href={`${path}?${p}`} scroll={false} replace
            className={cx("relative flex-1 rounded-[9px] py-1.5 text-center text-[13px] font-semibold transition-colors", on ? "text-ink" : "text-ink-2")}>
            {on && <motion.span layoutId={`seg-${param}`} className="absolute inset-0 rounded-[9px] bg-[var(--bg-elev)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} />}
            <span className="relative">{o.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Native-feeling bottom sheet: scrim, spring-in, drag-down to dismiss, Escape to close, focus moved into the sheet.
 */
export function Sheet({ trigger, title, children, triggerClassName, dragToDismiss = true, triggerLabel }: { trigger: ReactNode; title: string; children: ReactNode | ((close: () => void) => ReactNode); triggerClassName?: string; dragToDismiss?: boolean; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button type="button" className={cx("pressable", triggerClassName)} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={triggerLabel}>{trigger}</button>
      {/* Portalled to <body>: a sheet opened from inside a glass card would otherwise be positioned and clipped by
          that card (backdrop-filter makes it the containing block for fixed elements). */}
      {mounted && createPortal(<AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center">
            <motion.div className="absolute inset-0 bg-[var(--scrim)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label={title}
              className="glass glass-thick relative max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-b-none px-5 pt-2.5"
              style={{ borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}
              initial={reduce ? { opacity: 0 } : { y: "100%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              drag={reduce || !dragToDismiss ? false : "y"} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) setOpen(false); }}
              ref={(el) => el?.focus()} tabIndex={-1}>
              <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-[var(--fill-2)]" aria-hidden="true" />
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="pressable grid size-8 place-items-center rounded-full bg-[var(--fill-2)] text-ink-2"><Icon name="close" size={16} strokeWidth={2.4} /></button>
              </div>
              {typeof children === "function" ? children(() => setOpen(false)) : children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}

/** Exclude / include a workout in analytics (provider data untouched). */
export function ExcludeToggle({ sessionIds, excluded }: { sessionIds: string[]; excluded: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending}
      className={cx("pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold", excluded ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink")}
      onClick={() => start(async () => {
        await fetch("/api/workouts/exclude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionIds, excluded: !excluded }) });
        router.refresh();
      })}>
      <Icon name={excluded ? "check" : "eyeOff"} size={16} strokeWidth={2.2} />
      {pending ? "Saving…" : excluded ? "Include in analytics" : "Exclude from analytics"}
    </button>
  );
}
