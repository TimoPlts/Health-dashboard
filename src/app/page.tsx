import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAnyData } from "@/server/queries";
import { ctx, parseDate, todayView } from "@/server/views";
import { Badge, Calibrating, Delta, Glass, Label, LargeTitle, Page, Row, SectionHeader, Value, cx, toneVar } from "@/ui/kit";
import { Ring } from "@/ui/charts/Ring";
import { Spark } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { Hypnogram } from "@/ui/charts/Hypnogram";
import { DateNav } from "@/ui/controls";
import { Icon } from "@/ui/icons";
import { fmtDayLong, fmtDuration, fmtNumber, fmtTime } from "@/ui/format";
import { SyncStatus } from "@/ui/SyncStatus";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Baseline" };

const READINESS_COPY = {
  ready: { title: "Ready to train", body: "HRV, resting heart rate and load are all within your normal range." },
  caution: { title: "Train with care", body: "One marker is outside your normal range. Keep intensity moderate." },
  recover: { title: "Prioritise recovery", body: "Several markers are outside your normal range. An easy day would fit." },
} as const;

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (!hasAnyData(db())) redirect("/settings?welcome=1");
  const v = todayView(parseDate(sp.date, ctx().today));
  const { day } = v;
  const rec = day.recovery;
  const sleep = day.sleepScore;
  const load = day.strain;
  const loadRef = Math.max(120, ...(day.acwr.series.slice(-28).map((x) => x.acute ?? 0)).map((a) => a * 2));
  const ready = day.readiness;

  return (
    <Page accent="recovery">
      <LargeTitle eyebrow={fmtDayLong(v.date)} title={v.date === v.today ? "Today" : "Summary"}
        trailing={<Link href="/settings" transitionTypes={["nav-forward"]} aria-label="Settings" className="glass glass-pill pressable grid size-10 place-items-center text-ink-2"><Icon name="settings" size={20} /></Link>} />
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <DateNav date={v.date} today={v.today} earliest={v.earliest} />
        <SyncStatus />
      </div>

      {/* Hero: the three numbers that matter */}
      <Glass thick className="rise px-4 pt-5 pb-4">
        <div className="grid grid-cols-3 items-start gap-1">
          <Link href={`/metric/recovery`} transitionTypes={["nav-forward"]} className="pressable flex flex-col items-center gap-2">
            <Ring value={rec.status === "ok" ? rec.score : null} color={toneVar("recovery")} size={104} stroke={10} label={rec.status === "ok" ? `Recovery ${Math.round(rec.score)}` : "Recovery calibrating"}>
              {rec.status === "ok" ? <Value value={String(Math.round(rec.score))} size="lg" /> : rec.status === "calibrating"
                ? <span className="num text-[15px] font-semibold text-ink-3">{rec.hrv?.have ?? 0}/14</span>
                : <span className="text-[22px] text-ink-4">—</span>}
            </Ring>
            <span className="text-[13px] font-semibold text-ink-2">Recovery</span>
          </Link>
          <Link href={`/sleep${v.date !== v.today ? `?date=${v.date}` : ""}`} transitionTypes={["tab"]} className="pressable flex flex-col items-center gap-2">
            <Ring value={sleep ? sleep.score : null} color={toneVar("sleep")} size={104} stroke={10} label={sleep ? `Sleep score ${Math.round(sleep.score)}` : "No sleep recorded"}>
              {sleep ? <Value value={String(Math.round(sleep.score))} size="lg" /> : <span className="text-[22px] text-ink-4">—</span>}
            </Ring>
            <span className="text-[13px] font-semibold text-ink-2">Sleep</span>
          </Link>
          <Link href={`/metric/strain`} transitionTypes={["nav-forward"]} className="pressable flex flex-col items-center gap-2">
            <Ring value={load} max={loadRef} color={toneVar("load")} size={104} stroke={10} label={load !== null ? `Cardio load ${Math.round(load)}` : "No heart-rate data"}>
              {load !== null ? <Value value={String(Math.round(load))} size="lg" /> : <span className="text-[22px] text-ink-4">—</span>}
            </Ring>
            <span className="text-[13px] font-semibold text-ink-2">{v.date === v.today ? "Load so far" : "Load"}</span>
          </Link>
        </div>

        <div className="mt-5 border-t border-hairline pt-4">
          {ready.status === "ok" ? (
            <div className="flex items-start gap-3">
              <span className={cx("mt-0.5 size-2.5 shrink-0 rounded-full", ready.level === "ready" ? "bg-ok" : ready.level === "caution" ? "bg-warn" : "bg-danger")} aria-hidden="true" />
              <div>
                <p className="text-[16px] font-semibold">{READINESS_COPY[ready.level].title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{READINESS_COPY[ready.level].body}</p>
              </div>
            </div>
          ) : ready.status === "calibrating" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[15px] font-semibold">Learning your normal</p>
              <p className="text-[13px] leading-snug text-ink-2">Recovery and readiness compare each night with your own 28-day baseline. They appear after 14 nights of HRV and resting heart rate — no guesses before then.</p>
              <Calibrating have={ready.have} need={ready.need} what="HRV baseline" compact />
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{ready.reason}</p>
          )}
          {day.flags.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {day.flags.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5 rounded-2xl bg-[var(--fill)] px-3 py-2.5">
                  <span className="mt-px text-warn"><Icon name="alert" size={16} strokeWidth={2.2} /></span>
                  <span className="min-w-0"><span className="block text-[14px] font-semibold">{f.label}</span><span className="block text-[12px] leading-snug text-ink-3">{f.detail}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Glass>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      <div>
      {/* Last night */}
      <SectionHeader href={`/sleep${v.date !== v.today ? `?date=${v.date}` : ""}`}>Last night</SectionHeader>
      <Glass className="rise rise-1 p-4">
        {day.night ? (
          <>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <Label icon="sleep" tone="sleep">Time asleep</Label>
                <div className="mt-1"><Value value={fmtDuration(day.night.minutesAsleep, { compact: true })} size="lg" /></div>
              </div>
              <div className="text-right text-[13px] text-ink-3 tabular">
                {fmtTime(day.night.startMs, v.tz)} – {fmtTime(day.night.endMs, v.tz)}
                {day.sleepDebtMin !== null && day.sleepDebtNights >= 3 && <div className="mt-0.5 font-semibold text-ink-2">Debt {fmtDuration(day.sleepDebtMin, { compact: true })} <span className="font-normal text-ink-3">· 7 nights</span></div>}
              </div>
            </div>
            <Hypnogram segments={v.sleepStages} startMs={day.night.startMs} endMs={day.night.endMs} timeZone={v.tz} height={88} />
          </>
        ) : <p className="py-4 text-center text-[14px] text-ink-3">No sleep recorded for this night.</p>}
      </Glass>

      </div>
      <div>
      {/* Vitals */}
      <SectionHeader href="/health">Vitals</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        {v.vitals.map((x, i) => {
          const dev = x.value !== null && x.base ? x.value - x.base.mean : null;
          return (
            <Link key={x.def.id} href={`/metric/${x.def.id}`} transitionTypes={["nav-forward"]} className={cx("glass pressable rise flex flex-col gap-2 p-3.5", `rise-${Math.min(4, i + 1)}`)}>
              <Label tone={x.def.tone} icon={x.def.group === "heart" ? "heart" : x.def.id === "respiratory_rate" ? "lungs" : x.def.id === "spo2" ? "drop" : "thermo"}>{x.def.short ?? x.def.label}</Label>
              <div className="flex items-end justify-between gap-1">
                <Value value={x.value === null ? "—" : formatValue(x.value, "number", x.def.decimals)} unit={x.def.unit} />
                <Spark values={x.spark} color={toneVar(x.def.tone)} width={58} height={24} />
              </div>
              <div className="h-4 text-[12px]">
                {x.base ? <Delta value={dev} digits={x.def.decimals} unit={x.def.unit} suffix="vs baseline" />
                  : x.calibrating ? <span className="text-ink-3">Baseline {x.calibrating.have}/14 days</span> : <span className="text-ink-4">No baseline</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Activity */}
      <SectionHeader href="/metric/steps">Activity</SectionHeader>
      <Glass className="rise list overflow-hidden">
        {[
          { id: "steps", icon: "steps" as const, v: fmtNumber(v.activity.steps), u: "" },
          { id: "active_kcal", icon: "flame" as const, v: fmtNumber(v.activity.activeKcal), u: "kcal", est: true },
          { id: "total_kcal", icon: "flame" as const, v: fmtNumber(v.activity.totalKcal), u: "kcal", est: true },
          { id: "azm", icon: "heart" as const, v: fmtNumber(v.activity.azm), u: "AZM" },
          { id: "zone2", icon: "bolt" as const, v: fmtNumber(v.zone2), u: "min" },
          { id: "distance", icon: "steps" as const, v: fmtNumber(v.activity.distance, 2), u: "km" },
        ].map((r) => (
          <Row key={r.id} href={`/metric/${r.id}`} icon={r.icon} tone={r.id === "azm" ? "heart" : r.id === "zone2" ? "load" : "activity"}
            title={<span>{r.id === "steps" ? "Steps" : r.id === "active_kcal" ? "Active energy" : r.id === "total_kcal" ? "Total energy" : r.id === "azm" ? "Active Zone Minutes" : r.id === "zone2" ? "Zone 2" : "Distance"}{r.est ? <span className="ml-1.5 align-middle"><Badge>est.</Badge></span> : null}</span>}
            trailing={<Value value={r.v} unit={r.u} size="sm" />} />
        ))}
      </Glass>

      </div>
      </div>
      {/* Workouts */}
      <SectionHeader href="/training">Workouts</SectionHeader>
      {v.workouts.length ? (
        <Glass className="list overflow-hidden">
          {v.workouts.map((w) => (
            <Row key={w.id} href={`/training/${encodeURIComponent(w.id)}`} icon={w.type.includes("WALK") || w.type.includes("RUN") ? "steps" : "bolt"} tone="load" title={w.title}
              subtitle={`${fmtTime(w.startMs, v.tz)} · ${fmtDuration(w.durationMin, { compact: true })}${w.hr?.stats.avgBpm ? ` · avg ${Math.round(w.hr.stats.avgBpm)} bpm` : ""}${w.excluded ? " · excluded" : ""}`}
              trailing={w.hr?.load ? <Value value={String(Math.round(w.hr.load.trimp))} unit="load" size="sm" /> : undefined} />
          ))}
        </Glass>
      ) : <Glass className="p-4 text-center text-[14px] text-ink-3">No workouts recorded on this day.</Glass>}
    </Page>
  );
}
