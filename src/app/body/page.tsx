import { ctx } from "@/server/views";
import { bodyView } from "@/server/analytics/body";
import { Badge, Glass, Label, LargeTitle, Page, SectionHeader, Value, toneVar } from "@/ui/kit";
import { TrendChart } from "@/ui/charts/TrendChart";
import { Sheet } from "@/ui/controls";
import { Icon } from "@/ui/icons";
import { AddWeight, DeleteWeight, WeightGoal } from "@/ui/WeightControls";
import { fmtNumber, fmtTime } from "@/ui/format";
import { trendAt } from "@/lib/metrics/weight";
import { daysBetween } from "@/lib/metrics/periods";
import { shiftDate } from "@/server/analytics/series";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weight & energy · Baseline" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;

export default async function BodyPage() {
  const c = ctx();
  const v = bodyView(c.db, c.today, c.fb, c.tz);
  // Trend held between weigh-ins (never invented), drawn from the first weigh-in in the last 180 days.
  const days = daysBetween(shiftDate(c.today, -179), c.today);
  const first = v.trend[0]?.date;
  const trendPts = days.map((d) => ({ date: d, value: first && d >= first ? trendAt(v.trend, d) : null }));
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.now());
  const lastRaw = v.entries[0] ?? null;

  return (
    <Page accent="body">
      <LargeTitle back={{ href: "/health", label: "Health" }} title="Weight & energy"
        trailing={<><MethodSheet /><AddWeight today={c.today} nowTime={nowTime} lastKg={lastRaw?.kg ?? null} /></>} />

      <Glass thick className="rise p-5">
        {v.latest ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div><Label tone="body" icon="body">Trend weight</Label><Value value={v.latest.trendKg.toFixed(1)} unit="kg" size="xl" /></div>
              {lastRaw && <div className="text-right text-[13px] text-ink-3">Last weigh-in<div className="num text-[15px] font-semibold text-ink">{lastRaw.kg.toFixed(1)} kg</div>{dayFmt.format(Date.parse(`${lastRaw.date}T12:00:00Z`))}</div>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
              <div><div className="text-[12px] font-semibold text-ink-3">7 days</div><div className="num text-[17px] font-semibold">{v.week ? `${signed(v.week.kg)} kg` : "—"}</div>{!v.week && <div className="text-[11px] text-ink-3">needs 2 weigh-ins in 14 days</div>}</div>
              <div><div className="text-[12px] font-semibold text-ink-3">30 days</div><div className="num text-[17px] font-semibold">{v.month ? `${signed(v.month.kg)} kg` : "—"}</div>{!v.month && <div className="text-[11px] text-ink-3">needs 4 weigh-ins over 30+ days</div>}</div>
            </div>
          </>
        ) : (
          <div className="py-4 text-center"><p className="text-[16px] font-semibold">No weight yet</p><p className="mt-1 text-[13px] text-ink-3">Log a weigh-in, or weigh on a scale that writes to Google Health.</p></div>
        )}
      </Glass>

      <SectionHeader>Trend · 6 months</SectionHeader>
      <Glass className="p-4">
        <TrendChart points={trendPts} color={toneVar("body")} height={160} unit="kg" decimals={1} label="Smoothed body-weight trend, last 6 months"
          target={v.goal ? { value: v.goal.targetKg, label: "Goal" } : null} />
        <p className="mt-2 text-[12px] text-ink-3">The trend moves 10 % toward each new weigh-in per day, so water and food swings are damped. It is held between weigh-ins.</p>
      </Glass>

      <SectionHeader>Weight goal</SectionHeader>
      <Glass className="flex flex-col gap-3 p-4">
        {v.goal && v.goal.trendKg !== undefined ? (
          <div className="text-[14px] text-ink-2">
            <strong className="num text-ink">{signed(v.goal.remainingKg ?? 0)} kg</strong> to {v.goal.targetKg.toFixed(1)} kg.
            {v.goal.projectedWeeks != null ? ` At your 30-day trend (${signed(v.goal.ratePerWeek ?? 0, 2)} kg/week), about ${Math.round(v.goal.projectedWeeks)} weeks — a projection, not a prediction.` : " A projection appears once you have 3 weeks of weigh-ins moving toward the goal."}
          </div>
        ) : <p className="text-[14px] text-ink-2">{v.goal ? "Log a weigh-in to track progress." : "Optional. Progress uses the trend, never a single weigh-in."}</p>}
        <WeightGoal targetKg={v.goal?.targetKg ?? null} />
      </Glass>

      <SectionHeader>Energy expenditure · 90 days</SectionHeader>
      <Glass className="p-4">
        <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold">Total energy <Badge>est.</Badge></div>
        <TrendChart points={v.energy.points.map((p) => ({ date: p.date, value: p.total }))} color={toneVar("activity")} kind="bar" height={120} unit="kcal" zero label="Total energy expenditure per day (Google estimate)" />
        <div className="mt-3 mb-1 flex items-center gap-2 text-[14px] font-semibold">Active energy <Badge>est.</Badge></div>
        <TrendChart points={v.energy.points.map((p) => ({ date: p.date, value: p.active }))} color={toneVar("activity")} kind="bar" height={100} unit="kcal" zero label="Active energy per day (Google estimate)" />
        <p className="mt-2 text-[12px] text-ink-3">Google&apos;s estimates from heart rate, movement and your profile. Wrist estimates can be off by 20–40 % for an individual; use them for trends.</p>
      </Glass>

      <SectionHeader>Energy balance</SectionHeader>
      <Glass className="p-4 text-[14px] text-ink-2">
        {v.energy.balance.status === "ok"
          ? <><Value value={`${signed(v.energy.balance.meanKcal, 0)}`} unit="kcal/day" size="md" /><p className="mt-1 text-[12px] text-ink-3">Estimated, over {v.energy.balance.days} days with both intake and expenditure.</p></>
          : <p>Needs food-intake data: no app writes nutrition to Google Health for this account yet ({v.energy.balance.have} of {v.energy.balance.need} days with both). Baseline does not estimate intake.</p>}
      </Glass>

      <SectionHeader>Weigh-ins</SectionHeader>
      {v.entries.length ? (
        <Glass className="list overflow-hidden">
          {v.entries.slice(0, 30).map((e) => {
            const label = `${dayFmt.format(Date.parse(`${e.date}T12:00:00Z`))} ${fmtTime(e.tMs, c.tz)}`;
            return (
              <div key={`${e.tMs}-${e.source}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0"><span className="block text-[14px] font-semibold">{label}</span><span className="block text-[12px] text-ink-3">{e.source}</span></span>
                <span className="flex items-center gap-2"><span className="num text-[15px] font-semibold">{fmtNumber(e.kg, 1)} kg</span>{e.manual && <DeleteWeight tMs={e.tMs} label={label} />}</span>
              </div>
            );
          })}
        </Glass>
      ) : <Glass className="p-4 text-center text-[14px] text-ink-3">No weigh-ins yet.</Glass>}
    </Page>
  );
}

function MethodSheet() {
  return (
    <Sheet title="Weight & energy methods" triggerLabel="Weight and energy methods" triggerClassName="glass glass-pill grid size-10 place-items-center text-ink-2" trigger={<Icon name="info" size={20} />}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p><strong className="text-ink">Weigh-ins</strong> come from Google Health (e.g. a smart scale or manual entries in the Google Health app) and from entries you log here. A new entry within 30 minutes and 0.1 kg of an existing one is refused as a duplicate.</p>
        <p><strong className="text-ink">Trend</strong>: daily means smoothed so the trend moves 10 % toward each new weight per day (The Hacker&apos;s Diet method), adjusted for days between weigh-ins. Weekly and monthly changes are shown only with enough weigh-ins.</p>
        <p><strong className="text-ink">Energy</strong>: total and active energy are Google&apos;s estimates, not measurements. Energy balance needs your food intake, which Baseline does not estimate.</p>
        <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § WEIGHT, ENERGY</p>
      </div>
    </Sheet>
  );
}
