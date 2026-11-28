"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CATEGORY_LABEL, WORKOUT_CATEGORIES, type WorkoutCategory } from "@/lib/metrics/workout-labels";
import { WEEKDAY_SHORT, type PlanDay, type PlanKind } from "@/lib/metrics/training-plan";
import { Sheet } from "./controls";
import { cx } from "./kit";

const KINDS: { v: PlanKind; l: string }[] = [{ v: "train", l: "Train" }, { v: "rest", l: "Rest" }, { v: "free", l: "Unplanned" }];
const input = "w-full rounded-[12px] bg-[var(--fill-2)] px-3 py-2 text-[15px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_var(--ink-3)]";

async function post(body: unknown) {
  const r = await fetch("/api/training/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Could not save");
}

function DayFields({ day, onChange, idPrefix }: { day: PlanDay; onChange: (d: PlanDay) => void; idPrefix: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Day type" className="flex rounded-[12px] bg-[var(--fill-2)] p-[3px]">
        {KINDS.map((k) => (
          <button key={k.v} type="button" role="radio" aria-checked={day.kind === k.v}
            onClick={() => onChange({ kind: k.v, name: k.v === "free" ? null : day.name, category: k.v === "train" ? day.category : null })}
            className={cx("flex-1 rounded-[9px] py-1.5 text-[13px] font-semibold", day.kind === k.v ? "bg-[var(--bg-elev)] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-ink-2")}>{k.l}</button>
        ))}
      </div>
      {day.kind !== "free" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3" htmlFor={`${idPrefix}-name`}>Name
            <input id={`${idPrefix}-name`} className={input} maxLength={40} placeholder={day.kind === "rest" ? "Rest" : "e.g. Push A"} value={day.name ?? ""} onChange={(e) => onChange({ ...day, name: e.target.value || null })} />
          </label>
          {day.kind === "train" && (
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-3" htmlFor={`${idPrefix}-cat`}>Category
              <select id={`${idPrefix}-cat`} className={input} value={day.category ?? ""} onChange={(e) => onChange({ ...day, category: (e.target.value || null) as WorkoutCategory | null })}>
                <option value="">Any workout</option>
                {WORKOUT_CATEGORIES.filter((c) => c !== "rest").map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function SaveBar({ pending, error, onSave, extra }: { pending: boolean; error: string | null; onSave: () => void; extra?: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-4 flex flex-col gap-2 bg-transparent pt-2">
      {error && <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p>}
      <button type="button" disabled={pending} onClick={onSave} className="pressable w-full rounded-full bg-ink py-3 text-[15px] font-semibold text-bg disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      {extra}
    </div>
  );
}

/** Weekly split editor. Saving applies from today; past weeks keep the split they were planned with. */
export function SplitEditor({ split, hasPlan }: { split: PlanDay[]; hasPlan: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(split);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Weekly split" triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[14px] font-semibold text-bg" trigger={hasPlan ? "Edit split" : "Create a plan"}>
      {(close) => (
        <div>
          <p className="mb-3 text-[13px] leading-snug text-ink-3">Choose training and rest days. Changes apply from today; earlier weeks keep the plan they had.</p>
          <ul className="flex flex-col gap-3">
            {days.map((d, i) => (
              <li key={i} className="rounded-[16px] bg-[var(--fill)] p-3">
                <div className="mb-2 text-[14px] font-bold">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}</div>
                <DayFields idPrefix={`split-${i}`} day={d} onChange={(nd) => setDays(days.map((x, j) => (j === i ? nd : x)))} />
              </li>
            ))}
          </ul>
          <SaveBar pending={pending} error={error} onSave={() => start(async () => {
            try { await post({ split: days }); setError(null); close(); router.refresh(); } catch { setError("Could not save the plan."); }
          })} extra={hasPlan ? (
            <button type="button" disabled={pending} className="pressable w-full rounded-full py-2.5 text-[14px] font-semibold text-danger"
              onClick={() => start(async () => { try { await post({ clear: true }); close(); router.refresh(); } catch { setError("Could not remove the plan."); } })}>Remove plan</button>
          ) : null} />
        </div>
      )}
    </Sheet>
  );
}

/** Adjust one day (e.g. move a session or add a rest day) without changing the weekly split. */
export function DayEditor({ date, day, overridden, trigger, label }: { date: string; day: PlanDay; overridden: boolean; trigger: ReactNode; label: string }) {
  const router = useRouter();
  const [d, setD] = useState(day);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const title = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(Date.parse(`${date}T12:00:00Z`));
  return (
    <Sheet title={title} triggerLabel={label} triggerClassName="block w-full text-left" trigger={trigger}>
      {(close) => (
        <div>
          <p className="mb-3 text-[13px] text-ink-3">Only this {WEEKDAY_SHORT[(new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay() + 6) % 7]} changes; the weekly split stays as it is.</p>
          <DayFields idPrefix={`day-${date}`} day={d} onChange={setD} />
          <SaveBar pending={pending} error={error} onSave={() => start(async () => {
            try { await post({ override: { date, day: d } }); close(); router.refresh(); } catch { setError("Could not save this day."); }
          })} extra={overridden ? (
            <button type="button" disabled={pending} className="pressable w-full rounded-full py-2.5 text-[14px] font-semibold text-ink-2"
              onClick={() => start(async () => { try { await post({ override: { date, day: null } }); close(); router.refresh(); } catch { setError("Could not reset this day."); } })}>Back to weekly plan</button>
          ) : null} />
        </div>
      )}
    </Sheet>
  );
}
