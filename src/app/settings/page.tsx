import { db } from "@/server/db/client";
import { env, isDemoMode } from "@/server/env";
import { getSyncOverview } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { schedulerState } from "@/server/sync/scheduler";
import { isSyncRunning } from "@/server/sync/run";
import { serverStatus } from "@/server/server-status";
import { Badge, Glass, LargeTitle, Page, SectionHeader } from "@/ui/kit";
import { fmtRelative } from "@/ui/format";
import { SyncStatus } from "@/ui/SyncStatus";
import { ConnectGoogle, DataControls, DisconnectButton, HevyKeyForm, LogoutButton, PrefsForm } from "./actions";
import { listBackups } from "@/server/data/backup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Baseline" };

const STREAM_LABELS: Record<string, string> = {
  "heart-rate": "Heart rate (3-second samples)", "heart-rate-variability": "HRV samples", "oxygen-saturation": "SpO₂ samples",
  "respiratory-rate-sleep-summary": "Breathing rate during sleep", sleep: "Sleep sessions", exercise: "Exercise sessions", steps: "Steps",
  distance: "Distance", "active-energy-burned": "Active energy", "basal-energy-burned": "Resting energy", "active-zone-minutes": "Active Zone Minutes",
  "active-minutes": "Active minutes", "time-in-heart-rate-zone": "Time in heart-rate zones", "activity-level": "Activity level", "sedentary-period": "Sedentary periods",
  floors: "Floors", altitude: "Altitude", "swim-lengths-data": "Swim lengths",
  "daily-resting-heart-rate": "Resting heart rate", "daily-heart-rate-variability": "Nightly HRV", "daily-oxygen-saturation": "Nightly SpO₂",
  "daily-respiratory-rate": "Nightly breathing rate", "daily-sleep-temperature-derivations": "Skin temperature", "daily-vo2-max": "Cardio fitness (VO₂ max)",
  "daily-heart-rate-zones": "Personal heart-rate zones", "total-calories:daily-rollup": "Total energy (daily)", "calories-in-heart-rate-zone:daily-rollup": "Energy per heart-rate zone",
  "heart-rate:daily-rollup": "Daily heart-rate summary", weight: "Weight", "body-fat": "Body fat", height: "Height", "vo2-max": "VO₂ max samples", "run-vo2-max": "Running VO₂ max",
  "blood-glucose": "Blood glucose", "core-body-temperature": "Body temperature", workouts: "Workouts", exercise_templates: "Exercise templates",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const d = db();
  const o = getSyncOverview(d);
  const s = getSettings(d);
  const sched = schedulerState();
  const conn = (p: string) => o.connections.find((c) => c.provider === p);
  const google = conn("google"), hevy = conn("hevy");
  const e = env();
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const hevyConnected = hevy?.status === "connected" || (!hevy && Boolean(e.HEVY_API_KEY));
  const errors = o.streams.filter((x) => x.lastError).length;
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: e.HOME_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const srv = serverStatus();
  const backups = isDemoMode() ? [] : listBackups();

  return (
    <Page>
      <LargeTitle back={{ href: "/", label: "Today" }} title="Settings" />

      {sp.welcome && <Glass className="mb-4 p-4 text-[14px]" as="div"><strong>Welcome to Baseline.</strong> Connect Google Health to import your Fitbit Air data.</Glass>}
      {sp.error && <Glass className="mb-4 p-4 text-[14px] text-danger" as="div">{sp.error}</Glass>}
      {sp.deleted && <Glass className="mb-4 p-4 text-[14px] text-ok" as="div">All Baseline data was deleted and Google access was revoked.</Glass>}
      {sp.connected && <Glass className="mb-4 p-4 text-[14px] text-ok" as="div">Connected. The initial import runs in the background.</Glass>}
      {isDemoMode() && <Glass className="mb-4 p-4 text-[14px] text-warn" as="div">Demo mode uses a separate database with fictional data. Connections are disabled.</Glass>}

      <SectionHeader action={<SyncStatus variant="button" />}>Sync</SectionHeader>
      <Glass className="list overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 text-[15px]"><span className="font-semibold">Last successful sync</span><span className="text-ink-2">{fmtRelative(o.lastSuccess.google)}</span></div>
        <div className="flex items-center justify-between px-4 py-3 text-[15px]"><span className="font-semibold">Next automatic sync</span>
          <span className="text-ink-2">{isSyncRunning() ? "Running now" : sched.nextRunAt ? timeFmt.format(sched.nextRunAt) : s.autoSyncMinutes ? "After server start" : "Off"}</span></div>
        <div className="flex items-center justify-between px-4 py-3 text-[15px]"><span className="font-semibold">Data streams</span>
          <span>{errors ? <Badge tone="danger">{errors} with errors</Badge> : <Badge tone="ok">{o.streams.length} healthy</Badge>}</span></div>
      </Glass>

      <SectionHeader>Server</SectionHeader>
      <Glass className="list overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]"><span className="font-semibold">Status</span>
          <span>{srv.supervised ? <Badge tone="ok">Running · auto-restart</Badge> : <Badge>{srv.mode}</Badge>}</span></div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]"><span className="font-semibold">Running since</span><span className="text-ink-2">{fmtRelative(srv.startedAt)}{srv.restarts ? ` · ${srv.restarts} restart${srv.restarts === 1 ? "" : "s"}` : ""}</span></div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]"><span className="shrink-0 font-semibold">iPhone address</span>
          <span className="min-w-0 truncate text-right text-ink-2">{srv.publicUrl ? srv.publicUrl.replace(/^https:\/\//, "") : "Not set up"}</span></div>
      </Glass>

      <SectionHeader>Personal</SectionHeader>
      <Glass className="overflow-hidden">
        <PrefsForm sleepNeedMin={s.sleepNeedMin} hrMaxOverride={s.hrMaxOverride} autoSyncMinutes={s.autoSyncMinutes} googleHrMax={s.profileAge ? 220 - s.profileAge : null} disabled={isDemoMode()} />
      </Glass>

      <SectionHeader>Connections</SectionHeader>
      <Glass className="list overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-[16px] font-semibold">Google Health</h3><p className="text-[13px] text-ink-3">Fitbit Air · heart, sleep, activity, vitals</p></div>
            <StatusBadge status={google?.status} />
          </div>
          {google?.lastError && <p className="mt-2 text-[13px] text-danger">{google.lastError}</p>}
          {google?.status === "reauth_required" && <p className="mt-2 text-[13px] text-ink-2">Google needs you to sign in again. Your data stays; reconnecting resumes syncing.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!googleConfigured ? (
              <p className="text-[13px] text-ink-2">Google OAuth client not configured. Run <code className="font-mono text-[12px]">npm run configure -- google</code> (docs/SETUP_GOOGLE.md).</p>
            ) : google?.status === "connected" ? <DisconnectButton provider="google" /> : <ConnectGoogle reconnect={google?.status === "reauth_required"} disabled={isDemoMode()} />}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-[16px] font-semibold">Hevy <span className="align-middle"><Badge>Optional</Badge></span></h3><p className="text-[13px] text-ink-3">Exercises, sets and weights · needs Hevy Pro</p></div>
            <StatusBadge status={hevyConnected ? "connected" : hevy?.status} />
          </div>
          {hevy?.lastError && <p className="mt-2 text-[13px] text-danger">{hevy.lastError}</p>}
          <p className="mt-2 text-[13px] text-ink-3">Not required. Without it, workouts come from Google Health (Fitbit + Hevy&apos;s Apple Health entries).</p>
          <div className="mt-3">{hevyConnected && hevy ? <DisconnectButton provider="hevy" /> : <HevyKeyForm disabled={isDemoMode()} />}</div>
        </div>
      </Glass>

      <SectionHeader>Your data</SectionHeader>
      <Glass className="overflow-hidden">
        <DataControls lastBackupAt={backups[0]?.createdAt ?? null} backupCount={backups.length} backupKeep={s.backupKeep} rawRetentionDays={s.rawRetentionDays} disabled={isDemoMode()} />
      </Glass>

      <SectionHeader>Data streams</SectionHeader>
      <Glass className="list overflow-hidden">
        {o.streams.length === 0 ? <p className="p-4 text-[14px] text-ink-2">Nothing synced yet.</p> : o.streams.map((x) => (
          <div key={`${x.provider}:${x.stream}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{STREAM_LABELS[x.stream] ?? x.stream}</div>
              <div className="truncate text-[12px] text-ink-3">{x.provider === "google" ? "Google Health" : "Hevy"} · {x.rowsTotal.toLocaleString("en-GB")} rows · {fmtRelative(x.lastSuccessAt)}</div>
              {x.lastError && <div className="mt-0.5 line-clamp-2 text-[12px] text-danger">{x.lastError}</div>}
            </div>
            {x.lastError ? <Badge tone="danger">Error</Badge> : x.lastSuccessAt ? (x.rowsTotal ? <Badge tone="ok">OK</Badge> : <Badge>No data</Badge>) : <Badge>Pending</Badge>}
          </div>
        ))}
      </Glass>

      <SectionHeader>Privacy</SectionHeader>
      <Glass className="p-4 text-[13px] leading-relaxed text-ink-2">
        Your data lives only in a local database ({isDemoMode() ? "data/demo.db, fictional" : "outside OneDrive and the repository"}). Provider credentials are encrypted at rest. Nothing is sent to analytics or AI services.
        <div className="mt-4"><LogoutButton /></div>
      </Glass>
    </Page>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  if (status === "connected") return <Badge tone="ok">Connected</Badge>;
  if (status === "reauth_required") return <Badge tone="warn">Reconnect</Badge>;
  if (status === "error") return <Badge tone="danger">Error</Badge>;
  return <Badge>Not connected</Badge>;
}
