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
