import Link from "next/link";
import { ctx } from "@/server/views";
import { cardioView, WHO_WEEKLY_MODERATE_MIN, type CardioWeek } from "@/server/analytics/cardio";
import { Badge, Calibrating, Glass, Label, LargeTitle, Page, Row, SectionHeader, Value, cx, toneVar } from "@/ui/kit";
import { Ring } from "@/ui/charts/Ring";
import { TrendChart } from "@/ui/charts/TrendChart";
import { Sheet } from "@/ui/controls";
import { Icon } from "@/ui/icons";
import { fmtDuration, fmtNumber, fmtTime } from "@/ui/format";
import { addDays } from "@/lib/metrics/periods";
import { CATEGORY_LABEL } from "@/lib/metrics/workout-labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cardio · Baseline" };

const weekFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const wk = (d: string) => weekFmt.format(Date.parse(`${d}T12:00:00Z`));

export default async function CardioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const v = cardioView(c.db, c.today, c.fb, c.tz, typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : undefined);
  const w = v.current;
  const isThisWeek = w.partial;
  const zoneTotal = w.zoneMin.reduce((a, b) => a + b, 0);
  const chart = (f: (x: CardioWeek) => number | null) => v.weeks.map((x) => ({ date: x.start, value: f(x) }));
  const nextWeek = addDays(v.selected, 7);

  return (
    <Page accent="heart">
      <LargeTitle back={{ href: "/training", label: "Training" }} eyebrow={isThisWeek ? `This week · ${w.daysElapsed} of 7 days complete` : `Week of ${wk(w.start)}`} title="Cardio"
        trailing={<ZoneSheet zoneBpm={v.zoneBpm} hrMax={v.hrMax?.hrMax ?? null} hrMaxSource={v.hrMax?.source ?? null} />} />
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="glass glass-pill flex items-center gap-0.5 p-1">
          <Link aria-label="Previous week" href={`/cardio?week=${addDays(v.selected, -7)}`} scroll={false} className="pressable grid size-9 place-items-center rounded-full text-ink-2"><Icon name="chevronLeft" size={18} strokeWidth={2.4} /></Link>
          <span className="min-w-[110px] px-1 text-center text-[14px] font-semibold">{wk(w.start)} – {wk(w.end)}</span>
          {nextWeek <= c.today
            ? <Link aria-label="Next week" href={`/cardio?week=${nextWeek}`} scroll={false} className="pressable grid size-9 place-items-center rounded-full text-ink-2"><Icon name="chevronRight" size={18} strokeWidth={2.4} /></Link>
            : <button aria-label="Next week" disabled className="grid size-9 place-items-center rounded-full text-ink-2 opacity-30"><Icon name="chevronRight" size={18} strokeWidth={2.4} /></button>}
        </div>
        <Link href="/settings#personal" className="text-[13px] font-semibold text-ink-2 underline decoration-[var(--hairline)] underline-offset-4">Settings</Link>
      </div>

      <Glass thick className="rise grid grid-cols-3 items-start gap-1 px-3 pt-5 pb-4">
        <GoalRing label="Zone 2" value={w.zone2Min} target={v.targets.zone2WeeklyMin} unit="min" tone="load" />
        <GoalRing label="Zone Minutes" value={w.azm} target={v.targets.azmWeekly ?? WHO_WEEKLY_MODERATE_MIN} unit="AZM" tone="heart" guideline={v.targets.azmWeekly === null} />
        <GoalRing label="Sessions" value={w.sessions} target={v.targets.cardioSessionsWeekly} unit="" tone="activity" />
        <p className="col-span-3 mt-3 text-center text-[12px] text-ink-3">
          {isThisWeek ? "So far this week." : "Complete week."} {v.targets.azmWeekly === null && `Zone Minutes ring shows the WHO guideline of ${WHO_WEEKLY_MODERATE_MIN} min a week.`} {w.hrDays < 7 && `${w.hrDays} day${w.hrDays === 1 ? "" : "s"} with heart rate.`}
        </p>
      </Glass>

      <SectionHeader>Heart-rate zones this week</SectionHeader>
      <Glass className="flex flex-col gap-2.5 p-4">
        {w.zoneMin.map((m, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-8 text-[13px] font-bold">Z{i + 1}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--fill)]"><div className="h-full rounded-full" style={{ width: `${zoneTotal ? (m / zoneTotal) * 100 : 0}%`, background: `var(--z${i + 1})` }} /></div>
            <span className="num w-16 text-right text-[13px] font-semibold">{fmtDuration(m, { compact: true })}</span>
          </div>
        ))}
        <p className="mt-1 text-[12px] text-ink-3">% of HRmax zones from all-day heart rate. Zone 2 here is 60–70 % of HRmax — an estimate, not a lab-measured aerobic threshold.</p>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
          {([["Fat burn", w.azmByZone.fatBurn], ["Cardio", w.azmByZone.cardio], ["Peak", w.azmByZone.peak]] as const).map(([k, val]) => (
            <div key={k}><div className="text-[12px] font-semibold text-ink-3">{k}</div><div className="num mt-0.5 text-[15px] font-semibold">{val === null ? "—" : fmtNumber(val)}</div></div>
          ))}
          <p className="col-span-3 text-[12px] text-ink-3">Google Active Zone Minutes by zone (heart-rate-reserve zones; cardio and peak minutes count double).</p>
        </div>
      </Glass>

      <SectionHeader>This week compared</SectionHeader>
      <Glass className="p-4">
        <div className="grid grid-cols-[1fr_repeat(3,minmax(0,4.4rem))] gap-x-2 pb-2 text-right text-[12px] font-semibold text-ink-3">
          <span className="text-left">Measure</span><span>{isThisWeek ? "So far" : "Week"}</span><span>Week before</span><span>{v.fourWeek ? `${v.fourWeek.n}-wk avg` : "4-wk avg"}</span>
        </div>
        <div className="list">
          {([
            ["Zone 2", (x) => x?.zone2Min ?? null, (m: number | null) => (m === null ? "—" : fmtDuration(m, { compact: true }))],
            ["Zone Minutes", (x) => x?.azm ?? null, (m: number | null) => (m === null ? "—" : fmtNumber(m))],
            ["Cardio sessions", (x) => x?.sessions ?? null, (m: number | null) => (m === null ? "—" : fmtNumber(m, Number.isInteger(m) ? 0 : 1))],
            ["Cardio time", (x) => x?.sessionMin ?? null, (m: number | null) => (m === null ? "—" : fmtDuration(m, { compact: true }))],
            ["Cardio load", (x) => x?.load ?? null, (m: number | null) => (m === null ? "—" : fmtNumber(m))],
            ["Resting HR", (x) => x?.restingHr ?? null, (m: number | null) => (m === null ? "—" : `${fmtNumber(m)} bpm`)],
          ] as [string, (x: Partial<CardioWeek> | null) => number | null, (m: number | null) => string][]).map(([label, get, f]) => (
            <div key={label} className="grid grid-cols-[1fr_repeat(3,minmax(0,4.4rem))] items-center gap-x-2 py-2 text-right text-[14px]">
              <span className="text-left text-ink-2">{label}</span>
              <span className="num font-semibold">{f(get(w))}</span>
              <span className="num">{f(get(v.previous))}</span>
              <span className="num">{f(get(v.fourWeek as Partial<CardioWeek> | null))}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Comparisons use complete weeks only. {isThisWeek && "This week is still in progress."}</p>
      </Glass>

      <SectionHeader>12 weeks</SectionHeader>
      <div className="flex flex-col gap-3">
        {([
          ["Zone 2 minutes per week", chart((x) => x.zone2Min), "load", "min", v.targets.zone2WeeklyMin],
          ["Active Zone Minutes per week", chart((x) => x.azm), "heart", "AZM", v.targets.azmWeekly ?? WHO_WEEKLY_MODERATE_MIN],
          ["Cardio minutes per week", chart((x) => x.sessionMin), "activity", "min", null],
          ["Cardio load per week", chart((x) => x.load), "load", "TRIMP", null],
        ] as const).map(([title, pts, tone, unit, target]) => (
          <Glass key={title} className="p-4">
            <div className="mb-1 text-[14px] font-semibold">{title}</div>
            <TrendChart points={pts} color={toneVar(tone)} kind="bar" height={120} unit={unit} zero label={title}
              target={target ? { value: target, label: v.targets.azmWeekly === null && unit === "AZM" ? "WHO" : "Goal" } : null} />
          </Glass>
        ))}
        <Glass className="p-4">
          <div className="mb-1 flex items-baseline justify-between"><span className="text-[14px] font-semibold">Resting heart rate, weekly average</span><Link href="/metric/resting_hr" className="text-[13px] font-semibold text-ink-2 underline decoration-[var(--hairline)] underline-offset-4">Daily</Link></div>
          <TrendChart points={chart((x) => x.restingHr)} color={toneVar("heart")} height={120} unit="bpm" label="Weekly average resting heart rate" />
          <p className="mt-1 text-[12px] text-ink-3">A falling resting heart rate over months often accompanies better aerobic fitness; day-to-day changes are mostly noise.</p>
        </Glass>
      </div>

      <SectionHeader>Load balance</SectionHeader>
      <Glass className="p-4">
        {v.acwr.ratio !== null ? (
          <div className="flex items-end justify-between"><div><Label tone="load">Acute : chronic</Label><Value value={v.acwr.ratio.toFixed(2)} unit="×" size="lg" /></div><Badge>{v.acwr.band}</Badge></div>
        ) : <Calibrating have={v.acwr.trackedDays} need={v.acwr.requiredDays} what="load ratio" compact />}
        <p className="mt-2 text-[12px] leading-snug text-ink-3">
          Compares the last 7 days of cardio load with the last 28. It describes change in load; its link with injury risk is debated, so it is <strong className="text-ink-2">not</strong> an injury prediction and not a guarantee that a load is safe.
        </p>
      </Glass>

      <SectionHeader>Cardio sessions</SectionHeader>
      {v.sessions.length ? (
        <Glass className="list overflow-hidden">
          {v.sessions.map((s) => (
            <Row key={s.id} href={`/training/${encodeURIComponent(s.id)}`} icon="heart" tone="heart" title={s.title}
              subtitle={`${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(s.startMs)} · ${fmtTime(s.startMs, c.tz)} · ${fmtDuration(s.durationMin, { compact: true })}${s.label?.category ? ` · ${CATEGORY_LABEL[s.label.category]}` : ""}`} />
          ))}
        </Glass>
      ) : <Glass className="p-4 text-center text-[14px] text-ink-3">No cardio sessions this week. Workouts count as cardio by type (running, walking, cycling…) or when you label them Cardio.</Glass>}
    </Page>
  );
}

function GoalRing({ label, value, target, unit, tone, guideline }: { label: string; value: number | null; target: number | null; unit: string; tone: "load" | "heart" | "activity"; guideline?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Ring value={target && value !== null ? Math.min(value, target) : null} max={target ?? 1} color={toneVar(tone)} size={96} stroke={9} dashed={!target}
        label={`${label}: ${value === null ? "no data" : `${Math.round(value)} ${unit}`}${target ? ` of ${target}` : ""}`}>
        <div className="flex flex-col items-center">
          <span className="num text-[20px] leading-none font-bold">{value === null ? "—" : fmtNumber(value)}</span>
          <span className="mt-0.5 text-[11px] font-semibold text-ink-3">{target ? `/ ${fmtNumber(target)}` : unit || " "}</span>
        </div>
      </Ring>
      <span className="text-center text-[13px] font-semibold text-ink-2">{label}</span>
      <span className="-mt-1.5 text-[11px] text-ink-3">{target ? (guideline ? "WHO guideline" : "Your goal") : "No goal set"}</span>
    </div>
  );
}

function ZoneSheet({ zoneBpm, hrMax, hrMaxSource }: { zoneBpm: [number, number | null][] | null; hrMax: number | null; hrMaxSource: string | null }) {
  return (
    <Sheet title="Heart-rate zones explained" triggerLabel="Heart-rate zones explained" triggerClassName={cx("glass glass-pill grid size-10 place-items-center text-ink-2")} trigger={<Icon name="info" size={20} />}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p><strong className="text-ink">Baseline zones (Z1–Z5)</strong> are percentages of your maximum heart rate: Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90+ %.
          {hrMax && ` With HRmax ${Math.round(hrMax)} bpm (${hrMaxSource === "override" ? "your setting" : "220 − age, as Google uses"}):`}</p>
        {zoneBpm && (
          <ul className="grid grid-cols-5 gap-1 text-center text-[12px]">
            {zoneBpm.map(([lo, hi], i) => <li key={i} className="rounded-xl bg-[var(--fill)] px-1 py-2"><span className="block font-bold text-ink">Z{i + 1}</span><span className="num">{lo}{hi ? `–${hi}` : "+"}</span></li>)}
          </ul>
        )}
        <p><strong className="text-ink">Physiological Zone 2</strong> is the intensity just below your first lactate (or ventilatory) threshold. It differs from person to person and needs a lab or field test. The 60–70 % HRmax zone is a common approximation, not a measurement of that threshold.</p>
        <p><strong className="text-ink">Google&apos;s zones</strong> (fat burn, cardio, peak) use heart-rate reserve (40 / 60 / 85 %) and drive Active Zone Minutes. They are shown separately and labelled.</p>
        <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § HR-ZONES, LOAD-ZONES, CARDIO-WEEK</p>
      </div>
    </Sheet>
  );
}
