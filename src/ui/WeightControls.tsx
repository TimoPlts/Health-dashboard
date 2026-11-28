"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
