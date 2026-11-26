import { notFound } from "next/navigation";
import { metricDetail } from "@/server/analytics/values";
import { GROUP_LABEL } from "@/server/analytics/registry";
import { ctx, parseDate, parseRange } from "@/server/views";
import { Badge, Calibrating, Delta, Glass, LargeTitle, Page, SectionHeader, Value, toneVar } from "@/ui/kit";
import { Segmented, Sheet } from "@/ui/controls";
import { TrendChart } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { METRIC_BY_ID } = await import("@/server/analytics/registry");
  return { title: `${METRIC_BY_ID.get(id)?.label ?? "Metric"} · Baseline` };
}

const RANGES = [{ value: "7d", label: "Week" }, { value: "30d", label: "Month" }, { value: "90d", label: "3 Months" }, { value: "1y", label: "Year" }];
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export default async function MetricPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const c = ctx();
  const range = parseRange(sp.range, "30d");
  const end = parseDate(sp.date, c.today);
  const d = metricDetail(c.db, id, range, end, c.fb);
  if (!d) notFound();
  const { def } = d;
  const fmtKind = def.clock ? "clock" : def.unit === "h" && def.group === "sleep" ? "hours" : "number";
  const f = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatValue(v, fmtKind, def.decimals, def.clockBase ?? 0));
  const unit = def.clock || fmtKind === "hours" ? undefined : def.unit;
  const isScore = def.series.kind === "score";
  const base = d.baseline?.status === "ok" ? d.baseline : null;
  const cal = d.baseline?.status === "calibrating" ? d.baseline : null;
  const kind = def.agg === "sum" || def.id === "strain" ? "bar" : "line";

  return (
    <Page accent={def.tone === "body" || def.tone === "vitals" ? "sleep" : def.tone === "load" ? "load" : def.tone}>
      <LargeTitle back={{ href: "/health", label: "Health" }} eyebrow={GROUP_LABEL[def.group]} title={def.label} />

      <Glass thick className="rise p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-3">{d.latest ? (d.latest.date === c.today ? "Today" : dayFmt.format(Date.parse(`${d.latest.date}T12:00:00Z`))) : "Latest"}</div>
            <div className="mt-1"><Value value={f(d.latest?.value)} unit={unit} size="xl" /></div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {def.estimate && <Badge>Estimate</Badge>}
            {isScore && <Badge tone="info">Baseline score</Badge>}
          </div>
        </div>
        {base && d.latest && <div className="mt-2"><Delta value={d.latest.value - base.mean} digits={def.decimals} unit={unit} suffix={`vs your ${base.n}-day baseline`} /></div>}
        {cal && <div className="mt-3 max-w-[260px]"><Calibrating have={cal.have} need={cal.need} what="your baseline" compact /></div>}
      </Glass>

      <div className="mt-4"><Segmented param="range" value={range} options={RANGES} /></div>

      <Glass className="mt-3 p-4">
        <TrendChart points={d.points} color={toneVar(def.tone)} kind={kind} height={210} unit={unit} decimals={def.decimals}
          baseline={base ? { mean: base.mean, sd: base.sd } : null} format={fmtKind} clockBase={def.clockBase ?? 0} zero={def.agg === "sum"} label={`${def.label} per day`} />
        {base && <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-3"><span className="inline-block h-2.5 w-5 rounded-sm bg-[var(--fill-2)]" />Your normal range (28-day mean ± 1 SD)</p>}
      </Glass>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[{ k: "Average", v: d.period.value }, { k: "Lowest", v: d.period.min }, { k: "Highest", v: d.period.max }].map((x) => (
          <Glass key={x.k} className="p-3">
            <div className="text-[12px] font-semibold text-ink-3">{x.k}</div>
            <div className="mt-1"><Value value={f(x.v)} unit={unit} size="sm" /></div>
          </Glass>
        ))}
      </div>
      <p className="mt-2 px-1 text-[12px] text-ink-3">{d.period.days} of {d.points.length} days with data{def.agg === "sum" ? " · average is per day with data" : ""}.</p>

      <SectionHeader>Compared with before</SectionHeader>
      <Glass className="list overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[15px] font-semibold">Previous {RANGES.find((r) => r.value === range)!.label.toLowerCase()}</span>
          <span className="flex items-center gap-2"><Value value={f(d.previous.value)} unit={unit} size="sm" />{d.change && <Delta value={d.change.abs} digits={def.decimals} />}</span>
        </div>
        {d.averages.map((a) => (
          <div key={a.range} className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] font-semibold">{a.range === "7d" ? "7-day" : a.range === "30d" ? "30-day" : "90-day"} average</span>
            <span className="flex items-baseline gap-2"><Value value={f(a.value)} unit={unit} size="sm" /><span className="text-[12px] text-ink-3">{a.days} d</span></span>
          </div>
        ))}
        {base && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] font-semibold">Personal baseline</span>
            <span className="num text-[15px] font-semibold">{f(base.mean)} <span className="text-[12px] text-ink-3">± {f(base.sd)}</span></span>
          </div>
        )}
      </Glass>

      <SectionHeader>About this measurement</SectionHeader>
      <Glass className="flex flex-col gap-3 p-4 text-[14px] leading-relaxed">
        <p className="text-ink-2">{def.explanation}</p>
        <div className="flex items-start gap-2 text-[13px]"><span className="mt-0.5 text-ink-3"><Icon name="link" size={15} /></span><span><span className="font-semibold">Source</span> <span className="text-ink-2">· {def.source}</span></span></div>
        {def.method && (
          <Sheet title="Methodology" triggerClassName="self-start inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold" trigger={<><Icon name="info" size={15} />How it&apos;s calculated</>}>
            <p className="text-[14px] leading-relaxed text-ink-2">{def.method}</p>
            <p className="mt-3 text-[12px] text-ink-3">Full formulas, references, missing-data rules and limitations: docs/CALCULATIONS.md.</p>
          </Sheet>
        )}
      </Glass>

      <SectionHeader>Data</SectionHeader>
      <Glass className="list max-h-[340px] overflow-y-auto" tabIndex={0} aria-label={`${def.label} daily values`}>
        {[...d.points].reverse().map((p) => (
          <div key={p.date} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
            <span className="text-ink-2">{dayFmt.format(Date.parse(`${p.date}T12:00:00Z`))}</span>
            <span className={p.value === null ? "text-ink-4" : "num font-semibold"}>{p.value === null ? "no data" : `${f(p.value)}${unit ? ` ${unit}` : ""}`}</span>
          </div>
        ))}
      </Glass>
    </Page>
  );
}
