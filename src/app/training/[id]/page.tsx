import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getWorkoutDetail } from "@/server/queries";
import { Badge, Glass, MetricLabel, SectionLabel, Stat } from "@/ui/primitives";
import { Icon } from "@/ui/icons";
import { HrChart } from "@/ui/charts/HrChart";
import { ZoneBars } from "@/ui/charts/simple";
import { fmtDateShort, fmtDuration, fmtNumber, fmtSignedNumber, fmtTime } from "@/ui/format";
import { estimateOneRepMax } from "@/lib/metrics/strength";

export const dynamic = "force-dynamic";

const ZONE_LABELS: Record<string, string> = { below: "Below", light: "Light", moderate: "Moderate", vigorous: "Vigorous", peak: "Peak" };

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = getWorkoutDetail(db(), decodeURIComponent(id));
  if (!w) notFound();
  const tz = env().HOME_TIME_ZONE;
  const { stats } = w.hr;
  const durMin = (w.endMs - w.startMs) / 60000;
  const lowCoverage = stats.sampleCount > 0 && stats.coverage < 0.8;

  return (
    <>
      <header className="safe-top pb-4">
        <Link href="/training" className="pressable -ml-1 inline-flex items-center gap-0.5 text-[16px] font-medium text-strength">
          <Icon name="chevronLeft" size={22} strokeWidth={2.2} /> Training
        </Link>
        <h1 className="mt-3 font-display text-[30px] leading-[1.1] font-bold tracking-[-0.02em]">{w.title}</h1>
        <p className="mt-1 text-[14px] text-ink-2 tabular">{fmtDateShort(w.startMs, tz)} · {fmtTime(w.startMs, tz)}–{fmtTime(w.endMs, tz)}</p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Glass className="p-4"><MetricLabel>Duration</MetricLabel><div className="mt-1.5"><Stat size="sm" value={fmtDuration(durMin, { compact: true })} /></div></Glass>
        <Glass className="p-4"><MetricLabel>Volume</MetricLabel><div className="mt-1.5"><Stat size="sm" value={fmtNumber(w.volume.volumeKg)} unit="kg" /></div></Glass>
        <Glass className="p-4"><MetricLabel>Sets</MetricLabel><div className="mt-1.5"><Stat size="sm" value={String(w.volume.workingSets)} /></div></Glass>
      </div>

      <SectionLabel>Heart rate · Fitbit Air</SectionLabel>
      <Glass className="p-5">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div><MetricLabel icon="heart" tone="var(--heart)">Average</MetricLabel><div className="mt-1"><Stat value={stats.avgBpm !== null ? String(Math.round(stats.avgBpm)) : "—"} unit="bpm" /></div></div>
          <div><MetricLabel>Max</MetricLabel><div className="mt-1"><Stat value={stats.maxBpm !== null ? String(stats.maxBpm) : "—"} unit="bpm" /></div></div>
          <div><MetricLabel>Min</MetricLabel><div className="mt-1"><Stat value={stats.minBpm !== null ? String(stats.minBpm) : "—"} unit="bpm" /></div></div>
        </div>
        <HrChart samples={w.hr.timeline} startMs={w.startMs} endMs={w.endMs} fromMs={w.startMs - 5 * 60_000} toMs={w.endMs + 10 * 60_000} timeZone={tz} bands={w.hr.zones?.bands} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2 tabular">
          <span>{stats.sampleCount} samples</span>
          {stats.medianIntervalS !== null && <span>~{fmtNumber(stats.medianIntervalS)} s resolution</span>}
          <span>{Math.round(stats.coverage * 100)}% coverage</span>
          {lowCoverage && <Badge tone="warn">Partial data — averages may be biased</Badge>}
        </div>
        {(w.hr.recovery.drop60 !== null || w.hr.recovery.drop120 !== null) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
            <div><MetricLabel>HR recovery 1 min</MetricLabel><div className="mt-1"><Stat size="sm" value={w.hr.recovery.drop60 !== null ? `−${w.hr.recovery.drop60}` : "—"} unit="bpm" /></div></div>
            <div><MetricLabel>HR recovery 2 min</MetricLabel><div className="mt-1"><Stat size="sm" value={w.hr.recovery.drop120 !== null ? `−${w.hr.recovery.drop120}` : "—"} unit="bpm" /></div></div>
          </div>
        )}
      </Glass>

      {w.hr.zones && (
        <>
          <SectionLabel>Time in zones · Google Health zones</SectionLabel>
          <Glass className="p-5">
            <ZoneBars seconds={w.hr.zones.seconds} order={["below", ...w.hr.zones.bands.map((b) => b.name)]} labels={ZONE_LABELS} />
          </Glass>
        </>
      )}

      {w.googleSession && (
        <p className="mt-3 px-1 text-[12px] leading-snug text-ink-3">
          Google Health also recorded a {w.googleSession.exerciseType.toLowerCase().replace(/_/g, " ")} session overlapping this workout
          {typeof w.googleSession.caloriesKcal === "number" ? ` (${Math.round(w.googleSession.caloriesKcal)} kcal, provider estimate)` : ""}. It is shown for reference and not added to any total.
        </p>
      )}

      <SectionLabel>Exercises</SectionLabel>
      <div className="space-y-3">
        {w.exercises.map((e) => (
          <Glass key={e.idx} className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[16px] font-semibold">{e.title}</h3>
              {e.primaryMuscle && <span className="text-[12px] font-medium capitalize text-ink-3">{e.primaryMuscle.replace(/_/g, " ")}</span>}
            </div>
            <table className="mt-3 w-full text-[14px] tabular">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="pb-1.5 font-semibold">Set</th><th className="pb-1.5 font-semibold">Weight</th><th className="pb-1.5 font-semibold">Reps</th><th className="pb-1.5 text-right font-semibold">e1RM</th>
                </tr>
              </thead>
              <tbody>
                {e.sets.map((s, i) => {
                  const e1 = estimateOneRepMax({ setType: s.setType, weightKg: s.weightKg, reps: s.reps });
                  const workingNo = e.sets.slice(0, i + 1).filter((x) => x.setType !== "warmup").length;
                  return (
                    <tr key={s.idx} className="border-t border-hairline">
                      <td className="py-1.5">{s.setType === "warmup" ? <span className="text-ink-3">W</span> : s.setType === "dropset" ? "D" : s.setType === "failure" ? "F" : workingNo}</td>
                      <td className="py-1.5">{s.weightKg !== null ? `${fmtNumber(s.weightKg, s.weightKg % 1 ? 1 : 0)} kg` : s.durationS !== null ? fmtDuration(s.durationS / 60, { compact: true }) : "—"}</td>
                      <td className="py-1.5">{s.reps ?? "—"}{s.rpe !== null && <span className="ml-1.5 text-[12px] text-ink-3">@{s.rpe}</span>}</td>
                      <td className="py-1.5 text-right text-ink-2">{e1 !== null ? `${fmtNumber(e1, 1)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Glass>
        ))}
      </div>

      {w.previous && (
        <>
          <SectionLabel>Compared with last time</SectionLabel>
          <Link href={`/training/${encodeURIComponent(w.previous.id)}`} className="block">
            <Glass className="pressable flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="text-[13px] text-ink-2">{fmtDateShort(w.previous.startMs, tz)}</div>
                <div className="truncate text-[16px] font-semibold">{w.previous.title}</div>
              </div>
              <div className="text-right tabular">
                <div className="text-[15px] font-semibold">{fmtSignedNumber(w.volume.volumeKg - w.previous.volume.volumeKg, 0)} kg</div>
                <div className="text-[11px] text-ink-3">volume difference</div>
              </div>
            </Glass>
          </Link>
        </>
      )}
    </>
  );
}
