"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GOAL_DEFS, type GoalId } from "@/lib/metrics/goals";
import { Sheet } from "./controls";
import { Icon } from "./icons";

type Goals = Record<GoalId, number | null>;
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CLOCK: Record<string, number[]> = {
  bedtimeMin: Array.from({ length: 25 }, (_, i) => (20 * 60 + i * 15) % 1440), // 20:00 → 02:00
  wakeMin: Array.from({ length: 25 }, (_, i) => 5 * 60 + i * 15), // 05:00 → 11:00
};
const NUMBER: Partial<Record<GoalId, { min: number; max: number; step: number; placeholder: string }>> = {
  stepsDaily: { min: 500, max: 100_000, step: 500, placeholder: "e.g. 8000" },
  activeMinDaily: { min: 5, max: 600, step: 5, placeholder: "e.g. 60" },
  azmWeekly: { min: 10, max: 2000, step: 10, placeholder: "WHO guideline 150" },
  zone2WeeklyMin: { min: 10, max: 2000, step: 10, placeholder: "e.g. 150" },
  cardioSessionsWeekly: { min: 1, max: 21, step: 1, placeholder: "e.g. 3" },
};

/** One sheet to set or clear every goal. Empty = no goal (nothing is assumed). */
export function GoalsEditor({ goals, triggerText = "Edit goals", focus }: { goals: Goals; triggerText?: string; focus?: GoalId }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(GOAL_DEFS.map((d) => [d.id, goals[d.id] === null ? "" : String(goals[d.id])])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "w-32 rounded-xl border border-hairline bg-[var(--track)] px-3 py-2 text-right text-[16px] outline-none";
  return (
    <Sheet title="Goals" triggerLabel={triggerText} triggerClassName="glass glass-pill pressable inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold"
      trigger={<><Icon name="check" size={16} strokeWidth={2.2} />{triggerText}</>}>
      {(close) => (
        <form className="flex flex-col gap-1" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          const body = Object.fromEntries(GOAL_DEFS.map((d) => [d.id, draft[d.id] === "" ? null : Number(draft[d.id])]));
          const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goals: body }) });
          setBusy(false);
          if (!r.ok) { setErr("Some values are outside the allowed range."); return; }
          router.refresh(); close();
        }}>
          <p className="mb-2 text-[13px] text-ink-3">Leave a field empty for no goal. Daily goals count each day; weekly goals count Monday to Sunday.</p>
          <div className="list">
            {GOAL_DEFS.map((d) => (
              <label key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block text-[15px] font-semibold">{d.label}<span className="ml-1.5 text-[12px] font-normal text-ink-3">{d.period === "day" ? "per day" : "per week"}</span></span></span>
                {d.id === "sleepMin" ? (
                  <select className={field} value={draft[d.id]} autoFocus={focus === d.id} onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}>
                    <option value="">No goal</option>
                    {Array.from({ length: 17 }, (_, i) => 360 + i * 15).map((m) => <option key={m} value={m}>{Math.floor(m / 60)} h {m % 60 ? `${m % 60} min` : ""}</option>)}
                  </select>
                ) : CLOCK[d.id] ? (
                  <select className={field} value={draft[d.id]} autoFocus={focus === d.id} onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })}>
                    <option value="">No goal</option>
                    {CLOCK[d.id]!.map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
                  </select>
                ) : (
                  <input className={field} type="number" inputMode="numeric" min={NUMBER[d.id]!.min} max={NUMBER[d.id]!.max} step={NUMBER[d.id]!.step}
                    placeholder={NUMBER[d.id]!.placeholder} value={draft[d.id]} autoFocus={focus === d.id} aria-label={`${d.label} goal`}
                    onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
          <button type="submit" disabled={busy} className="pressable mt-3 rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">{busy ? "Saving…" : "Save goals"}</button>
        </form>
      )}
    </Sheet>
  );
}
