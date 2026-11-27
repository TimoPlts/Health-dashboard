import Link from "next/link";
import { ctx } from "@/server/views";
import { reportView, type ReportRow } from "@/server/analytics/reports";
import { Delta, Glass, LargeTitle, Page, SectionHeader, cx, toneVar } from "@/ui/kit";
import { Segmented } from "@/ui/controls";
import { TrendChart } from "@/ui/charts/TrendChart";
import { Icon } from "@/ui/icons";
import { formatValue } from "@/ui/value-format";
import { fmtDuration } from "@/ui/format";
import { addDays } from "@/lib/metrics/periods";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report · Baseline" };

const SHORT: Record<string, string> = {
  sleep_asleep: "Asleep", sleep_efficiency: "Efficiency", sleep_score: "Score", recovery: "Recovery", hrv: "HRV", resting_hr: "Resting HR",
  respiratory_rate: "Breathing", steps: "Steps", active_min: "Active min", azm: "AZM", distance: "Distance", strain: "Load", zone2: "Zone 2",
};
const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,3.9rem)_minmax(0,3.9rem)_minmax(0,4.6rem)]";
const d = (s: string) => Date.parse(`${s}T12:00:00Z`);
const short = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const month = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const kind = sp.kind === "month" ? "month" : "week";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : c.today;
  const r = reportView(c.db, kind, date, c.today, c.fb, c.tz);
  const p = r.period;
  const title = kind === "week" ? `${short.format(d(p.from))} – ${short.format(d(p.to))}` : month.format(d(p.from));
  const prevHref = `/reports?kind=${kind}&date=${addDays(p.from, -1)}`, nextDate = addDays(p.to, 1);
  const tile = (label: string, value: string, sub?: string) => (
    <div><div className="text-[12px] font-semibold text-ink-3">{label}</div><div className="num text-[17px] font-semibold">{value}</div>{sub && <div className="text-[11px] text-ink-3">{sub}</div>}</div>
  );

  return (
    <Page accent="recovery">
      <LargeTitle back={{ href: "/trends", label: "Trends" }} eyebrow={kind === "week" ? "Weekly report" : "Monthly report"} title={title} />
      <Segmented param="kind" value={kind} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      <div className="mt-3 mb-4 flex items-center justify-between px-1">
        <Link href={prevHref} scroll={false} className="glass glass-pill pressable inline-flex items-center gap-1 px-3 py-2 text-[13px] font-semibold text-ink-2"><Icon name="chevronLeft" size={15} strokeWidth={2.4} />Previous</Link>
        {nextDate <= c.today
          ? <Link href={`/reports?kind=${kind}&date=${nextDate}`} scroll={false} className="glass glass-pill pressable inline-flex items-center gap-1 px-3 py-2 text-[13px] font-semibold text-ink-2">Next<Icon name="chevronRight" size={15} strokeWidth={2.4} /></Link>
          : <span />}
      </div>

      {r.partial && (
        <Glass className="mb-3 p-3.5 text-[13px] text-ink-2">
          {r.completeDays === 0 ? "This period has no complete days yet." : `In progress: ${r.completeDays} of ${p.days.length} days complete. Averages use complete days only; today is not included.`}
        </Glass>
      )}

      <Glass thick className="rise grid grid-cols-3 gap-3 p-4">
        {tile("Workouts", String(r.workouts.current.count), `${r.workouts.previous.count} before`)}
        {tile("Training time", fmtDuration(r.workouts.current.minutes, { compact: true }), `${fmtDuration(r.workouts.previous.minutes, { compact: true })} before`)}
        {tile("Cardio sessions", String(r.workouts.current.cardio), `${r.workouts.previous.cardio} before`)}
      </Glass>

      {r.sections.map((sec) => (
        <section key={sec.title}>
          <SectionHeader>{sec.title}</SectionHeader>
          <Glass className="p-4">
            <div className={cx("grid gap-x-2 pb-2 text-right text-[12px] font-semibold text-ink-3", COLS)}>
              <span className="text-left">Per day</span><span>{kind === "week" ? "Week" : "Month"}</span><span>Before</span><span>vs normal</span>
            </div>
            <div className="list">{sec.rows.map((row) => <ReportLine key={row.def.id} row={row} />)}</div>
            {sec.title === "Sleep" && r.sleepEnd && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-[13px]">
                <div><div className="font-semibold text-ink-3">Sleep debt at the end</div>{r.sleepEnd.debtMin !== null && r.sleepEnd.debtNights >= 3 ? <span className="num text-[15px] font-semibold">{fmtDuration(r.sleepEnd.debtMin, { compact: true })}</span> : <span className="text-ink-3">not enough nights</span>}</div>
                <div><div className="font-semibold text-ink-3">Regularity (SRI)</div>{r.sleepEnd.consistency.status === "ok" && r.sleepEnd.consistency.sri ? <span className="num text-[15px] font-semibold">{Math.round(r.sleepEnd.consistency.sri.sri)}</span> : <span className="text-ink-3">needs 5 nights</span>}</div>
              </div>
            )}
          </Glass>
        </section>
      ))}

      <SectionHeader>Day by day</SectionHeader>
      <div className="flex flex-col gap-3">
        <Glass className="p-4"><div className="mb-1 text-[14px] font-semibold">Time asleep</div><TrendChart points={r.charts.sleep} color={toneVar("sleep")} kind="bar" height={110} format="hours" zero label="Hours asleep per night in this period" /></Glass>
        <Glass className="p-4"><div className="mb-1 text-[14px] font-semibold">Steps</div><TrendChart points={r.charts.steps} color={toneVar("activity")} kind="bar" height={110} zero label="Steps per day in this period" /></Glass>
      </div>

      <SectionHeader href="/goals">Goals</SectionHeader>
      {r.goals.length ? (
        <Glass className="list overflow-hidden">
          {r.goals.map((g) => (
            <div key={g.def.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[14px] font-semibold">{g.def.label} <span className="font-normal text-ink-3">· {g.def.period === "day" ? "daily" : "weekly"}</span></span>
              <span className="num text-[14px] text-ink-2">{g.rate === null ? (g.periods === 0 && r.partial ? "in progress" : "no data") : `${g.met} of ${g.met + g.missed} ${g.def.period === "day" ? "days" : "weeks"}`}</span>
            </div>
          ))}
        </Glass>
      ) : <Glass className="p-4 text-[14px] text-ink-3">No goals set. <Link href="/goals" className="font-semibold text-ink-2 underline">Set goals</Link></Glass>}
      <p className="mt-4 px-1 text-[12px] leading-snug text-ink-3">
        All numbers are calculated from your data; nothing is written by AI. Daily totals (steps, minutes, load) are compared as the average per day with data, so a partial period is not compared with a full one. &quot;Your normal&quot; is the 28 days before this period (from 14 days of data).
      </p>
    </Page>
  );
}

function ReportLine({ row }: { row: ReportRow }) {
  const def = row.def;
  const fmt = def.clock ? "clock" : def.unit === "h" && def.group === "sleep" ? "hours" : "number";
  const f = (v: number | null) => (v === null ? "—" : formatValue(v, fmt, def.decimals, def.clockBase ?? 0));
  return (
    <div className={cx("grid items-center gap-x-2 py-2 text-right text-[14px]", COLS)}>
      <Link href={`/metric/${def.id}`} className="min-w-0 text-left text-ink-2"><span className="block truncate">{SHORT[def.id] ?? def.short ?? def.label}</span>
        {row.total !== null && <span className="block text-[11px] leading-tight text-ink-3">total {f(row.total)}{fmt === "number" && def.unit ? ` ${def.unit}` : ""} · {row.days} d</span>}</Link>
      <span className={cx("num font-semibold")}>{f(row.current)}</span>
      <span className="num">{f(row.previous)}</span>
      <span className="text-[12px]">
        {row.baseline && row.current !== null ? <Delta value={row.current - row.baseline.mean} digits={def.decimals} unit={fmt === "number" ? def.unit : ""} />
          : !row.baseline ? <span className="text-ink-3">baseline {row.baselineHave}/14</span> : "—"}
      </span>
    </div>
  );
}
