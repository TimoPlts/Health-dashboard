import Link from "next/link";
import { ctx } from "@/server/views";
import { isWeightRange, weightView, type WeightView } from "@/server/analytics/weight";
import { PHASE_LABEL } from "@/lib/metrics/weight-tracker";
import { Badge, Glass, LargeTitle, Page, SectionHeader, Value, cx } from "@/ui/kit";
import { Segmented, Sheet } from "@/ui/controls";
import { WeightChart } from "@/ui/charts/WeightChart";
import { WeightQuickLog } from "@/ui/WeightQuickLog";
import { PhaseEditor } from "@/ui/WeightEditors";
import { WeightGoal } from "@/ui/WeightControls";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weight · Baseline" };

const RANGES = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "6m", label: "6M" }, { value: "1y", label: "1Y" }, { value: "all", label: "All" }];
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const d = (s: string, long = false) => (long ? longFmt : dayFmt).format(Date.parse(`${s}T12:00:00Z`));
const kg = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : v.toFixed(digits));
const signed = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`);

/** Weight dashboard: fast logging, measured weight vs trend, comparable weekly changes, phases and goal. */
export default async function WeightPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const range = isWeightRange(sp.range) ? sp.range : "90d";
  const v = weightView(c.db, c.today, c.fb, c.tz, range);
  const ph = v.currentPhase ? v.phases.find((p) => p.current)! : null;

  return (
    <Page accent="body">
      <LargeTitle back={{ href: "/health", label: "Health" }} eyebrow="Body" title="Weight" trailing={<MethodSheet />} />

      <Glass thick className="rise p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-3">Trend weight <Badge>estimate</Badge></div>
            <div className="mt-1"><Value value={kg(v.trendNow)} unit="kg" size="xl" /></div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-semibold text-ink-3">Latest weigh-in</div>
            <div className="num mt-1 text-[20px] font-bold">{v.latest ? `${kg(v.latest.kg)} kg` : "—"}</div>
            {v.latest && <div className="text-[12px] text-ink-3">{v.latest.date === c.today ? "Today" : d(v.latest.date)} · {v.latest.time}</div>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
          <Mini k="7-day average" v={v.week.current ? `${kg(v.week.current.kg)}` : "—"} sub={v.week.current ? `${v.week.current.n} weigh-ins` : "needs 3 weigh-ins"} />
          <Mini k="Previous week" v={v.week.previous ? `${kg(v.week.previous.kg)}` : "—"} sub={v.week.previous ? `${v.week.previous.n} weigh-ins` : "needs 3 weigh-ins"} />
          <Mini k="Week change" v={v.week.change ? `${signed(v.week.change.kg)}` : "—"} sub={v.week.change ? `${signed(v.week.change.pct, 2)} %` : "not comparable yet"} />
        </div>
      </Glass>

      <section aria-label="Log weight">
        <SectionHeader>Log weight</SectionHeader>
        <Glass className="p-4"><WeightQuickLog q={v.quick} showLink={false} /></Glass>
      </section>

      <SectionHeader action={<Link href="/weight/history" transitionTypes={["nav-forward"]} className="pressable text-[14px] font-semibold text-ink-2">History ›</Link>}>Trend</SectionHeader>
      <Segmented param="range" value={range} options={RANGES} />
      <Glass className="mt-3 p-4">
        <WeightChart points={v.points} from={v.from} to={c.today} goalKg={v.goal?.kg ?? null}
          phases={v.phases.map((p) => ({ date: p.phase.startDate, label: p.phase.name }))} height={230} />
      </Glass>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Lowest" v={v.extremes ? `${kg(v.extremes.min.kg)} kg` : "—"} s={v.extremes ? d(v.extremes.min.date) : "in this period"} />
        <Stat k="Highest" v={v.extremes ? `${kg(v.extremes.max.kg)} kg` : "—"} s={v.extremes ? d(v.extremes.max.date) : "in this period"} />
        <Stat k="30-day trend change" v={v.month ? `${signed(v.month.kg)} kg` : "—"} s={v.month ? `${v.month.entries} weigh-ins` : "needs 4 weigh-ins over 30 days"} />
        <Stat k="Consistency" v={`${v.consistency.logged}/${v.consistency.days}`} s={`days · streak ${v.consistency.streak}`} />
        <Stat k="Starting weight" v={v.start ? `${kg(v.start.kg)} kg` : "—"} s={v.start ? d(v.start.date, true) : "first weigh-in"} />
        <Stat k="Total change" v={v.totalChange !== null ? `${signed(v.totalChange)} kg` : "—"} s="trend now vs first weigh-in" />
      </div>

      <SectionHeader action={<PhaseEditor phase={null} defaults={{ startDate: c.today, startKg: v.trendNow, today: c.today }}
        triggerClassName="inline-flex items-center gap-1 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold" trigger={<>+ New phase</>} />}>Phase</SectionHeader>
      {ph ? <PhaseCard p={ph} today={c.today} trendNow={v.trendNow} /> : (
        <Glass className="p-4 text-[14px] text-ink-2">No phase running. Start a <strong>cutting</strong>, <strong>maintaining</strong> or <strong>bulking</strong> phase to track progress and your observed weekly rate against your own goal.</Glass>
      )}

      {!v.goal?.fromPhase && (
        <>
          <SectionHeader>Goal weight</SectionHeader>
          <Glass className="flex flex-col gap-3 p-4">
            {v.goal && <GoalBar g={v.goal} />}
            <WeightGoal targetKg={v.goal && !v.goal.fromPhase ? v.goal.kg : null} />
            <p className="text-[12px] text-ink-3">{ph ? "A goal set on the current phase takes precedence." : "Optional. Progress uses the trend, never a single weigh-in."}</p>
          </Glass>
        </>
      )}

      {v.phases.filter((p) => !p.current).length > 0 && (
        <>
          <SectionHeader>Past phases</SectionHeader>
          <Glass className="list overflow-hidden">
            {v.phases.filter((p) => !p.current).map(({ phase, progress }) => (
              <PhaseEditor key={phase.id} phase={phase} defaults={{ startDate: phase.startDate, startKg: phase.startKg, today: c.today }} triggerClassName="hoverable block w-full text-left" trigger={
                <div className="flex min-h-[58px] items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{phase.name} <span className="text-[12px] font-medium text-ink-3">{PHASE_LABEL[phase.kind]}</span></span>
                    <span className="block truncate text-[12px] text-ink-3">{d(phase.startDate)} – {phase.endDate ? d(phase.endDate, true) : "…"} · {Math.round(progress.weeks)} wk · {progress.rate ? `${signed(progress.rate.kgPerWeek, 2)} kg/wk observed` : "rate n/a"}</span>
                  </span>
                  <span className="num shrink-0 text-[15px] font-semibold">{signed(progress.change)} kg</span>
                  <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
                </div>
              } />
            ))}
          </Glass>
        </>
      )}
      <p className="mt-4 px-1 text-[12px] leading-snug text-ink-3">Daily weight moves with water, food and salt; a change of a few hundred grams from one day to the next is not fat gained or lost. Watch the trend and the weekly averages.</p>
    </Page>
  );
}

function Mini({ k, v, sub }: { k: string; v: string; sub: string }) {
  return <div className="min-w-0"><div className="truncate text-[12px] font-semibold text-ink-3">{k}</div><div className={cx("num text-[19px] font-semibold", v === "—" && "text-ink-4")}>{v}{v !== "—" && <span className="ml-0.5 text-[11px] text-ink-3">kg</span>}</div><div className="truncate text-[11px] text-ink-3">{sub}</div></div>;
}
function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return <Glass className="p-3"><div className="text-[12px] font-semibold text-ink-3">{k}</div><div className={cx("num mt-1 text-[17px] font-semibold", v === "—" && "text-ink-4")}>{v}</div><div className="mt-0.5 truncate text-[11px] text-ink-3">{s}</div></Glass>;
}

function GoalBar({ g }: { g: NonNullable<WeightView["goal"]> }) {
  const pct = g.progress === null ? null : Math.max(0, Math.min(1, g.progress));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold">Goal {g.kg.toFixed(1)} kg</span>
        <span className="num text-ink-3">{g.remainingKg !== undefined ? `${signed(g.remainingKg)} kg to go` : "—"}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--track)]" role="progressbar" aria-label="Progress toward goal weight" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}>
        {pct !== null && <div className="h-full rounded-full bg-[var(--body)]" style={{ width: `${Math.max(2, pct * 100)}%` }} />}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        {g.startKg !== null && pct !== null ? `${Math.round(pct * 100)} % of the way from ${g.startKg.toFixed(1)} kg (trend). ` : ""}
        {g.projectedWeeks != null ? `Projection: about ${Math.round(g.projectedWeeks)} weeks at your 30-day trend rate (${signed(g.ratePerWeek, 2)} kg/week). A projection, not a prediction.` : "A projection appears after 3 weeks of weigh-ins moving toward the goal."}
      </p>
    </div>
  );
}

function PhaseCard({ p, today, trendNow }: { p: WeightView["phases"][number]; today: string; trendNow: number | null }) {
  const { phase, progress } = p;
  const pct = progress.progress === null ? null : Math.max(0, Math.min(1, progress.progress));
  return (
    <Glass thick className="rise p-4" aria-label={`Current phase ${phase.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Badge tone="info">{PHASE_LABEL[phase.kind]}</Badge><span className="text-[12px] text-ink-3">since {d(phase.startDate, true)} · week {Math.floor(progress.days / 7) + 1}</span></div>
          <div className="mt-1 truncate text-[18px] font-bold">{phase.name}</div>
        </div>
        <PhaseEditor phase={phase} current defaults={{ startDate: phase.startDate, startKg: phase.startKg, today }} triggerLabel="Edit phase"
          triggerClassName="rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold" trigger={<>Edit</>} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div><div className="text-[12px] text-ink-3">Start</div><div className="num text-[17px] font-semibold">{phase.startKg.toFixed(1)}</div></div>
        <div><div className="text-[12px] text-ink-3">Trend now</div><div className="num text-[17px] font-semibold">{kg(trendNow)}</div></div>
        <div><div className="text-[12px] text-ink-3">Change</div><div className="num text-[17px] font-semibold">{signed(progress.change)}</div></div>
        <div className="col-span-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3">
          <div><div className="text-[12px] text-ink-3">Observed rate</div><div className="num text-[15px] font-semibold">{progress.rate ? `${signed(progress.rate.kgPerWeek, 2)} kg/wk` : "—"}</div><div className="text-[11px] text-ink-3">{progress.rate ? `${progress.rate.n} weigh-ins, ${Math.round(progress.rate.spanDays)} days` : "needs 5 weigh-ins over 14 days"}</div></div>
          <div><div className="text-[12px] text-ink-3">Your target rate</div><div className="num text-[15px] font-semibold">{phase.targetRateKgWeek !== null ? `${signed(phase.targetRateKgWeek, 2)} kg/wk` : "—"}</div><div className="text-[11px] text-ink-3">{phase.targetRateKgWeek !== null ? "for comparison only" : "not set"}</div></div>
        </div>
      </div>
      {phase.goalKg !== null && (
        <div className="mt-3 border-t border-hairline pt-3">
          <div className="flex items-baseline justify-between text-[13px]"><span className="font-semibold">Goal {phase.goalKg.toFixed(1)} kg</span><span className="num text-ink-3">{progress.toGoal !== null ? `${signed(progress.toGoal)} kg to go` : "—"}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--track)]" role="progressbar" aria-label="Phase progress toward goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}>
            {pct !== null && <div className="h-full rounded-full bg-[var(--body)]" style={{ width: `${Math.max(2, pct * 100)}%` }} />}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">{pct !== null ? `${Math.round(pct * 100)} % of the planned change. ` : ""}{progress.projectedWeeks !== null ? `Projection: about ${Math.round(progress.projectedWeeks)} weeks at the observed rate — not a prediction.` : "No projection until the observed rate moves toward the goal."}</p>
        </div>
      )}
    </Glass>
  );
}

function MethodSheet() {
  return (
    <Sheet title="How weight is calculated" triggerLabel="How weight is calculated" triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold" trigger={<><Icon name="info" size={15} />Method</>}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p><strong className="text-ink">Measured weight</strong> is one weigh-in per day: the one you logged or marked as your morning weigh-in, otherwise the first between 03:00 and 12:00. Other weigh-ins stay in your history. Days without a weigh-in are simply missing, never zero.</p>
        <p><strong className="text-ink">Trend</strong> is an estimate: it moves 10 % of the way toward each new weigh-in per day (Hacker&apos;s Diet smoothing), adjusted for gaps, and is held between weigh-ins. On the chart it is drawn only across gaps of up to 7 days.</p>
        <p><strong className="text-ink">Weekly change</strong> compares the average of the last 7 days with the 7 days before, each with at least 3 weigh-ins. The 30-day change uses the trend.</p>
        <p><strong className="text-ink">Phases</strong>: the observed rate is a straight-line fit through the phase&apos;s weigh-ins (at least 5 over 14 days). Goals, target rates and projections are yours; Baseline never prescribes a rate or a calorie deficit.</p>
        <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § WEIGHT</p>
      </div>
    </Sheet>
  );
}
