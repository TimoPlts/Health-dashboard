import Link from "next/link";
import { ctx } from "@/server/views";
import { weightHistory } from "@/server/analytics/weight";
import { Glass, LargeTitle, Page } from "@/ui/kit";
import { EntryActions } from "@/ui/WeightEditors";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weight history · Baseline" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** Every weigh-in, newest first, grouped by day. Manual entries can be edited or deleted; Google entries are read-only. */
export default async function WeightHistoryPage() {
  const c = ctx();
  const h = weightHistory(c.db, c.fb, c.tz);
  return (
    <Page accent="body">
      <LargeTitle back={{ href: "/weight", label: "Weight" }} eyebrow={`${h.totalEntries} weigh-ins on ${h.totalDays} days`} title="History"
        trailing={<Link href="/calendar?show=weight" transitionTypes={["nav-forward"]} aria-label="Weight calendar" className="glass glass-pill pressable grid size-10 place-items-center text-ink-2"><Icon name="calendar" size={20} /></Link>} />
      <p className="mb-3 px-1 text-[12px] leading-snug text-ink-3">The day&apos;s weight is your morning weigh-in: the one you logged or marked, otherwise the first between 03:00 and 12:00. Tap a weigh-in to edit a manual entry, add a note or choose it as the day&apos;s weight. Google entries are read-only.</p>
      {h.days.length ? (
        <div className="flex flex-col gap-3">
          {h.days.map((day) => {
            const label = dayFmt.format(Date.parse(`${day.date}T12:00:00Z`));
            return (
              <section key={day.date} aria-label={label}>
                <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-3">{label}</h2>
                <Glass className="list overflow-hidden">
                  {day.entries.map((e) => <EntryActions key={e.key} e={e} dateLabel={label} />)}
                </Glass>
              </section>
            );
          })}
        </div>
      ) : <Glass className="p-5 text-center text-[14px] text-ink-3">No weigh-ins yet. Log one on the Weight page or from Today.</Glass>}
      {h.totalDays > h.days.length && <p className="mt-3 px-1 text-[12px] text-ink-3">Showing the latest {h.days.length} days. Older weigh-ins are in the export (Settings → Data).</p>}
    </Page>
  );
}
