"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABEL, WORKOUT_CATEGORIES, type WorkoutCategory } from "@/lib/metrics/workout-labels";
import { Sheet } from "./controls";
import { Icon } from "./icons";
import { cx } from "./kit";

interface Label { name: string | null; category: WorkoutCategory | null; effort: number | null }

/** Edit a workout's name, category and effort (1–10). Provider data is never changed. */
export function WorkoutLabelSheet({ sessionIds, label, defaultName }: { sessionIds: string[]; label: Label | null; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(label?.name ?? "");
  const [category, setCategory] = useState<WorkoutCategory | null>(label?.category ?? null);
  const [effort, setEffort] = useState<number | null>(label?.effort ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (body: Label) => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/workouts/label", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionIds, ...body }) });
    setBusy(false);
    if (!r.ok) { setErr("Could not save"); return false; }
    router.refresh();
    return true;
  };
  const chip = (on: boolean) => cx("pressable rounded-full px-3 py-1.5 text-[14px] font-semibold", on ? "bg-ink text-bg" : "bg-[var(--fill-2)] text-ink");
  return (
    <Sheet title="Label workout" triggerClassName="glass glass-pill pressable inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold"
      trigger={<><Icon name="grid" size={16} strokeWidth={2.2} />{label ? "Edit label" : "Label"}</>}>
      {(close) => (
      <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (await save({ name: name.trim() || null, category, effort })) close(); }}>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={defaultName} autoComplete="off"
            className="rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-2.5 text-[16px] font-normal outline-none" />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-semibold">Category</legend>
          <div className="flex flex-wrap gap-2">
            {WORKOUT_CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} className={chip(category === c)} onClick={() => setCategory(category === c ? null : c)}>{CATEGORY_LABEL[c]}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-semibold">Effort <span className="font-normal text-ink-3">· how hard it felt, 1 very easy – 10 maximal</span></legend>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={effort === n} aria-label={`Effort ${n}`} className={cx("pressable num rounded-xl py-2.5 text-[16px] font-semibold", effort === n ? "bg-[var(--load)] text-white" : "bg-[var(--fill-2)] text-ink")}
                onClick={() => setEffort(effort === n ? null : n)}>{n}</button>
            ))}
          </div>
        </fieldset>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="pressable flex-1 rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          {label && <button type="button" disabled={busy} className="pressable rounded-full bg-[var(--fill-2)] px-4 py-2.5 text-[15px] font-semibold text-danger"
            onClick={async () => { if (await save({ name: null, category: null, effort: null })) { setName(""); setCategory(null); setEffort(null); close(); } }}>Remove label</button>}
        </div>
        <p className="text-[12px] text-ink-3">Labels are stored in Baseline only. Google&apos;s workout data is not changed.</p>
      </form>
      )}
    </Sheet>
  );
}
