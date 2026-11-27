import Link from "next/link";
import { ctx, parseRange, trendSeries } from "@/server/views";
import { Glass, LargeTitle, Page, SectionHeader, Value, toneVar } from "@/ui/kit";
import { Segmented } from "@/ui/controls";
import { TrendChart } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trends · Baseline" };

const RANGES = [{ value: "7d", label: "Week" }, { value: "30d", label: "Month" }, { value: "90d", label: "3 Months" }, { value: "1y", label: "Year" }];
const SECTIONS: { title: string; ids: string[] }[] = [
  { title: "Recovery", ids: ["recovery", "hrv", "resting_hr"] },
  { title: "Sleep", ids: ["sleep_score", "sleep_asleep", "sleep_efficiency"] },
  { title: "Load", ids: ["strain", "zone2", "azm"] },
  { title: "Activity", ids: ["steps", "active_kcal"] },
  { title: "Vitals", ids: ["respiratory_rate", "spo2", "skin_temp"] },
];

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const range = parseRange(sp.range, "30d");
  const c = ctx();
  const all = trendSeries(SECTIONS.flatMap((s) => s.ids), range, c.today);
  return (
    <Page accent="sleep">
      <LargeTitle title="Trends" />
      <div className="sticky top-0 z-40 -mx-4 px-4 pt-[max(env(safe-area-inset-top),8px)] pb-2 backdrop-blur-xl [background:color-mix(in_oklab,var(--bg)_60%,transparent)]">
        <Segmented param="range" value={range} options={RANGES} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {([["week", "Weekly report"], ["month", "Monthly report"]] as const).map(([k, label]) => (
          <Link key={k} href={`/reports?kind=${k}`} transitionTypes={["nav-forward"]} className="glass pressable flex items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold">
            {label}<span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
          </Link>
        ))}
      </div>
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <SectionHeader>{s.title}</SectionHeader>
          <div className="grid gap-3 lg:grid-cols-2">
            {s.ids.map((id) => {
              const t = all[id]!;
              const fmt = t.def.clock ? "clock" : t.def.unit === "h" && t.def.group === "sleep" ? "hours" : "number";
              const unit = fmt === "number" ? t.def.unit : undefined;
              return (
                <Glass key={id} className="p-4">
                  <Link href={`/metric/${id}?range=${range}`} transitionTypes={["nav-forward"]} className="pressable mb-2 flex items-end justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 text-[14px] font-semibold">{t.def.label}<span className="text-ink-4"><Icon name="chevronRight" size={14} strokeWidth={2.4} /></span></div>
                      <div className="text-[12px] text-ink-3">{t.days ? `${t.days} days · average` : "No data in this period"}</div>
                    </div>
                    <Value value={t.mean === null ? "—" : formatValue(t.mean, fmt, t.def.decimals)} unit={unit} size="md" />
                  </Link>
                  <TrendChart points={t.points} color={toneVar(t.def.tone)} kind={t.def.agg === "sum" || id === "strain" ? "bar" : "line"} height={132}
                    unit={unit} decimals={t.def.decimals} baseline={t.baseline ? { mean: t.baseline.mean, sd: t.baseline.sd } : null} format={fmt} zero={t.def.agg === "sum"} label={`${t.def.label} trend`} />
                </Glass>
              );
            })}
          </div>
        </section>
      ))}
    </Page>
  );
}
