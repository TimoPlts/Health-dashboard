import { notFound } from "next/navigation";
import { ctx } from "@/server/views";
import { workoutDetail } from "@/server/analytics/workouts";
import { Badge, Glass, Label, LargeTitle, Page, SectionHeader, Value } from "@/ui/kit";
import { ExcludeToggle } from "@/ui/controls";
import { HrChart } from "@/ui/charts/HrChart";
import { fmtDuration, fmtNumber, fmtTime } from "@/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workout · Baseline" };
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = ctx();
  const d = workoutDetail(c.db, decodeURIComponent(id), c.tz);
  if (!d) notFound();
  const { workout: w, stats, load } = d;
  const low = stats.sampleCount > 0 && stats.coverage < 0.8;
  const zoneTotal = load ? load.zoneMinutes.reduce((a, b) => a + b, 0) + load.belowMinutes : 0;

  return (
    <Page accent="load">
      <LargeTitle back={{ href: "/training", label: "Training" }} eyebrow={dayFmt.format(w.startMs)} title={w.title} />
      <div className="mb-4 flex flex-wrap items-center gap-2 px-1">
        <span className="num text-[14px] text-ink-2">{fmtTime(w.startMs, c.tz)} – {fmtTime(w.endMs, c.tz)}</span>
        {w.excluded && <Badge tone="warn">Excluded from analytics</Badge>}
        {w.tooShort && <Badge>Too short to analyse</Badge>}
      </div>

      <Glass thick className="rise grid grid-cols-3 gap-y-4 p-5">
        <div><Label>Duration</Label><Value value={fmtDuration(w.durationMin, { compact: true })} size="sm" /></div>
        <div><Label icon="heart" tone="heart">Avg HR</Label><Value value={stats.avgBpm !== null ? String(Math.round(stats.avgBpm)) : "—"} unit="bpm" size="sm" /></div>
        <div><Label>Max HR</Label><Value value={stats.maxBpm !== null ? String(stats.maxBpm) : "—"} unit="bpm" size="sm" /></div>
        <div><Label>Min HR</Label><Value value={stats.minBpm !== null ? String(stats.minBpm) : "—"} unit="bpm" size="sm" /></div>
        <div><Label tone="load" icon="bolt">Load</Label><Value value={load ? String(Math.round(load.trimp)) : "—"} unit="TRIMP" size="sm" /></div>
        <div><Label icon="flame" tone="activity">Energy</Label><Value value={w.calories ? fmtNumber(w.calories.kcal) : "—"} unit="kcal" size="sm" /></div>
      </Glass>

      <SectionHeader>Heart rate</SectionHeader>
      <Glass className="p-4">
        <HrChart samples={d.timeline} startMs={w.startMs} endMs={w.endMs} fromMs={w.startMs - d.preMs} toMs={w.endMs + d.postMs} timeZone={c.tz}
          bands={d.googleZones?.bands} height={190} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3 tabular">
          <span>{stats.sampleCount} samples</span>
          {stats.medianIntervalS !== null && <span>~{fmtNumber(stats.medianIntervalS)} s resolution</span>}
          <span>{Math.round(stats.coverage * 100)}% coverage</span>
          {low && <Badge tone="warn">Partial data — averages may be biased</Badge>}
        </div>
        {(d.recovery.drop60 !== null || d.recovery.drop120 !== null) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
            <div><Label>HR recovery · 1 min</Label><Value value={d.recovery.drop60 !== null ? `−${d.recovery.drop60}` : "—"} unit="bpm" size="sm" /></div>
            <div><Label>HR recovery · 2 min</Label><Value value={d.recovery.drop120 !== null ? `−${d.recovery.drop120}` : "—"} unit="bpm" size="sm" /></div>
          </div>
        )}
      </Glass>

      {load && (
        <>
          <SectionHeader>Zones</SectionHeader>
          <Glass className="flex flex-col gap-2.5 p-4">
            {load.zoneMinutes.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 text-[13px] font-bold">Z{i + 1}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--fill)]"><div className="h-full rounded-full" style={{ width: `${zoneTotal ? (m / zoneTotal) * 100 : 0}%`, background: `var(--z${i + 1})` }} /></div>
                <span className="num w-14 text-right text-[13px] font-semibold">{fmtDuration(m, { compact: true })}</span>
              </div>
            ))}
            <p className="mt-1 text-[12px] text-ink-3">% of HRmax {d.hrMax ? `${Math.round(d.hrMax.hrMax)} bpm (${d.hrMax.source === "override" ? "your setting" : "220 − age, as Google uses"})` : ""}{d.googleZones ? " · shaded bands in the chart are Google's zones" : ""}</p>
          </Glass>
        </>
      )}

      {d.history.length > 0 && (
        <>
          <SectionHeader>Compared with earlier {w.title.toLowerCase()}</SectionHeader>
          <Glass className="p-4">
            <div className="flex items-center justify-between pb-2 text-[12px] font-semibold text-ink-3"><span>Date</span><span className="flex gap-4"><span>Time</span><span>Avg HR</span><span className="w-12 text-right">Load</span></span></div>
            <div className="flex items-center justify-between rounded-xl bg-[var(--fill)] px-2 py-2.5 text-[14px]">
              <span className="font-semibold">This workout</span>
              <span className="num flex gap-4 font-semibold"><span>{fmtDuration(w.durationMin, { compact: true })}</span><span>{stats.avgBpm !== null ? `${Math.round(stats.avgBpm)} bpm` : "—"}</span><span className="w-12 text-right">{load ? Math.round(load.trimp) : "—"}</span></span>
            </div>
            <div className="list mt-1">
              {d.history.slice(0, 5).map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span className="text-ink-2">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(h.startMs)}</span>
                  <span className="num flex gap-4 font-semibold"><span>{fmtDuration(h.durationMin, { compact: true })}</span><span>{h.avgHr !== null ? `${Math.round(h.avgHr)} bpm` : "—"}</span><span className="w-12 text-right">{h.trimp !== null ? Math.round(h.trimp) : "—"}</span></span>
                </div>
              ))}
            </div>
          </Glass>
        </>
      )}

      <SectionHeader>Sources</SectionHeader>
      <Glass className="list overflow-hidden">
        {w.sources.map((s) => (
          <div key={s.sessionId} className="flex items-center justify-between px-4 py-3 text-[14px]">
            <span className="font-semibold">{s.label}</span>
            {w.calories?.source === s.label && <Badge>Calories</Badge>}
          </div>
        ))}
      </Glass>
      <p className="mt-2 px-1 text-[12px] leading-snug text-ink-3">
        Overlapping sessions of the same type are shown as one workout. Heart-rate statistics use the Fitbit Air samples across the whole session. Calories are the provider&apos;s estimate.
      </p>
      <div className="mt-5 flex justify-center"><ExcludeToggle sessionIds={w.sources.map((s) => s.sessionId)} excluded={w.excluded} /></div>
    </Page>
  );
}
