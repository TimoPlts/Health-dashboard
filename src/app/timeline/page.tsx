import { ctx, earliestDataDate, parseDate } from "@/server/views";
import { timelineView } from "@/server/analytics/timeline";
import { Glass, LargeTitle, Page, SectionHeader } from "@/ui/kit";
import { DateNav, Sheet } from "@/ui/controls";
import { DayTimeline } from "@/ui/charts/DayTimeline";
import { fmtDayLong, fmtNumber } from "@/ui/format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline · Baseline" };

export default async function TimelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const date = parseDate(sp.date, c.today);
  const d = timelineView(c.db, date, c.tz);

  return (
    <Page accent="heart">
      <LargeTitle back={{ href: "/health", label: "Health" }} eyebrow={fmtDayLong(date)} title="Timeline" />
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <DateNav date={date} today={c.today} earliest={earliestDataDate(c.db, c.fb)} />
        <Sheet title="How the timeline works" triggerLabel="How the timeline works" triggerClassName="inline-flex items-center gap-1.5 rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold" trigger={<><Icon name="info" size={15} />Method</>}>
          <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
            <p>The day runs from local midnight to the next local midnight in {c.tz}{d.hoursInDay !== 24 ? `. Today has ${d.hoursInDay} hours because of a daylight-saving change, and times show the zone abbreviation` : ""}.</p>
            <p>Heart rate is drawn as the mean of each minute, with a faint band from that minute&apos;s lowest to highest sample. The line breaks wherever no sample exists for more than 5 minutes: gaps are never filled in.</p>
            <p>Zones use % of your maximum heart rate ({d.hrMax ? `${d.hrMax} bpm, ${d.hrMaxSource === "override" ? "your setting" : "220 − age as Google uses"}` : "not available: set your age or HRmax in Settings"}), the same zones as cardio load. Each sample counts until the next one, at most 30 seconds.</p>
            <p>Steps and Active Zone Minutes are Google&apos;s intervals, spread over minutes in proportion to overlap, so totals are kept. Journal entries are per day and have no time.</p>
            <p>The database keeps every original sample ({fmtNumber(d.rawSamples)} heart-rate samples this day); only the display is summarised per minute.</p>
            <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § TIMELINE</p>
          </div>
        </Sheet>
      </div>

      <Glass thick className="rise p-4">
        <DayTimeline d={d} />
      </Glass>

      <SectionHeader href={`/journal${date !== c.today ? `?date=${date}` : ""}`}>Journal</SectionHeader>
      <Glass className="p-4">
        {d.journal.length ? (
          <ul className="flex flex-wrap gap-2">
            {d.journal.map((j) => (
              <li key={j.id} className="rounded-full bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-semibold">
                {j.name} <span className="num font-medium text-ink-3">{j.kind === "boolean" ? (j.value ? "yes" : "no") : `${fmtNumber(j.value, 1)}${j.unit ? ` ${j.unit}` : j.kind === "scale" ? "/5" : ""}`}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[14px] text-ink-3">Nothing logged for this day.</p>}
        <p className="mt-2 text-[12px] text-ink-3">Journal entries apply to the whole day.</p>
      </Glass>
    </Page>
  );
}
