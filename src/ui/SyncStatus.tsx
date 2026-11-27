"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";
import { cx } from "./kit";

interface Status {
  running: boolean;
  lastSuccess: { google: number | null; hevy: number | null };
  schedule: { nextRunAt: number | null; intervalMinutes: number };
  connections: { provider: string; status: string; lastError: string | null }[];
}

const rel = (ms: number | null) => {
  if (!ms) return "never";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};

/** Compact sync capsule: last sync, live spinner, tap to sync now. Polls only while a sync runs. */
export function SyncStatus({ variant = "pill" }: { variant?: "pill" | "button" }) {
  const router = useRouter();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/sync", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setSt(r);
    return r as Status | null;
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!(busy || st?.running)) return;
    const id = setInterval(async () => {
      const r = await load();
      if (r && !r.running) { setBusy(false); router.refresh(); }
    }, 2000);
    return () => clearInterval(id);
  }, [busy, st?.running, load, router]);

  const google = st?.connections.find((c) => c.provider === "google");
  const needsAuth = google && google.status !== "connected";
  const running = busy || st?.running;
  const label = running ? "Syncing…" : needsAuth ? "Reconnect Google" : `Synced ${rel(st?.lastSuccess.google ?? null)}`;
  return (
    <button type="button" disabled={running}
      onClick={async () => { if (needsAuth) { router.push("/settings"); return; } setBusy(true); await fetch("/api/sync", { method: "POST" }).catch(() => setBusy(false)); }}
      className={cx("glass glass-pill pressable inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold", needsAuth ? "text-danger" : "text-ink-2")}
      aria-label={`${label}. Sync now`} title={st?.schedule.nextRunAt ? `Next automatic sync ${new Date(st.schedule.nextRunAt).toLocaleTimeString()}` : undefined}>
      <Icon name={needsAuth ? "alert" : "sync"} size={15} strokeWidth={2.2} className={running ? "animate-spin [animation-duration:1.2s]" : ""} />
      {variant === "pill" ? label : "Sync now"}
    </button>
  );
}
