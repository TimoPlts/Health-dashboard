import Link from "next/link";
import { GROUP_LABEL, type MetricGroup } from "@/server/analytics/registry";
import { ctx, healthIndex } from "@/server/views";
import { Badge, Glass, LargeTitle, Page, SectionHeader, toneVar } from "@/ui/kit";
import { formatValue } from "@/ui/value-format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Health · Baseline" };

const ORDER: MetricGroup[] = ["recovery", "heart", "sleep", "vitals", "activity", "load", "body"];
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

/** Every measurement Baseline has, grouped — including ones with no data yet (shown as such, never hidden). */
export default async function HealthPage() {
  const c = ctx();
  const rows = healthIndex(c.today);
  return (
    <Page accent="heart">
      <LargeTitle title="Health" eyebrow={`${rows.filter((r) => r.latest).length} of ${rows.length} measurements with data`} />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      {ORDER.map((g) => {
        const items = rows.filter((r) => r.def.group === g || (g === "recovery" && r.def.id === "recovery"));
        if (!items.length) return null;
        return (
          <section key={g}>
            <SectionHeader>{GROUP_LABEL[g]}</SectionHeader>
            <Glass className="list overflow-hidden">
              {items.map(({ def, latest }) => {
                const fmt = def.clock ? "clock" : def.unit === "h" && def.group === "sleep" ? "hours" : "number";
                return (
                  <Link key={def.id} href={`/metric/${def.id}`} transitionTypes={["nav-forward"]} className="pressable hoverable flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: toneVar(def.tone) }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[15px] leading-tight font-semibold">{def.label}{def.estimate && <Badge>est.</Badge>}</div>
                      <div className="truncate text-[12px] text-ink-3">{latest ? (latest.date === c.today ? "Today" : dayFmt.format(Date.parse(`${latest.date}T12:00:00Z`))) : "No data yet"}</div>
                    </div>
                    <div className="num shrink-0 text-right text-[17px] font-semibold">
                      {latest ? formatValue(latest.value, fmt, def.decimals, def.clockBase ?? 0) : <span className="text-ink-4">—</span>}
                      {latest && def.unit && fmt === "number" && <span className="ml-0.5 text-[11px] font-semibold text-ink-3">{def.unit}</span>}
                    </div>
                    <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
                  </Link>
                );
              })}
            </Glass>
          </section>
        );
      })}
      </div>
    </Page>
  );
}
