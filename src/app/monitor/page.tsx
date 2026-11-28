import Link from "next/link";
import { ctx, parseDate } from "@/server/views";
import { monitorView, MONITOR_METHOD, type MonitorItem } from "@/server/analytics/monitor";
import { POSITION_TEXT, RANGE_MIN_DAYS } from "@/lib/metrics/personal-range";
import { Badge, Calibrating, Glass, LargeTitle, Page, SectionHeader, Value, cx, toneVar } from "@/ui/kit";
import { Sheet } from "@/ui/controls";
import { TrendChart } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { fmtSignedNumber } from "@/ui/format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Health monitor · Baseline" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const signed = (id: string) => id === "skin_temp";

function fmt(x: MonitorItem, v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return signed(x.def.id) ? fmtSignedNumber(v, x.def.decimals) : formatValue(v, "number", x.def.decimals);
}

/** Night-time and resting measurements, each compared with your own recent normal. Descriptive only. */
export default async function MonitorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const end = parseDate(sp.date, c.today);
  const items = monitorView(c.db, end, c.fb);
  const ok = items.filter((i) => i.deviation?.position);
  const outside = ok.filter((i) => i.deviation!.position !== "within").length;
  const calibrating = items.filter((i) => i.range?.status === "calibrating").length;
  const primary = items.slice(0, 6), more = items.slice(6);

  return (
    <Page accent="vitals">
      <LargeTitle back={{ href: "/health", label: "Health" }} eyebrow="Compared with your own normal" title="Health monitor" />

      <Glass thick className="rise grid grid-cols-3 divide-x divide-[var(--hairline)] py-4 text-center">
        {[
          { k: "Within range", v: ok.length - outside },
          { k: "Outside range", v: outside },
          { k: "Calibrating", v: calibrating },
        ].map((s) => (
          <div key={s.k} className="px-2">
            <Value value={String(s.v)} size="md" />
            <div className="mt-1 text-[12px] font-semibold text-ink-3">{s.k}</div>
          </div>
        ))}
      </Glass>
      <p className="mt-3 px-1 text-[12px] leading-snug text-ink-3">
        Each value is compared with the 28 days before it. Outside the range only means unusual <em>for you</em>: it is not a diagnosis, and about one day in three falls outside by chance.
      </p>

      <SectionHeader action={<MethodSheet />}>Overnight vitals</SectionHeader>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">{primary.map((x, i) => <MonitorCard key={x.def.id} x={x} i={i} today={c.today} />)}</div>

      <SectionHeader>More measurements</SectionHeader>
      <Glass className="list overflow-hidden">{more.map((x) => <CompactRow key={x.def.id} x={x} />)}</Glass>
      <p className="mt-2 px-1 text-[12px] text-ink-3">Open a measurement for its full history, range band and methodology.</p>
    </Page>
  );
}

/** One-line version for secondary measurements: value, range, position, completeness; links to the detail page. */
function CompactRow({ x }: { x: MonitorItem }) {
  const r = x.range?.status === "ok" ? x.range : null;
  const cal = x.range?.status === "calibrating" ? x.range : null;
  const pos = x.deviation?.position ?? null;
  const sub = r ? `Normal ${fmt(x, r.low)} – ${fmt(x, r.high)}${x.def.unit ? ` ${x.def.unit}` : ""}` : cal ? `Calibrating ${cal.have}/${cal.need}` : x.spec.range ? "No range yet" : "No daily range";
  return (
    <Link href={`/metric/${x.def.id}`} transitionTypes={["nav-forward"]} className="pressable hoverable flex min-h-[62px] items-center gap-3 px-4 py-2.5">
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: toneVar(x.def.tone) }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-semibold">{x.def.label}</span>
        <span className="block truncate text-[12px] text-ink-3">{sub} · {x.completeness.have}/{x.completeness.of} days</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="num text-[17px] font-semibold">{x.latest ? fmt(x, x.latest.value) : <span className="text-ink-4">—</span>}{x.latest && x.def.unit && <span className="ml-0.5 text-[11px] text-ink-3">{x.def.unit}</span>}</span>
        {pos && pos !== "within" && <Badge tone="info">{POSITION_TEXT[pos].replace(" your normal range", "")}</Badge>}
      </span>
      <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
    </Link>
  );
}

function MethodSheet() {
  return (
    <Sheet title="How ranges are calculated" triggerLabel="How ranges are calculated" triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold"
      trigger={<><Icon name="info" size={15} />Method</>}>
      <p className="text-[14px] leading-relaxed text-ink-2">{MONITOR_METHOD}</p>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">Values come straight from Google Health (Fitbit Air). Missing nights are left out, never filled in or counted as zero. Ranges need {RANGE_MIN_DAYS} nights with data in the 28-day window.</p>
      <p className="mt-3 text-[12px] text-ink-3">Formulas, references and limitations: docs/CALCULATIONS.md § RANGE.</p>
    </Sheet>
  );
}

function MonitorCard({ x, i, today }: { x: MonitorItem; i: number; today: string }) {
  const r = x.range?.status === "ok" ? x.range : null;
  const cal = x.range?.status === "calibrating" ? x.range : null;
  const pos = x.deviation?.position ?? null;
  const unit = x.def.unit;
  const when = x.latest ? (x.latest.date === today ? "Last night" : x.latest.daysAgo === 1 ? "Yesterday" : dayFmt.format(Date.parse(`${x.latest.date}T12:00:00Z`))) : "No data yet";
  return (
    <Glass className={cx("rise p-4", `rise-${Math.min(4, i + 1)}`)} aria-label={x.def.label}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/metric/${x.def.id}`} transitionTypes={["nav-forward"]} className="pressable inline-flex items-center gap-1 text-[15px] font-semibold">
            <span className="size-2 rounded-full" style={{ background: toneVar(x.def.tone) }} aria-hidden="true" />{x.def.label}
            <span className="text-ink-4"><Icon name="chevronRight" size={14} strokeWidth={2.4} /></span>
          </Link>
          <div className="mt-0.5 text-[12px] text-ink-3">{when}{x.latest && x.latest.daysAgo > 3 ? ` · ${x.latest.daysAgo} days ago` : ""}</div>
        </div>
        <div className="text-right">
          <Value value={fmt(x, x.latest?.value)} unit={unit} size="md" />
          {pos && <div className="mt-1"><Badge tone={pos === "within" ? "neutral" : "info"}>{POSITION_TEXT[pos].replace(" your normal range", "")}</Badge></div>}
        </div>
      </div>

      {r && x.latest && <RangeBar x={x} low={r.low} high={r.high} typical={r.typical} value={x.latest.value} />}
      {cal && <div className="mt-3"><Calibrating have={cal.have} need={cal.need} what="personal range" compact /></div>}
      {!x.spec.range && <p className="mt-3 text-[12px] text-ink-3">{x.spec.note}</p>}

      <div className="mt-3">
        <TrendChart points={x.points} color={toneVar(x.def.tone)} height={92} unit={unit} decimals={x.def.decimals}
          band={r ? { low: r.low, high: r.high, typical: r.typical } : null} label={`${x.def.label}, last 90 days`} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline pt-3 text-[12px] sm:grid-cols-3">
        <div><dt className="text-ink-3">Normal range</dt><dd className="num font-semibold">{r ? `${fmt(x, r.low)} – ${fmt(x, r.high)}${unit ? ` ${unit}` : ""}` : "—"}</dd></div>
        <div><dt className="text-ink-3">Deviation</dt><dd className="num font-semibold">{x.deviation ? `${fmtSignedNumber(x.deviation.diff, x.def.decimals)}${unit ? ` ${unit}` : ""}${x.deviation.z !== null ? ` · ${fmtSignedNumber(x.deviation.z, 1)} SD` : ""}` : "—"}</dd></div>
        <div><dt className="text-ink-3">Completeness</dt><dd className="num font-semibold">{x.completeness.have} of {x.completeness.of} days</dd></div>
        <div className="col-span-2 sm:col-span-3"><dt className="text-ink-3">Source</dt><dd className="text-ink-2">{x.def.source}</dd></div>
      </dl>
      {x.spec.note && x.spec.range && <p className="mt-2 text-[12px] leading-snug text-ink-3">{x.spec.note}</p>}
    </Glass>
  );
}

/** Horizontal range: shaded normal band, tick at the typical value, dot at the latest value. */
function RangeBar({ x, low, high, typical, value }: { x: MonitorItem; low: number; high: number; typical: number; value: number }) {
  const span = Math.max(high - low, 1e-9);
  const lo = Math.min(low - span * 0.6, value), hi = Math.max(high + span * 0.6, value);
  const p = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="mt-4" role="img" aria-label={`${x.def.label} ${fmt(x, value)}, normal range ${fmt(x, low)} to ${fmt(x, high)}`}>
      <div className="relative h-2.5 rounded-full bg-[var(--track)]">
        <div className="absolute inset-y-0 rounded-full" style={{ left: p(low), width: `calc(${p(high)} - ${p(low)})`, background: `color-mix(in oklab, ${toneVar(x.def.tone)} 32%, transparent)` }} />
        <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink-3" style={{ left: p(typical) }} />
        <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--bg)]" style={{ left: p(value), background: toneVar(x.def.tone) }} />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] font-medium text-ink-3 tabular" aria-hidden="true">
        <span className="absolute -translate-x-1/2" style={{ left: p(low) }}>{fmt(x, low)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: p(high) }}>{fmt(x, high)}</span>
      </div>
    </div>
  );
}
