import Link from "next/link";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getConnection } from "@/server/connections";
import { getSyncOverview, getToday } from "@/server/queries";
import { Badge, Glass, MetricLabel, PageTitle, SectionLabel, Stat, cx } from "@/ui/primitives";
import { Icon, type IconName } from "@/ui/icons";
import { Hypnogram, StageLegend } from "@/ui/charts/Hypnogram";
import { Ring, Sparkline } from "@/ui/charts/simple";
import { fmtDateShort, fmtDayLong, fmtDuration, fmtNumber, fmtRelative, fmtSignedNumber, fmtTime } from "@/ui/format";
import { SyncButton } from "@/ui/SyncButton";

export const dynamic = "force-dynamic";

const STEP_GOAL = 10_000; // TODO(settings): user-configurable activity goals

export default function TodayPage() {
  const d = db();
  const tz = env().HOME_TIME_ZONE;
  const today = getToday(d);
  const sync = getSyncOverview(d);
  const googleConnected = getConnection(d, "google")?.status === "connected";
  const lastSync = Math.max(sync.lastSuccess.google ?? 0, sync.lastSuccess.hevy ?? 0) || null;
  const weekDates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${today.date}T00:00:00Z`) - (6 - i) * 86_400_000).toISOString().slice(0, 10));
  const { sleep, vitals, activity } = today;

  return (
    <>
      <PageTitle
        eyebrow={<span className="flex items-center gap-1.5">{fmtDayLong(today.date)}</span>}
        title="Today"
        trailing={
          <div className="flex flex-col items-end gap-1 pb-1">
            <SyncButton />
            <span className="text-[11px] font-medium text-ink-3">Synced {fmtRelative(lastSync)}</span>
          </div>
        }
      />

      {!googleConnected && !sleep && vitals.restingHr === null && (
        <Glass className="mb-4 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-heart"><Icon name="link" /></span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">Connect Google Health</h2>
              <p className="mt-1 text-[14px] leading-snug text-ink-2">Sleep, heart rate and activity from your Fitbit Air appear here after the first sync.</p>
              <Link href="/settings" className="pressable mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-bg">Open connections</Link>
            </div>
          </div>
        </Glass>
      )}

      {/* Last night ------------------------------------------------------------------------------ */}
      <Glass className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <MetricLabel icon="sleep" tone="var(--sleep)">Last night</MetricLabel>
            <div className="mt-1.5">
              <Stat size="xl" value={sleep?.minutesAsleep != null ? fmtDuration(sleep.minutesAsleep, { compact: true }) : "—"} />
            </div>
            <p className="mt-1 text-[13px] text-ink-2 tabular">
              {sleep ? <>{fmtTime(sleep.startMs, tz)} – {fmtTime(sleep.endMs, tz)} · {fmtDuration(sleep.timeInBedMin, { compact: true })} in bed</> : "No sleep recorded for last night"}
            </p>
          </div>
          {sleep?.efficiency != null && (
            <Ring value={sleep.efficiency} max={100} color="var(--sleep)" size={76} stroke={8} label={`Sleep efficiency ${Math.round(sleep.efficiency)} percent`}>
              <div>
                <div className="text-[18px] font-semibold leading-none tabular">{Math.round(sleep.efficiency)}<span className="text-[11px] text-ink-2">%</span></div>
                <div className="mt-0.5 text-[10px] font-medium text-ink-3">efficiency</div>
              </div>
            </Ring>
          )}
        </div>
        {sleep && sleep.stages.length > 0 && (
          <div className="mt-5 space-y-4">
            <Hypnogram segments={sleep.stages} startMs={sleep.startMs} endMs={sleep.endMs} timeZone={tz} height={104} />
            <StageLegend minutes={sleep.stageMinutes} />
          </div>
        )}
        {sleep && sleep.stages.length === 0 && <p className="mt-3 text-[13px] text-ink-3">No stage data for this session.</p>}
      </Glass>

      {/* Vitals ---------------------------------------------------------------------------------- */}
      <SectionLabel>Overnight vitals</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <VitalTile icon="heart" tone="var(--heart)" label="Resting HR" value={fmtNumber(vitals.restingHr)} unit="bpm" spark={today.trends.restingHr} dates={weekDates} />
        <VitalTile icon="pulse" tone="var(--recovery)" label="HRV" value={fmtNumber(vitals.hrv)} unit="ms" spark={today.trends.hrv} dates={weekDates} />
        <VitalTile icon="drop" tone="var(--strength)" label="SpO₂" value={fmtNumber(vitals.spo2, 1)} unit="%" />
        <VitalTile icon="lungs" tone="var(--sleep)" label="Respiration" value={fmtNumber(vitals.respiratoryRate, 1)} unit="br/min" />
        <VitalTile icon="thermo" tone="var(--activity)" label="Skin temp" value={fmtSignedNumber(vitals.skinTempDeviation)} unit="°C vs baseline" wide />
      </div>

      {/* Activity -------------------------------------------------------------------------------- */}
      <SectionLabel>Activity</SectionLabel>
      <Glass className="flex items-center gap-5 p-5">
        <Ring value={activity.steps} max={STEP_GOAL} color="var(--activity)" size={104} stroke={11} label={`Steps ${activity.steps ?? "unknown"} of ${STEP_GOAL}`}>
          <div>
            <div className="text-[20px] font-semibold leading-none tabular">{activity.steps !== null ? fmtNumber(activity.steps) : "—"}</div>
            <div className="mt-1 text-[10px] font-medium text-ink-3">of {fmtNumber(STEP_GOAL)} steps</div>
          </div>
        </Ring>
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3">
          <Kv label="Distance" value={activity.distanceM !== null ? fmtNumber(activity.distanceM / 1000, 2) : "—"} unit="km" />
          <Kv label="Zone minutes" value={fmtNumber(activity.azm)} unit="AZM" />
          <Kv label="Active energy" value={fmtNumber(activity.activeKcal)} unit="kcal" est />
          <Kv label="Total energy" value={fmtNumber(activity.totalKcal)} unit="kcal" est />
        </dl>
      </Glass>

      {/* Workouts -------------------------------------------------------------------------------- */}
      <SectionLabel href="/training">Recent workouts</SectionLabel>
      {today.workouts.length === 0 ? (
        <Glass className="p-5 text-[14px] text-ink-2">No Hevy workouts imported yet.</Glass>
      ) : (
        <Glass className="divide-y divide-[var(--hairline)] overflow-hidden">
          {today.workouts.map((w) => (
            <Link key={w.id} href={`/training/${encodeURIComponent(w.id)}`} className="pressable flex items-center gap-4 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--strength)_16%,transparent)] text-strength"><Icon name="training" size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-semibold">{w.title}</div>
                <div className="text-[13px] text-ink-2 tabular">{fmtDateShort(w.startMs, tz)} · {fmtDuration((w.endMs - w.startMs) / 60000, { compact: true })} · {fmtNumber(w.volume.volumeKg)} kg</div>
              </div>
              <div className="text-right">
                <div className={cx("text-[15px] font-semibold tabular", w.hr.avg === null && "text-ink-3")}>{w.hr.avg !== null ? `${Math.round(w.hr.avg)}` : "—"}<span className="ml-0.5 text-[11px] font-medium text-ink-2">bpm</span></div>
                <div className="text-[11px] text-ink-3">avg HR</div>
              </div>
              <span className="text-ink-3"><Icon name="chevronRight" size={16} /></span>
            </Link>
          ))}
        </Glass>
      )}
    </>
  );
}

function VitalTile({ icon, tone, label, value, unit, spark, dates, wide }: {
  icon: IconName; tone: string; label: string; value: string; unit: string; spark?: { date: string; value: number }[]; dates?: string[]; wide?: boolean;
}) {
  return (
    <Glass className={cx("p-4", wide && "col-span-2")}>
      <MetricLabel icon={icon} tone={tone}>{label}</MetricLabel>
      <div className="mt-2 flex items-end justify-between gap-2">
        <Stat value={value} unit={unit} />
        {spark && dates && <Sparkline points={spark} dates={dates} color={tone} />}
      </div>
    </Glass>
  );
}

function Kv({ label, value, unit, est }: { label: string; value: string; unit: string; est?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] font-medium text-ink-2">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5"><Stat size="sm" value={value} unit={unit} />{est && value !== "—" && <Badge>est.</Badge>}</dd>
    </div>
  );
}
