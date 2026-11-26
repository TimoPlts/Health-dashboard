"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/ui/controls";

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

/** Data ownership: backups, retention, export, download, delete everything. */
export function DataControls({ lastBackupAt, backupCount, backupKeep, rawRetentionDays, disabled }: { lastBackupAt: number | null; backupCount: number; backupKeep: number; rawRetentionDays: number; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const post = async (url: string, what: string, ok: (j: Record<string, unknown>) => string) => {
    setBusy(what); setMsg(null);
    const r = await fetch(url, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(null);
    setMsg(r.ok ? { tone: "ok", text: ok(j) } : { tone: "danger", text: String(j.error ?? "Failed") });
    router.refresh();
  };
  const save = async (patch: Record<string, unknown>) => {
    setBusy("prefs");
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(null); router.refresh();
  };
  const sel = "rounded-xl bg-[var(--fill-2)] px-3 py-2 text-[15px] font-semibold outline-none disabled:opacity-50";
  const ago = lastBackupAt ? fmtAgo(lastBackupAt) : "never";
  return (
    <div className="list">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Backups</span><span className="text-[12px] text-ink-3">Last {ago} · {backupCount} on this PC</span></span>
        <button className={`${btn} shrink-0 bg-[var(--track)] text-ink`} disabled={disabled || busy !== null} onClick={() => post("/api/data/backup", "backup", () => "Backup saved on this PC.")}>{busy === "backup" ? "Backing up…" : "Back up now"}</button>
      </div>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Automatic backups</span><span className="text-[12px] text-ink-3">Daily, after a sync. Restore on the PC with npm run data -- restore</span></span>
        <select className={sel} disabled={disabled || busy !== null} defaultValue={backupKeep} onChange={(e) => save({ backupKeep: Number(e.target.value) })}>
          <option value={0}>Off</option>
          {[7, 14, 30].map((n) => <option key={n} value={n}>Keep {n}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Raw API responses</span><span className="text-[12px] text-ink-3">A cache of what Google sent. Your measurements are always kept.</span></span>
        <select className={sel} disabled={disabled || busy !== null} defaultValue={rawRetentionDays} onChange={(e) => save({ rawRetentionDays: Number(e.target.value) })}>
          {[30, 90, 365].map((n) => <option key={n} value={n}>{n} days</option>)}
          <option value={0}>Forever</option>
        </select>
      </label>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Export all data</span><span className="text-[12px] text-ink-3">CSV files on this PC, removed after 7 days</span></span>
        <button className={`${btn} shrink-0 bg-[var(--track)] text-ink`} disabled={disabled || busy !== null} onClick={() => post("/api/data/export", "export", (j) => `Exported to ${String(j.dir)}`)}>{busy === "export" ? "Exporting…" : "Export"}</button>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[15px] font-semibold">Daily summary</span><span className="text-[12px] text-ink-3">Every metric per day, as one CSV</span></span>
        {disabled ? <span className={`${btn} shrink-0 bg-[var(--track)] text-ink opacity-50`}>Download</span>
          : <a href="/api/data/daily-summary" download className={`${btn} shrink-0 bg-[var(--track)] text-ink`}>Download</a>}
      </div>
      <div className="px-4 py-3">
        <DeleteAllData disabled={disabled} />
      </div>
      {msg && <p role="status" className={`px-4 pb-3 text-[13px] break-all ${msg.tone === "ok" ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

function fmtAgo(ms: number) {
  const h = Math.round((Date.now() - ms) / 3_600_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return h < 1 ? "just now" : h < 48 ? rtf.format(-h, "hour") : rtf.format(-Math.round(h / 24), "day");
}

function DeleteAllData({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet title="Delete all data" triggerClassName={`${btn} w-full bg-[var(--track)] text-danger`} trigger={<span>Delete all data…</span>}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        const r = await fetch("/api/data/delete-all", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, confirm: word }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setErr(j.error ?? "Failed"); return; }
        router.push("/settings?deleted=1"); router.refresh();
      }}>
        <p className="text-[14px] leading-relaxed text-ink-2">
          This permanently deletes everything Baseline stores: measurements, sleep, workouts, settings, backups, exports and logs.
          Baseline&apos;s access to your Google account is revoked. Your data at Google is not affected. This cannot be undone.
        </p>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Your Baseline password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={disabled || busy}
            className="rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-2.5 text-[15px] font-normal outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Type DELETE to confirm
          <input value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={disabled || busy}
            className="rounded-xl border border-hairline bg-[var(--track)] px-3.5 py-2.5 text-[15px] font-normal outline-none" />
        </label>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
        <button className={`${btn} bg-danger text-white`} disabled={disabled || busy || word !== "DELETE" || !password}>{busy ? "Deleting…" : "Delete everything"}</button>
      </form>
    </Sheet>
  );
}
