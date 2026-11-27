"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

/** Starts a background sync and polls status until it finishes, then refreshes server components. */
export function SyncButton({ label }: { label?: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const r = await fetch("/api/sync", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r && !r.running) {
        setRunning(false);
        router.refresh();
      }
    }, 2500);
    return () => clearInterval(id);
  }, [running, router]);

  async function start() {
    setError(null);
    setRunning(true);
    const r = await fetch("/api/sync", { method: "POST" }).catch(() => null);
    if (!r || !r.ok) { setRunning(false); setError("Sync failed to start"); }
  }

  return (
    <button onClick={start} disabled={running} aria-label={label ?? "Sync now"} title={error ?? undefined}
      className="glass pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-70" style={{ borderRadius: 999 }}>
      <Icon name="sync" size={16} strokeWidth={2} className={running ? "animate-spin [animation-duration:1.4s]" : ""} />
      {running ? "Syncing" : label ?? "Sync"}
    </button>
  );
}
