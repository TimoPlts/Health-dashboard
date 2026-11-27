import { ctx, parseDate } from "@/server/views";
import { ensureDefaultHabits, entriesBetween, listHabits } from "@/server/journal";
import { Glass, LargeTitle, Page, SectionHeader } from "@/ui/kit";
import { DateNav } from "@/ui/controls";
import { HabitManager, JournalDay } from "@/ui/Journal";
import { fmtDayLong } from "@/ui/format";
import { daysBetween } from "@/lib/metrics/periods";
import { formatHabitValue } from "@/lib/metrics/journal";
import { shiftDate } from "@/server/analytics/series";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal · Baseline" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const date = parseDate(sp.date, c.today);
  ensureDefaultHabits(c.db);
  const all = listHabits(c.db, true);
  const habits = all.filter((h) => !h.archivedAt), archived = all.filter((h) => h.archivedAt);
  const from = shiftDate(c.today, -27);
  const entries = entriesBetween(c.db, from, c.today);
  const today = entriesBetween(c.db, date, date);
  const values = Object.fromEntries(habits.flatMap((h) => { const v = today.get(h.id)?.get(date); return v === undefined ? [] : [[h.id, v]]; }));
  const days = daysBetween(from, c.today);
  const logged = Object.keys(values).length;

  return (
    <Page accent="recovery">
      <LargeTitle back={{ href: "/", label: "Today" }} eyebrow={fmtDayLong(date)} title="Journal" trailing={<HabitManager habits={habits} archived={archived} />} />
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <DateNav date={date} today={c.today} />
        <span className="text-[13px] text-ink-3">{logged} of {habits.length} logged</span>
      </div>
      {habits.length ? (
        <Glass className="rise overflow-hidden"><JournalDay key={date} date={date} habits={habits} values={values} /></Glass>
      ) : <Glass className="p-5 text-center text-[14px] text-ink-3">No habits. Add one with Habits.</Glass>}

      <SectionHeader>Last 4 weeks</SectionHeader>
      <Glass className="flex flex-col gap-3 p-4">
        {habits.map((h) => {
          const e = entries.get(h.id) ?? new Map<string, number>();
          const n = days.filter((d) => e.has(d)).length;
          const max = h.kind === "scale" ? 5 : h.kind === "number" ? Math.max(1, ...days.map((d) => e.get(d) ?? 0)) : 1;
          return (
            <div key={h.id}>
              <div className="mb-1 flex justify-between text-[13px]"><span className="font-semibold">{h.name}</span><span className="text-ink-3">{n} of {days.length} days logged</span></div>
              <div className="flex gap-[3px]" role="img" aria-label={`${h.name}: logged on ${n} of the last ${days.length} days`}>
                {days.map((d) => {
                  const v = e.get(d);
                  return (
                    <span key={d} title={`${d}: ${v === undefined ? "not logged" : formatHabitValue(h, v)}`} className="block h-5 flex-1 rounded-[4px]"
                      style={v === undefined ? { background: "var(--fill)" }
                        : h.kind === "boolean" ? (v ? { background: "var(--recovery)" } : { boxShadow: "inset 0 0 0 1.5px var(--recovery)" })
                        : { background: "var(--recovery)", opacity: 0.25 + 0.75 * (v / max) }} />
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="text-[12px] text-ink-3">Filled = yes or an amount (darker = more), outlined = no, grey = not logged. Not logging is never read as &quot;no&quot;.</p>
      </Glass>
    </Page>
  );
}
