"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCALE_LABELS, type HabitKind } from "@/lib/metrics/journal";
import { Sheet } from "./controls";
import { Icon } from "./icons";
import { cx } from "./kit";

export interface JournalHabit { id: string; name: string; kind: HabitKind; unit: string | null; min: number | null; max: number | null; archivedAt?: number | null }

const pill = (on: boolean) => cx("pressable min-w-11 rounded-full px-3 py-2 text-[14px] font-semibold", on ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink");

/** Quick daily entry. An empty habit means "not logged" — never "no". */
export function JournalDay({ date, habits, values }: { date: string; habits: JournalHabit[]; values: Record<string, number> }) {
  const [vals, setVals] = useState<Record<string, number | undefined>>(values);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  async function save(h: JournalHabit, value: number | null) {
    const before = vals[h.id];
    setVals({ ...vals, [h.id]: value ?? undefined }); setErr(null);
    const r = await fetch("/api/journal/entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ habitId: h.id, date, value }) });
    if (!r.ok) { setVals((v) => ({ ...v, [h.id]: before })); setErr(`Could not save ${h.name}`); }
    else router.refresh();
  }
  return (
    <div className="list">
      {habits.map((h) => {
        const v = vals[h.id];
        return (
          <div key={h.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">{h.name}</span>
              <span className="flex items-center gap-2 text-[12px] text-ink-3">
                {v === undefined ? "Not logged" : h.kind === "scale" ? SCALE_LABELS[v] : null}
                {v !== undefined && <button type="button" onClick={() => save(h, null)} aria-label={`Clear ${h.name}`} className="pressable grid size-7 place-items-center rounded-full bg-[var(--fill-2)] text-ink-2"><Icon name="close" size={13} strokeWidth={2.6} /></button>}
              </span>
            </div>
            {h.kind === "boolean" ? (
              <div className="flex gap-2" role="group" aria-label={h.name}>
                <button type="button" aria-pressed={v === 1} className={pill(v === 1)} onClick={() => save(h, 1)}>Yes</button>
                <button type="button" aria-pressed={v === 0} className={pill(v === 0)} onClick={() => save(h, 0)}>No</button>
              </div>
            ) : h.kind === "scale" ? (
              <div className="grid grid-cols-5 gap-2" role="group" aria-label={`${h.name}, 1 very low to 5 very high`}>
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={v === n} aria-label={`${h.name} ${n}, ${SCALE_LABELS[n]}`} className={pill(v === n)} onClick={() => save(h, n)}>{n}</button>)}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button type="button" aria-label={`${h.name} minus one`} className={pill(false)} disabled={v === undefined ? false : v <= (h.min ?? 0)} onClick={() => save(h, v === undefined ? (h.min ?? 0) : Math.max(h.min ?? 0, v - 1))}>−</button>
                <span className="num min-w-[4.5rem] text-center text-[18px] font-bold" aria-live="polite">{v === undefined ? "—" : v}{v !== undefined && h.unit ? <span className="ml-1 text-[12px] font-semibold text-ink-3">{h.unit}</span> : null}</span>
                <button type="button" aria-label={`${h.name} plus one`} className={pill(false)} onClick={() => save(h, v === undefined ? 1 : Math.min(h.max ?? 10_000, v + 1))}>+</button>
              </div>
            )}
          </div>
        );
      })}
      {err && <p role="alert" className="px-4 py-2 text-[13px] text-danger">{err}</p>}
    </div>
  );
}

/** Add, rename, reorder, archive (keeps history), restore and permanently delete habits. */
export function HabitManager({ habits, archived }: { habits: JournalHabit[]; archived: JournalHabit[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HabitKind>("boolean");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/journal/habits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) setMsg("Could not save"); else router.refresh();
    return r.ok;
  };
  const field = "min-w-0 rounded-xl border border-hairline bg-[var(--track)] px-3 py-2 text-[16px] outline-none";
  return (
    <Sheet title="Manage habits" triggerLabel="Manage habits" triggerClassName="glass glass-pill pressable inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold"
      trigger={<><Icon name="grid" size={16} strokeWidth={2.2} />Habits</>}>
      <div className="flex flex-col gap-4">
        <ul className="list">
          {habits.map((h, i) => (
            <li key={h.id} className="flex items-center gap-2 py-2">
              <input aria-label={`Name of ${h.name}`} defaultValue={h.name} maxLength={40} className={cx(field, "flex-1 py-1.5 text-[15px]")}
                onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== h.name) void act({ action: "update", id: h.id, name: n, unit: h.unit }); }} />
              <button type="button" aria-label={`Move ${h.name} up`} disabled={busy || i === 0} onClick={() => act({ action: "move", id: h.id, direction: "up" })} className="pressable grid size-9 place-items-center rounded-full bg-[var(--fill-2)] disabled:opacity-30"><Icon name="chevronLeft" size={15} className="rotate-90" /></button>
              <button type="button" aria-label={`Move ${h.name} down`} disabled={busy || i === habits.length - 1} onClick={() => act({ action: "move", id: h.id, direction: "down" })} className="pressable grid size-9 place-items-center rounded-full bg-[var(--fill-2)] disabled:opacity-30"><Icon name="chevronRight" size={15} className="rotate-90" /></button>
              <button type="button" aria-label={`Archive ${h.name}`} disabled={busy} onClick={() => act({ action: "archive", id: h.id })} className="pressable grid size-9 place-items-center rounded-full bg-[var(--fill-2)] text-ink-2"><Icon name="eyeOff" size={15} /></button>
            </li>
          ))}
        </ul>
        <form className="flex flex-col gap-2 rounded-2xl bg-[var(--fill)] p-3" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && (await act({ action: "create", name, kind, unit: kind === "number" ? unit || null : null }))) { setName(""); setUnit(""); } }}>
          <span className="text-[13px] font-semibold">Add a habit</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name, e.g. Meditation" aria-label="New habit name" className={field} />
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as HabitKind)} aria-label="Habit type" className={cx(field, "flex-1")}>
              <option value="boolean">Yes / no</option><option value="number">Amount</option><option value="scale">Scale 1–5</option>
            </select>
            {kind === "number" && <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={16} placeholder="Unit" aria-label="Unit" className={cx(field, "w-24")} />}
          </div>
          <button type="submit" disabled={busy || !name.trim()} className="pressable rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">Add</button>
        </form>
        {archived.length > 0 && (
          <div>
            <p className="mb-1 text-[13px] font-semibold text-ink-3">Archived (history kept)</p>
            <ul className="list">
              {archived.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-[15px]">
                  <span>{h.name}</span>
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => act({ action: "restore", id: h.id })} className="pressable rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold">Restore</button>
                    <button type="button" disabled={busy} onClick={() => { if (confirm(`Delete ${h.name} and all its entries permanently?`)) void act({ action: "delete", id: h.id }); }} className="pressable rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold text-danger">Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {msg && <p role="alert" className="text-[13px] text-danger">{msg}</p>}
        <p className="text-[12px] text-ink-3">Archiving hides a habit and keeps its history. Deleting removes the habit and every entry.</p>
      </div>
    </Sheet>
  );
}
