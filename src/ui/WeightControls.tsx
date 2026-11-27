"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./controls";
import { Icon } from "./icons";

/** Log a weigh-in. Defaults to now; decimal keyboard on iPhone. */
export function AddWeight({ today, nowTime, lastKg }: { today: string; nowTime: string; lastKg: number | null }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowTime);
  const [kg, setKg] = useState(lastKg ? lastKg.toFixed(1) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "w-full rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-2.5 text-[16px] outline-none";
  return (
    <Sheet title="Log weight" triggerLabel="Log weight" triggerClassName="glass glass-pill pressable inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold"
      trigger={<><Icon name="body" size={16} strokeWidth={2.2} />Log</>}>
      {(close) => (
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          const r = await fetch("/api/weight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, time, kg: Number(kg.replace(",", ".")) }) });
          const j = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) { setErr(j.error ?? "Could not save"); return; }
          router.refresh(); close();
        }}>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">Weight (kg)
            <input className={field} inputMode="decimal" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 74.6" aria-label="Weight in kilograms" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">Date<input type="date" className={field} max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">Time<input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} /></label>
          </div>
          {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
          <button type="submit" disabled={busy || !kg} className="pressable rounded-full bg-ink py-2.5 text-[15px] font-semibold text-bg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          <p className="text-[12px] text-ink-3">Weigh at a similar time each day (e.g. after waking) for a steadier trend. Entries stay in Baseline; Google is read-only.</p>
        </form>
      )}
    </Sheet>
  );
}

export function DeleteWeight({ tMs, label }: { tMs: number; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} aria-label={`Delete manual entry ${label}`} className="pressable grid size-8 place-items-center rounded-full bg-[var(--fill-2)] text-ink-3"
      onClick={async () => {
        if (!confirm(`Delete the manual entry ${label}?`)) return;
        setBusy(true);
        await fetch("/api/weight", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ tMs }) });
        setBusy(false); router.refresh();
      }}>
      <Icon name="close" size={13} strokeWidth={2.6} />
    </button>
  );
}

/** Target weight (optional). Progress uses the smoothed trend, never a single weigh-in. */
export function WeightGoal({ targetKg }: { targetKg: number | null }) {
  const router = useRouter();
  const [v, setV] = useState(targetKg ? String(targetKg) : "");
  const [busy, setBusy] = useState(false);
  const save = async (val: number | null) => {
    setBusy(true);
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goals: { weightKg: val } }) });
    setBusy(false); router.refresh();
  };
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(v.replace(",", ".")); if (n >= 30 && n <= 300) void save(Math.round(n * 10) / 10); }}>
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="Target kg" aria-label="Target weight in kilograms"
        className="w-28 rounded-xl border border-hairline bg-[var(--track)] px-3 py-2 text-right text-[16px] outline-none" />
      <button type="submit" disabled={busy || !v} className="pressable rounded-full bg-ink px-3.5 py-2 text-[14px] font-semibold text-bg disabled:opacity-50">Save</button>
      {targetKg !== null && <button type="button" disabled={busy} onClick={() => { setV(""); void save(null); }} className="pressable rounded-full bg-[var(--fill-2)] px-3 py-2 text-[14px] font-semibold">Clear</button>}
    </form>
  );
}
