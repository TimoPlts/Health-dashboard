"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, useTransition } from "react";
import type { QuickLogData } from "@/server/analytics/weight";
import { Icon } from "./icons";
import { cx } from "./kit";

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const fmt1 = (v: number) => v.toFixed(1);
const parse = (s: string) => { const n = Number(s.replace(",", ".").trim()); return Number.isFinite(n) ? n : NaN; };

/**
 * One-tap morning weigh-in. Prefilled with that day's weigh-in (to correct it) or your last weight; ± 0.1 kg steppers;
 * today by default, yesterday or any earlier day in one tap. Saving the same day again corrects it, never duplicates.
 */
export function WeightQuickLog({ q, compact, showLink = true }: { q: QuickLogData; compact?: boolean; showLink?: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [date, setDate] = useState(q.today);
  const existing = q.recent[date];
  const initialFor = (d: string) => (q.recent[d] ? fmt1(q.recent[d]!.kg) : q.lastKg !== null ? fmt1(q.lastKg) : "");
  const [value, setValue] = useState(initialFor(q.today));
  const [note, setNote] = useState(q.recent[q.today]?.manual ? q.recent[q.today]!.note ?? "" : "");
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const kg = parse(value);
  const valid = kg >= 25 && kg <= 350;

  const pick = (d: string) => {
    if (!d || d > q.today) return;
    setDate(d); setValue(initialFor(d)); setMsg(null);
    const r = q.recent[d]; setNote(r?.manual ? r.note ?? "" : ""); setNoteOpen(Boolean(r?.manual && r.note));
  };
  const step = (delta: number) => { const base = Number.isFinite(kg) ? kg : q.lastKg ?? 70; setValue(fmt1(Math.round((base + delta) * 10) / 10)); setMsg(null); };
  const save = () => start(async () => {
    const r = await fetch("/api/weight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "morning", date, kg: Math.round(kg * 100) / 100, note: note.trim() || null }) });
    const j = (await r.json().catch(() => ({}))) as { action?: string; error?: string };
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Could not save" }); return; }
    setMsg({ ok: true, text: j.action === "updated" ? "Updated" : j.action === "linked" ? "Matched your scale reading" : "Saved" });
    router.refresh();
  });

  const status = existing
    ? `${date === q.today ? "Logged today" : "Logged"} · ${fmt1(existing.kg)} kg at ${existing.time}${existing.manual ? "" : ` · ${existing.source}`}`
    : date === q.today ? "Not logged yet today" : "No weigh-in for this day";
  const chip = (on: boolean) => cx("pressable rounded-full px-3 py-1.5 text-[13px] font-semibold", on ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink-2");

  return (
    <div className={cx("flex flex-col", compact ? "gap-3" : "gap-4")}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Day">
        <button type="button" className={chip(date === q.today)} aria-pressed={date === q.today} onClick={() => pick(q.today)}>Today</button>
        <button type="button" className={chip(date === shift(q.today, -1))} aria-pressed={date === shift(q.today, -1)} onClick={() => pick(shift(q.today, -1))}>Yesterday</button>
        <label className={cx(chip(date < shift(q.today, -1)), "relative inline-flex items-center gap-1")}>
          <Icon name="calendar" size={14} strokeWidth={2.2} />
          {date < shift(q.today, -1) ? dayFmt.format(Date.parse(`${date}T12:00:00Z`)) : "Earlier"}
          <input type="date" aria-label="Pick an earlier day" max={q.today} value={date} onChange={(e) => pick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => step(-0.1)} aria-label="Decrease by 0.1 kg" className="pressable grid size-12 shrink-0 place-items-center rounded-full bg-[var(--fill-2)] text-[24px] font-semibold text-ink-2">−</button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
          <input inputMode="decimal" enterKeyHint="done" aria-label="Weight in kilograms" value={value} placeholder="—"
            onChange={(e) => { setValue(e.target.value); setMsg(null); }} onKeyDown={(e) => { if (e.key === "Enter" && valid) save(); }}
            onFocus={(e) => e.currentTarget.select()}
            className="num w-[4.6ch] min-w-0 bg-transparent text-center text-[44px] leading-none font-bold tracking-[-0.03em] outline-none placeholder:text-ink-4 focus-visible:underline focus-visible:decoration-[var(--body)] focus-visible:decoration-2 focus-visible:underline-offset-8" />
          <span className="text-[17px] font-semibold text-ink-3">kg</span>
        </label>
        <button type="button" onClick={() => step(0.1)} aria-label="Increase by 0.1 kg" className="pressable grid size-12 shrink-0 place-items-center rounded-full bg-[var(--fill-2)] text-[24px] font-semibold text-ink-2">+</button>
      </div>

      <p className="text-center text-[12px] font-medium text-ink-3" aria-live="polite">{status}</p>

      {noteOpen ? (
        <input aria-label="Note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. after travel"
          className="rounded-[12px] bg-[var(--fill-2)] px-3 py-2 text-[15px] outline-none focus-visible:shadow-[0_0_0_2px_var(--ink-3)]" />
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="pressable self-center text-[13px] font-semibold text-ink-3">+ Add note</button>
      )}

      <button type="button" disabled={!valid || pending} onClick={save}
        className="pressable relative flex h-12 items-center justify-center overflow-hidden rounded-full bg-ink text-[16px] font-semibold text-bg disabled:opacity-50">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={pending ? "p" : msg?.ok ? `ok-${msg.text}` : "save"} className="inline-flex items-center gap-1.5"
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {pending ? "Saving…" : msg?.ok ? <><Icon name="check" size={18} strokeWidth={2.6} />{msg.text}</> : existing?.manual ? "Update" : "Save"}
          </motion.span>
        </AnimatePresence>
      </button>
      {msg && !msg.ok && <p role="alert" className="text-center text-[13px] font-semibold text-danger">{msg.text}</p>}
      {showLink && <Link href="/weight" transitionTypes={["nav-forward"]} className="pressable self-center text-[13px] font-semibold text-ink-2">Weight dashboard ›</Link>}
    </div>
  );
}
