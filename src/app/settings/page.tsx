import { db } from "@/server/db/client";
import { env, isDemoMode } from "@/server/env";
import { getSyncOverview } from "@/server/queries";
import { isSyncRunning } from "@/server/sync/run";
import { Badge, Glass, PageTitle, SectionLabel } from "@/ui/primitives";
import { fmtRelative } from "@/ui/format";
import { SyncButton } from "@/ui/SyncButton";
import { ConnectGoogle, DisconnectButton, HevyKeyForm, LogoutButton } from "./actions";

export const dynamic = "force-dynamic";

const STREAM_LABELS: Record<string, string> = {
  "heart-rate": "Heart rate (intraday)", "heart-rate-variability": "HRV samples", "oxygen-saturation": "SpO₂ samples",
  "respiratory-rate-sleep-summary": "Respiratory rate (sleep)", sleep: "Sleep sessions", exercise: "Exercise sessions", steps: "Steps",
  distance: "Distance", "active-energy-burned": "Active energy", "basal-energy-burned": "Resting energy", "active-zone-minutes": "Active Zone Minutes",
  "active-minutes": "Active minutes", "time-in-heart-rate-zone": "Time in HR zones", "sedentary-period": "Sedentary periods",
  "daily-resting-heart-rate": "Resting heart rate", "daily-heart-rate-variability": "Daily HRV", "daily-oxygen-saturation": "Daily SpO₂",
  "daily-respiratory-rate": "Daily respiratory rate", "daily-sleep-temperature-derivations": "Skin temperature", "daily-vo2-max": "Cardio fitness (VO₂ max)",
  "daily-heart-rate-zones": "Personal HR zones", weight: "Weight", "body-fat": "Body fat", "vo2-max": "VO₂ max samples",
  workouts: "Workouts", exercise_templates: "Exercise templates",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const d = db();
  const o = getSyncOverview(d);
  const conn = (p: string) => o.connections.find((c) => c.provider === p);
  const google = conn("google"), hevy = conn("hevy");
  const e = env();
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const hevyConnected = hevy?.status === "connected" || (!hevy && Boolean(e.HEVY_API_KEY));

  return (
    <>
      <PageTitle title="Settings" trailing={<div className="pb-1"><SyncButton label="Sync now" /></div>} />

      {sp.error && <Glass className="mb-4 p-4 text-[14px] text-danger" as="div">{sp.error}</Glass>}
      {sp.connected && <Glass className="mb-4 p-4 text-[14px] text-recovery" as="div">Connected. The initial import runs in the background.</Glass>}
      {isDemoMode() && <Glass className="mb-4 p-4 text-[14px] text-warn" as="div">Demo mode uses a separate database with fictional data. Connections are disabled.</Glass>}

      <SectionLabel>Connected accounts</SectionLabel>
      <Glass className="divide-y divide-[var(--hairline)]">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">Google Health</h2>
              <p className="text-[13px] text-ink-2">Fitbit Air · sleep, heart, activity</p>
            </div>
            <StatusBadge status={google?.status} />
          </div>
          {google?.lastError && <p className="mt-2 text-[13px] text-danger">{google.lastError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!googleConfigured ? (
              <p className="text-[13px] text-ink-2">Google OAuth client not configured yet. Run <code className="font-mono text-[12px]">npm run configure -- google</code> in a terminal (see docs/SETUP_GOOGLE.md), then restart the app.</p>
            ) : google?.status === "connected" ? (
              <DisconnectButton provider="google" />
            ) : (
              <ConnectGoogle reconnect={google?.status === "reauth_required"} disabled={isDemoMode()} />
            )}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Last successful sync {fmtRelative(o.lastSuccess.google)}</p>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">Hevy</h2>
              <p className="text-[13px] text-ink-2">Workouts, sets and exercises · requires Hevy Pro</p>
            </div>
            <StatusBadge status={hevyConnected ? "connected" : hevy?.status} />
          </div>
          {hevy?.lastError && <p className="mt-2 text-[13px] text-danger">{hevy.lastError}</p>}
          <div className="mt-3">{hevyConnected && hevy ? <DisconnectButton provider="hevy" /> : <HevyKeyForm disabled={isDemoMode()} />}</div>
          <p className="mt-2 text-[12px] text-ink-3">Last successful sync {fmtRelative(o.lastSuccess.hevy)}</p>
        </div>
      </Glass>

      <SectionLabel>Data streams</SectionLabel>
      <Glass className="overflow-hidden">
        {o.streams.length === 0 ? (
          <p className="p-5 text-[14px] text-ink-2">Nothing synced yet{isSyncRunning() ? " — a sync is running." : "."}</p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {o.streams.map((s) => (
              <li key={`${s.provider}:${s.stream}`} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{STREAM_LABELS[s.stream] ?? s.stream}</div>
                  <div className="truncate text-[12px] text-ink-3">
                    {s.provider === "google" ? "Google Health" : "Hevy"} · {s.rowsTotal.toLocaleString("en-GB")} rows · {fmtRelative(s.lastSuccessAt)}
                  </div>
                  {s.lastError && <div className="mt-0.5 line-clamp-2 text-[12px] text-danger">{s.lastError}</div>}
                </div>
                {s.lastError ? <Badge tone="danger">Error</Badge> : s.lastSuccessAt ? <Badge tone="ok">OK</Badge> : <Badge>Pending</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Glass>

      <SectionLabel>Privacy</SectionLabel>
      <Glass className="p-5 text-[13px] leading-relaxed text-ink-2">
        Data is stored only in your private local database ({isDemoMode() ? "data/demo.db (fictional)" : e.DATABASE_PATH}), outside OneDrive and the repository. Provider credentials are encrypted at rest (AES-256-GCM).
        Nothing is sent to analytics or AI services. Export and full deletion are planned for a later milestone (see docs/ROADMAP.md).
        <div className="mt-4"><LogoutButton /></div>
      </Glass>
    </>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  if (status === "connected") return <Badge tone="ok">Connected</Badge>;
  if (status === "reauth_required") return <Badge tone="warn">Reconnect needed</Badge>;
  if (status === "error") return <Badge tone="danger">Error</Badge>;
  return <Badge>Not connected</Badge>;
}
