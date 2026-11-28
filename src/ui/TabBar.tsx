"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Today", icon: "today", match: (p) => p === "/" },
  { href: "/sleep", label: "Sleep", icon: "sleep", match: (p) => p.startsWith("/sleep") },
  { href: "/training", label: "Training", icon: "bolt", match: (p) => p.startsWith("/training") },
  { href: "/trends", label: "Trends", icon: "trends", match: (p) => p.startsWith("/trends") },
  { href: "/health", label: "Health", icon: "grid", match: (p) => ["/health", "/metric", "/monitor", "/calendar", "/timeline"].some((x) => p.startsWith(x)) },
];

/** Floating Liquid-Glass capsule; the active lens glides between tabs (instant with reduced motion). */
export function TabBar() {
  const path = usePathname();
  const reduce = useReducedMotion();
  if (path === "/login") return null;
  const active = TABS.find((t) => t.match(path))?.href;
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
      <ul className="glass glass-thick glass-pill pointer-events-auto flex w-full max-w-[420px] justify-between p-1.5">
        {TABS.map((t) => {
          const on = t.href === active;
          return (
            <li key={t.href} className="relative flex-1">
              {on && (
                <motion.span layoutId="tab-lens" className="absolute inset-0 rounded-full bg-[var(--fill-2)] shadow-[inset_0_1px_0_var(--glass-rim-hi)]"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }} />
              )}
              <Link href={t.href} transitionTypes={["tab"]} aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10.5px] font-semibold transition-colors ${on ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
                <Icon name={t.icon} size={23} strokeWidth={on ? 2.1 : 1.8} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
