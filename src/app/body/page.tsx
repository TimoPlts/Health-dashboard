import Link from "next/link";
import { ctx } from "@/server/views";
import { bodyView } from "@/server/analytics/body";
import { Badge, Glass, LargeTitle, Page, SectionHeader, Value, toneVar } from "@/ui/kit";
import { TrendChart } from "@/ui/charts/TrendChart";
import { Sheet } from "@/ui/controls";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Body & energy · Baseline" };

const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;

/** Body overview: a link into the Weight dashboard (logging, trend, phases) plus energy expenditure and balance. */
export default async function BodyPage() {
  const c = ctx();
  const v = bodyView(c.db, c.today, c.fb, c.tz);

  return (
    <Page accent="body">
      <LargeTitle back={{ href: "/health", label: "Health" }} title="Body & energy" trailing={<MethodSheet />} />

      <Link href="/weight" transitionTypes={["nav-forward"]} className="glass glass-thick pressable rise flex items-center gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-[13px] text-[var(--body)]" style={{ background: "color-mix(in oklab, var(--body) 16%, transparent)" }}><Icon name="body" size={22} strokeWidth={2.1} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink-3">Weight trend</span>
          <span className="num block text-[24px] font-bold">{v.latest ? `${v.latest.trendKg.toFixed(1)} kg` : "No weigh-ins yet"}</span>
          <span className="block text-[12px] text-ink-3">{v.week ? `${signed(v.week.kg)} kg over 7 days (trend) · ` : ""}Log, chart, phases and history</span>
        </span>
        <span className="text-ink-4"><Icon name="chevronRight" size={16} strokeWidth={2.4} /></span>
      </Link>

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
    </Page>
  );
}

function MethodSheet() {
  return (
    <Sheet title="Body & energy methods" triggerLabel="Body and energy methods" triggerClassName="glass glass-pill grid size-10 place-items-center text-ink-2" trigger={<Icon name="info" size={20} />}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p><strong className="text-ink">Weight</strong>: see the Weight page (one weigh-in per day, smoothed trend, comparable weekly averages).</p>
        <p><strong className="text-ink">Energy</strong>: total and active energy are Google&apos;s estimates, not measurements. Energy balance needs your food intake, which Baseline does not estimate.</p>
        <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § WEIGHT, ENERGY</p>
      </div>
    </Sheet>
  );
}
