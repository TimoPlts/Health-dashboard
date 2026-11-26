"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const btn = "pressable inline-flex items-center justify-center rounded-full px-4 py-2 text-[14px] font-semibold disabled:opacity-50";

export function ConnectGoogle({ reconnect, disabled }: { reconnect?: boolean; disabled?: boolean }) {
  // Full-page navigation: the OAuth flow must leave the app.
  return disabled ? (
    <button className={`${btn} bg-ink text-bg`} disabled>{reconnect ? "Reconnect" : "Connect"} Google Health</button>
  ) : (
    <a href="/api/auth/google/start" className={`${btn} bg-ink text-bg`}>{reconnect ? "Reconnect" : "Connect"} Google Health</a>
  );
}

export function DisconnectButton({ provider }: { provider: "google" | "hevy" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className={`${btn} bg-[var(--track)] text-danger`} disabled={busy}
      onClick={async () => {
        if (!confirm("Disconnect and delete the stored credentials? Imported data is kept.")) return;
        setBusy(true);
        await fetch(`/api/connections/${provider}/disconnect`, { method: "POST" });
        router.refresh();
        setBusy(false);
      }}>
      Disconnect
    </button>
  );
}

export function HevyKeyForm({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setMsg(null);
        const r = await fetch("/api/connections/hevy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) setMsg(j.error ?? "Failed"); else { setKey(""); router.refresh(); }
      }}>
      <label className="sr-only" htmlFor="hevy-key">Hevy API key</label>
      <input id="hevy-key" type="password" autoComplete="off" spellCheck={false} placeholder="Hevy API key (hevy.com → Settings → Developer)"
        value={key} onChange={(e) => setKey(e.target.value)} disabled={disabled || busy}
        className="min-w-0 flex-1 rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-2.5 text-[15px] outline-none focus:border-strength" />
      <button className={`${btn} bg-ink text-bg`} disabled={disabled || busy || key.length < 30}>{busy ? "Checking…" : "Connect"}</button>
      {msg && <p className="text-[13px] text-danger sm:basis-full">{msg}</p>}
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className={`${btn} bg-[var(--track)] text-ink`} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}>
      Log out
    </button>
  );
}

/** Owner preferences: sleep need, HRmax override, automatic sync interval. */
export function PrefsForm({ sleepNeedMin, hrMaxOverride, autoSyncMinutes, googleHrMax, disabled }: { sleepNeedMin: number; hrMaxOverride: number | null; autoSyncMinutes: number; googleHrMax: number | null; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    router.refresh();
  };
  const sel = "rounded-xl bg-[var(--fill-2)] px-3 py-2 text-[15px] font-semibold outline-none disabled:opacity-50";
  return (
    <div className="list">
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Sleep need</span><span className="text-[12px] text-ink-3">Used for sleep score, debt and recovery · 7–9 h recommended</span></span>
        <select className={sel} disabled={disabled || busy} defaultValue={sleepNeedMin} onChange={(e) => save({ sleepNeedMin: Number(e.target.value) })}>
          {[420, 450, 480, 510, 540].map((m) => <option key={m} value={m}>{Math.floor(m / 60)} h {m % 60 ? `${m % 60} min` : ""}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Maximum heart rate</span><span className="text-[12px] text-ink-3">{googleHrMax ? `Google uses ${googleHrMax} bpm (220 − age)` : "Google profile age not available yet"}</span></span>
        <select className={sel} disabled={disabled || busy} defaultValue={hrMaxOverride ?? ""} onChange={(e) => save({ hrMaxOverride: e.target.value ? Number(e.target.value) : null })}>
          <option value="">As Google</option>
          {Array.from({ length: 61 }, (_, i) => 160 + i).map((b) => <option key={b} value={b}>{b} bpm</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Automatic sync</span><span className="text-[12px] text-ink-3">While the Baseline server is running</span></span>
        <select className={sel} disabled={disabled || busy} defaultValue={autoSyncMinutes} onChange={(e) => save({ autoSyncMinutes: Number(e.target.value) })}>
          <option value={0}>Off</option>
          {[15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>Every {m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
        </select>
      </label>
    </div>
  );
}
