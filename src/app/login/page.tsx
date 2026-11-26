"use client";

import { useState } from "react";
import { Icon } from "@/ui/icons";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-[85dvh] place-items-center">
      <form
        className="glass w-full max-w-[360px] p-7"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          const r = await fetch("/api/auth/login", { method: "POST", body: new FormData(e.currentTarget) });
          if (r.ok) window.location.href = "/";
          else { setError((await r.json().catch(() => ({}))).error ?? "Login failed"); setBusy(false); }
        }}>
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--heart)_16%,transparent)] text-heart"><Icon name="pulse" /></span>
          <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">Pulse</h1>
        </div>
        <label htmlFor="password" className="text-[13px] font-medium text-ink-2">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus
          className="mt-1.5 w-full rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-3 text-[16px] outline-none focus:border-strength" />
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        <button disabled={busy} className="pressable mt-5 w-full rounded-full bg-ink py-3 text-[15px] font-semibold text-bg disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
