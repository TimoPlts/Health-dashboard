import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hasAnyData } from "@/server/queries";
import { ctx, parseDate, todayView } from "@/server/views";
import { METRICS, GROUP_LABEL } from "@/server/analytics/registry";
import { Badge, Calibrating, Delta, Glass, Label, LargeTitle, Page, Row, SectionHeader, Value, cx, toneVar } from "@/ui/kit";
import { Ring } from "@/ui/charts/Ring";
import { Spark } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { Hypnogram } from "@/ui/charts/Hypnogram";
import { DateNav } from "@/ui/controls";
import { Icon } from "@/ui/icons";
import { fmtDayLong, fmtDuration, fmtNumber, fmtTime } from "@/ui/format";
import { SyncStatus } from "@/ui/SyncStatus";
import { TodayCustomizer } from "@/ui/TodayCustomizer";
import { GOAL_TONE, STATUS_TEXT, formatGoalValue, formatTarget } from "@/ui/goal-format";
import { db } from "@/server/db/client";
import type { TodayCardId } from "@/lib/today-layout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Baseline" };

const READINESS_COPY = {
  ready: { title: "Ready to train", body: "HRV, resting heart rate and load are all within your normal range." },
  caution: { title: "Train with care", body: "One marker is outside your normal range. Keep intensity moderate." },
  recover: { title: "Prioritise recovery", body: "Several markers are outside your normal range. An easy day would fit." },
} as const;

type View = ReturnType<typeof todayView>;
type Vital = View["vitals"][number];

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (!hasAnyData(db())) redirect("/settings?welcome=1");
  const v = todayView(parseDate(sp.date, ctx().today));
  const cards: Record<TodayCardId, ReactNode> = {
    hero: <Hero v={v} />,
    goals: <GoalsCard v={v} />,
    lastNight: <LastNight v={v} />,
    favorites: v.favorites.length ? (
      <section>
        <SectionHeader>Favourites</SectionHeader>
        <div className="grid grid-cols-2 gap-3">{v.favorites.map((x, i) => <VitalTile key={x.def.id} x={x} i={i} />)}</div>
      </section>
    ) : null,
    vitals: (
      <section>
        <SectionHeader href="/health">Vitals</SectionHeader>
        <div className="grid grid-cols-2 gap-3">{v.vitals.map((x, i) => <VitalTile key={x.def.id} x={x} i={i} />)}</div>
      </section>
    ),
    activity: <Activity v={v} />,
    journal: <JournalCard v={v} />,
    workouts: <Workouts v={v} />,
  };
  const visible = v.layout.order.filter((id) => !v.layout.hidden.includes(id) && cards[id] !== null);

  return (
    <Page accent="recovery">
      <LargeTitle eyebrow={fmtDayLong(v.date)} title={v.date === v.today ? "Today" : "Summary"}
        trailing={<>
          <Link href={`/timeline${v.date !== v.today ? `?date=${v.date}` : ""}`} transitionTypes={["nav-forward"]} aria-label="Timeline of this day" className="glass glass-pill pressable grid size-10 place-items-center text-ink-2"><Icon name="clock" size={20} /></Link>
          <Link href={`/calendar${v.date !== v.today ? `?month=${v.date.slice(0, 7)}` : ""}`} transitionTypes={["nav-forward"]} aria-label="Calendar" className="glass glass-pill pressable grid size-10 place-items-center text-ink-2"><Icon name="calendar" size={20} /></Link>
          <Link href="/settings" transitionTypes={["nav-forward"]} aria-label="Settings" className="glass glass-pill pressable grid size-10 place-items-center text-ink-2"><Icon name="settings" size={20} /></Link>
        </>} />
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <DateNav date={v.date} today={v.today} earliest={v.earliest} />
        <SyncStatus />
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        {visible.map((id) => <div key={id} className={cx(id === "hero" && "lg:col-span-2")}>{cards[id]}</div>)}
      </div>
      <div className="mt-6 flex justify-center">
        <TodayCustomizer layout={v.layout} metrics={METRICS.map((m) => ({ id: m.id, label: m.short ?? m.label, group: GROUP_LABEL[m.group] }))} />
      </div>
    </Page>
  );
}

function Hero({ v }: { v: View }) {
  const { day } = v;
  const rec = day.recovery, sleep = day.sleepScore, load = day.strain, ready = day.readiness;
  const loadRef = Math.max(120, ...(day.acwr.series.slice(-28).map((x) => x.acute ?? 0)).map((a) => a * 2));
  return (
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
  );
}

function GoalsCard({ v }: { v: View }) {
  if (v.date !== v.today) return null;
  return (
    <section>
      <SectionHeader href="/goals">Goals</SectionHeader>
      {v.goals.length ? (
        <Glass className="rise grid grid-cols-2 gap-x-3 gap-y-4 p-4 sm:grid-cols-4">
          {v.goals.map((g) => {
            const clock = g.def.kind !== "atLeast";
            const frac = !clock && g.current.value !== null ? Math.min(1, g.current.value / g.target) : null;
            return (
              <Link key={g.def.id} href="/goals" transitionTypes={["nav-forward"]} className="pressable flex items-center gap-2.5">
                <Ring value={clock ? (g.current.status === "met" ? 1 : null) : frac} max={1} color={toneVar(GOAL_TONE[g.def.id])} size={44} stroke={5}
                  label={`${g.def.label}: ${STATUS_TEXT[g.current.status]}`}><span className="text-[10px] font-bold">{clock ? (g.current.status === "met" ? "✓" : "") : frac !== null ? `${Math.round(frac * 100)}` : ""}</span></Ring>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-ink-3">{g.def.label}</span>
                  <span className="num block truncate text-[14px] font-semibold">{formatGoalValue(g.def.id, g.current.value)} <span className="text-[11px] text-ink-3">/ {formatTarget(g.def.id, g.target)}</span></span>
                </span>
              </Link>
            );
          })}
        </Glass>
      ) : (
        <Link href="/goals" transitionTypes={["nav-forward"]} className="glass pressable flex items-center justify-between p-4 text-[14px]">
          <span><span className="block font-semibold">Set your goals</span><span className="text-[12px] text-ink-3">Steps, sleep, bedtime, Zone 2, Active Zone Minutes…</span></span>
          <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
        </Link>
      )}
    </section>
  );
}

function LastNight({ v }: { v: View }) {
  const { day } = v;
  return (
    <section>
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
    </section>
  );
}

function VitalTile({ x, i }: { x: Vital; i: number }) {
  const dev = x.value !== null && x.base ? x.value - x.base.mean : null;
  const fmt = x.def.clock ? "clock" : x.def.unit === "h" && x.def.group === "sleep" ? "hours" : "number";
  return (
    <Link href={`/metric/${x.def.id}`} transitionTypes={["nav-forward"]} className={cx("glass pressable rise flex flex-col gap-2 p-3.5", `rise-${Math.min(4, i + 1)}`)}>
      <Label tone={x.def.tone} icon={x.def.group === "heart" ? "heart" : x.def.id === "respiratory_rate" ? "lungs" : x.def.id === "spo2" ? "drop" : x.def.group === "sleep" ? "sleep" : x.def.group === "activity" ? "steps" : "thermo"}>{x.def.short ?? x.def.label}</Label>
      <div className="flex items-end justify-between gap-1">
        <Value className="whitespace-nowrap" value={x.value === null ? "—" : formatValue(x.value, fmt, x.def.decimals, x.def.clockBase ?? 0)} unit={fmt === "number" ? x.def.unit : undefined} />
        <Spark values={x.spark} color={toneVar(x.def.tone)} width={58} height={24} />
      </div>
      <div className="h-4 text-[12px]">
        {x.base ? <Delta value={dev} digits={x.def.decimals} unit={x.def.unit} suffix="vs baseline" />
          : x.calibrating ? <span className="text-ink-3">Baseline {x.calibrating.have}/14 days</span> : <span className="text-ink-4">{x.def.baseline ? "No baseline" : " "}</span>}
      </div>
    </Link>
  );
}

function Activity({ v }: { v: View }) {
  return (
    <section>
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
    </section>
  );
}

function JournalCard({ v }: { v: View }) {
  const j = v.journal;
  return (
    <section>
      <SectionHeader href={`/journal${v.date !== v.today ? `?date=${v.date}` : ""}`}>Journal</SectionHeader>
      <Link href={`/journal${v.date !== v.today ? `?date=${v.date}` : ""}`} transitionTypes={["nav-forward"]} className="glass pressable rise flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--recovery)_18%,transparent)] text-recovery"><Icon name="check" size={18} strokeWidth={2.4} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{j.logged === 0 ? (v.date === v.today ? "Log today's habits" : "Log habits for this day") : `${j.logged} of ${j.habits} logged`}</span>
          <span className="block text-[12px] text-ink-3">Caffeine, alcohol, stress, stretching, … — a few taps</span>
        </span>
        <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
      </Link>
    </section>
  );
}

function Workouts({ v }: { v: View }) {
  return (
    <section>
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
    </section>
  );
}
