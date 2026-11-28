"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PHASE_KINDS, PHASE_LABEL, type PhaseKind, type WeightPhase } from "@/lib/metrics/weight-tracker";
import { Sheet } from "./controls";
import { Icon } from "./icons";
import { cx } from "./kit";

const field = "w-full rounded-[12px] bg-[var(--fill-2)] px-3 py-2 text-[15px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_var(--ink-3)]";
const num = (s: string) => { const n = Number(s.replace(",", ".").trim()); return s.trim() === "" ? null : Number.isFinite(n) ? n : NaN; };

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Could not save");
}

/** Create or edit a weight phase. Rates and goals are yours to set; Baseline never suggests them. */
export function PhaseEditor({ phase, defaults, trigger, triggerClassName, current, triggerLabel }: {
  phase: WeightPhase | null; defaults: { startDate: string; startKg: number | null; today: string }; trigger: React.ReactNode; triggerClassName?: string; current?: boolean; triggerLabel?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PhaseKind>(phase?.kind ?? "cut");
  const [name, setName] = useState(phase?.name ?? "");
  const [startDate, setStartDate] = useState(phase?.startDate ?? defaults.startDate);
  const [startKg, setStartKg] = useState(phase ? String(phase.startKg) : defaults.startKg !== null ? defaults.startKg.toFixed(1) : "");
  const [endDate, setEndDate] = useState(phase?.endDate ?? "");
  const [goalKg, setGoalKg] = useState(phase?.goalKg !== null && phase?.goalKg !== undefined ? String(phase.goalKg) : "");
  const [rate, setRate] = useState(phase?.targetRateKgWeek !== null && phase?.targetRateKgWeek !== undefined ? String(phase.targetRateKgWeek) : "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const body = () => ({ kind, name: name.trim() || PHASE_LABEL[kind], startDate, startKg: num(startKg), endDate: endDate || null, goalKg: num(goalKg), targetRateKgWeek: num(rate) });
  const run = (fn: () => Promise<void>, close: () => void) => start(async () => { try { await fn(); setErr(null); close(); router.refresh(); } catch (e) { setErr((e as Error).message); } });

  return (
    <Sheet title={phase ? "Edit phase" : "New phase"} triggerClassName={triggerClassName} trigger={trigger} triggerLabel={triggerLabel}>
      {(close) => (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => send("/api/weight/phases", "POST", phase ? { action: "update", id: phase.id, phase: body() } : { action: "create", phase: body() }), close); }}>
          <div role="radiogroup" aria-label="Phase type" className="flex rounded-[12px] bg-[var(--fill-2)] p-[3px]">
            {PHASE_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cx("flex-1 rounded-[9px] py-1.5 text-[13px] font-semibold", kind === k ? "bg-[var(--bg-elev)] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2")}>{PHASE_LABEL[k]}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Name<input className={field} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={PHASE_LABEL[kind]} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Start date<input type="date" className={field} max={defaults.today} value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Starting weight (kg)<input inputMode="decimal" className={field} value={startKg} onChange={(e) => setStartKg(e.target.value)} required /></label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Goal weight (kg)<input inputMode="decimal" className={field} value={goalKg} onChange={(e) => setGoalKg(e.target.value)} placeholder="Optional" /></label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Target kg / week<input inputMode="decimal" className={field} value={rate} onChange={(e) => setRate(e.target.value)} placeholder={kind === "cut" ? "Optional, e.g. −0.4" : "Optional"} /></label>
            <label className="col-span-2 flex flex-col gap-1 text-[12px] font-semibold text-ink-3">End date<input type="date" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} /><span className="font-normal">Optional. Leave empty while the phase is ongoing.</span></label>
          </div>
          <p className="text-[12px] leading-snug text-ink-3">Starting weight is prefilled with your current trend; change it if the phase started earlier. A target rate is only compared with what you observe; Baseline does not set calorie targets or suggest a rate.</p>
          {err && <p role="alert" className="text-[13px] font-semibold text-danger">{err}</p>}
          <button type="submit" disabled={pending} className="pressable rounded-full bg-ink py-3 text-[15px] font-semibold text-bg disabled:opacity-60">{pending ? "Saving…" : phase ? "Save phase" : "Start phase"}</button>
          {phase && current && !phase.endDate && (
            <button type="button" disabled={pending} onClick={() => run(() => send("/api/weight/phases", "POST", { action: "end", id: phase.id, endDate: defaults.today }), close)}
              className="pressable rounded-full bg-[var(--fill-2)] py-2.5 text-[14px] font-semibold">End phase today</button>
          )}
          {phase && (confirmDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="pressable flex-1 rounded-full bg-[var(--fill-2)] py-2.5 text-[14px] font-semibold">Keep</button>
              <button type="button" disabled={pending} onClick={() => run(() => send("/api/weight/phases", "POST", { action: "delete", id: phase.id }), close)} className="pressable flex-1 rounded-full bg-danger py-2.5 text-[14px] font-semibold text-white">Delete phase</button>
            </div>
          ) : <button type="button" onClick={() => setConfirmDelete(true)} className="pressable py-1 text-[14px] font-semibold text-danger">Delete phase…</button>)}
        </form>
      )}
    </Sheet>
  );
}

export interface HistoryEntry { key: string; tMs: number; sourceId: number; time: string; kg: number; manual: boolean; source: string; note: string | null; day: boolean }

/** Edit / delete a manual weigh-in, or make any weigh-in the day's morning weigh-in. Google entries are read-only. */
export function EntryActions({ e, dateLabel }: { e: HistoryEntry; dateLabel: string }) {
  const router = useRouter();
  const [kg, setKg] = useState(e.kg.toFixed(1));
  const [note, setNote] = useState(e.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = (fn: () => Promise<void>, close: () => void) => start(async () => { try { await fn(); setErr(null); close(); router.refresh(); } catch (x) { setErr((x as Error).message); } });
  return (
    <Sheet title={`${dateLabel} · ${e.time}`} triggerLabel={`Weigh-in ${dateLabel} ${e.time}, ${e.kg.toFixed(1)} kg${e.manual ? ", manual" : `, ${e.source}`}${e.day ? ", morning weigh-in" : ""}. Options`}
      triggerClassName="hoverable block w-full text-left" trigger={
        <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <span className="num w-12 shrink-0 text-[13px] font-semibold text-ink-3">{e.time}</span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
              <span className={cx("rounded-full px-1.5 py-px text-[10.5px] font-bold", e.manual ? "bg-[color-mix(in_oklab,var(--body)_16%,transparent)] text-[var(--body)]" : "bg-[var(--fill-2)] text-ink-2")}>{e.manual ? "Manual" : "Google"}</span>
              {!e.manual && <span className="truncate font-medium text-ink-3">{e.source}</span>}
              {e.day && <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-bold text-ink-2"><Icon name="check" size={12} strokeWidth={2.8} />Day&apos;s weight</span>}
            </span>
            {e.note && <span className="block truncate text-[12px] text-ink-3">“{e.note}”</span>}
          </span>
          <span className={cx("num shrink-0 text-[16px] font-semibold", !e.day && "text-ink-2")}>{e.kg.toFixed(1)}<span className="ml-0.5 text-[11px] text-ink-3">kg</span></span>
        </div>
      }>
      {(close) => (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-3">{e.manual ? "Manual entry · stored only in Baseline" : `${e.source} · from Google Health, read-only (it would return with the next sync)`}</p>
          {e.manual && (
            <form className="flex flex-col gap-2" onSubmit={(x) => { x.preventDefault(); run(() => send("/api/weight", "PATCH", { tMs: e.tMs, kg: num(kg), note: note.trim() || null }), close); }}>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Weight (kg)<input inputMode="decimal" className={field} value={kg} onChange={(x) => setKg(x.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3">Note<input className={field} maxLength={200} value={note} onChange={(x) => setNote(x.target.value)} placeholder="Optional" /></label>
              <button type="submit" disabled={pending} className="pressable rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-60">Save changes</button>
            </form>
          )}
          {!e.day && (
            <button type="button" disabled={pending} onClick={() => run(() => send("/api/weight/morning", "POST", { tMs: e.tMs, sourceId: e.sourceId }), close)}
              className="pressable rounded-full bg-[var(--fill-2)] py-2.5 text-[14px] font-semibold">Use as this day&apos;s morning weigh-in</button>
          )}
          {e.manual && (confirmDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="pressable flex-1 rounded-full bg-[var(--fill-2)] py-2.5 text-[14px] font-semibold">Keep</button>
              <button type="button" disabled={pending} onClick={() => run(() => send("/api/weight", "DELETE", { tMs: e.tMs }), close)} className="pressable flex-1 rounded-full bg-danger py-2.5 text-[14px] font-semibold text-white">Delete entry</button>
            </div>
          ) : <button type="button" onClick={() => setConfirmDelete(true)} className="pressable py-1 text-[14px] font-semibold text-danger">Delete entry…</button>)}
          {err && <p role="alert" className="text-[13px] font-semibold text-danger">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
