"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/training", label: "Training", icon: "training" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** Floating glass capsule; the active pill glides between tabs (instant with reduced motion). */
export function TabBar() {
  const path = usePathname();
  const reduce = useReducedMotion();
  if (path === "/login") return null;
  const active = TABS.find((t) => (t.href === "/" ? path === "/" : path.startsWith(t.href)))?.href;
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 14px)" }}>
      <ul className="glass glass-strong pointer-events-auto flex gap-1 rounded-full p-1.5" style={{ borderRadius: 999 }}>
        {TABS.map((t) => {
          const on = t.href === active;
          return (
            <li key={t.href} className="relative">
              {on && (
                <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-[var(--track)]"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} />
              )}
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={`relative flex min-w-[76px] flex-col items-center gap-0.5 rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${on ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
                <Icon name={t.icon} size={22} strokeWidth={on ? 2.1 : 1.8} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
