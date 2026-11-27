import { ctx, parseDate } from "@/server/views";
import { ensureDefaultHabits, entriesBetween, listHabits } from "@/server/journal";
import { Glass, LargeTitle, Page, SectionHeader } from "@/ui/kit";
import { DateNav } from "@/ui/controls";
import { HabitManager, JournalDay } from "@/ui/Journal";
import { fmtDayLong } from "@/ui/format";
import { daysBetween } from "@/lib/metrics/periods";
import { formatHabitValue } from "@/lib/metrics/journal";
import { shiftDate } from "@/server/analytics/series";
import { associationsView } from "@/server/analytics/associations";
import { MIN_PAIRS, MIN_PER_GROUP, type Association } from "@/lib/metrics/associations";
import type { MetricDef } from "@/server/analytics/registry";
import { Sheet } from "@/ui/controls";
import { Icon } from "@/ui/icons";

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
  const assoc = associationsView(c.db, c.today, c.fb);

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

      <SectionHeader action={<AssocSheet />}>Associations</SectionHeader>
      {assoc.comparisons === 0 ? (
        <Glass className="flex flex-col gap-3 p-4">
          <p className="text-[14px] text-ink-2">Not enough observations yet. Baseline compares a habit with how you slept and recovered the next morning only once there is enough data, so that chance patterns are not shown as findings.</p>
          <ul className="flex flex-col gap-2">
            {assoc.habits.map(({ habit, results }) => {
              // Closest outcome to the minimum (the one with the most usable days).
              const a = [...results].map((r) => r.assoc).sort((x, y) => score(y) - score(x))[0];
              const txt = !a || a.status === "ok" ? "" : a.kind === "difference" ? `${Math.min(a.have.yes, MIN_PER_GROUP)}/${MIN_PER_GROUP} "yes" and ${Math.min(a.have.no, MIN_PER_GROUP)}/${MIN_PER_GROUP} "no" days` : `${Math.min(a.have, MIN_PAIRS)}/${MIN_PAIRS} logged days`;
              return <li key={habit.id} className="flex justify-between gap-3 text-[13px]"><span className="font-semibold">{habit.name}</span><span className="num text-ink-3">{txt}</span></li>;
            })}
          </ul>
          <p className="text-[12px] text-ink-3">Counts are days with both a log and next-morning data (best of the five outcomes), over the last 120 days.</p>
        </Glass>
      ) : (
        <Glass className="flex flex-col gap-3 p-4">
          {(() => {
            const ok = assoc.habits.flatMap(({ habit, results }) => results.filter((r) => r.assoc.status === "ok").map((r) => ({ habit, ...r })));
            const notable = ok.filter((r) => r.assoc.status === "ok" && r.assoc.notable), rest = ok.filter((r) => !(r.assoc.status === "ok" && r.assoc.notable));
            const line = ({ habit, outcome, assoc: a }: (typeof ok)[number]) => <AssocLine key={`${habit.id}-${outcome.id}`} habit={habit.name} kind={habit.kind} outcome={outcome} a={a} />;
            return (
              <>
                {notable.length ? notable.map(line) : <p className="text-[14px] text-ink-2">No association has a 95 % interval that excludes zero.</p>}
                {rest.length > 0 && (
                  <details className="group">
                    <summary className="pressable cursor-pointer list-none rounded-full bg-[var(--fill-2)] px-3.5 py-2 text-center text-[13px] font-semibold text-ink-2">Show all {rest.length} other results</summary>
                    <div className="mt-3 flex flex-col gap-3">{rest.map(line)}</div>
                  </details>
                )}
              </>
            );
          })()}
          <p className="text-[12px] leading-snug text-ink-3">
            {assoc.comparisons} comparisons. At 95 % confidence about {Math.max(1, Math.round(assoc.comparisons / 20))} of them can look notable by chance alone. These are associations in your own data, not causes.
          </p>
        </Glass>
      )}
    </Page>
  );
}

const OUTCOME_NAME: Record<string, string> = { hrv: "HRV", resting_hr: "resting HR", sleep_asleep: "time asleep", sleep_efficiency: "sleep efficiency", recovery: "recovery" };
const score = (a: Association) => (a.status === "ok" ? Infinity : a.kind === "difference" ? Math.min(a.have.yes, a.have.no) : a.have);

function AssocLine({ habit, kind, outcome, a }: { habit: string; kind: string; outcome: MetricDef; a: Association }) {
  if (a.status !== "ok") return null;
  const unit = outcome.unit === "h" ? "h" : outcome.unit;
  const f = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(outcome.decimals || 1)}`;
  return (
    <div className="rounded-2xl bg-[var(--fill)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[14px]"><span className="font-semibold">{habit} → next-morning {OUTCOME_NAME[outcome.id] ?? outcome.label}</span>{a.notable && <span className="text-[11px] font-semibold text-ink-2">CI excludes 0</span>}</div>
      <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
        {a.kind === "difference"
          ? `After "yes" days: ${f(a.diff)} ${unit} on average vs "no" days (95 % CI ${f(a.ci[0])} to ${f(a.ci[1])}; ${a.n.yes} vs ${a.n.no} days).`
          : `Rank correlation ${a.rho.toFixed(2)} (95 % CI ${a.ci[0].toFixed(2)} to ${a.ci[1].toFixed(2)}; ${a.n} days)${kind === "scale" ? " between your 1–5 rating" : " between the amount"} and the next-morning value.`}
      </p>
    </div>
  );
}

function AssocSheet() {
  return (
    <Sheet title="How associations work" triggerLabel="How associations work" triggerClassName="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-ink-2" trigger={<><Icon name="info" size={16} />Method</>}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p>Each habit on a day is compared with your <strong className="text-ink">next morning</strong>: HRV, resting heart rate, time asleep, sleep efficiency and recovery.</p>
        <p><strong className="text-ink">Yes/no habits</strong>: the average on the morning after &quot;yes&quot; days minus after &quot;no&quot; days, with a 95 % confidence interval (Welch). Needs at least {MIN_PER_GROUP} days of each.</p>
        <p><strong className="text-ink">Amounts and 1–5 ratings</strong>: Spearman rank correlation with a 95 % interval. Needs at least {MIN_PAIRS} days.</p>
        <p>Days you did not log are left out. An association can come from something else that changed at the same time (training, illness, a busy week). With many comparisons, some will look notable by chance. Treat results as prompts for your own experiments, not conclusions.</p>
        <p className="text-[12px] text-ink-3">docs/CALCULATIONS.md § ASSOCIATIONS</p>
      </div>
    </Sheet>
  );
}
