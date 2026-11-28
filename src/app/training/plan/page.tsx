import Link from "next/link";
import { ctx } from "@/server/views";
import { planView } from "@/server/analytics/planner";
import { emptyPlan, planDayLabel, WEEKDAY_SHORT, weekdayIndex, type DayStatus } from "@/lib/metrics/training-plan";
import { CATEGORY_LABEL } from "@/lib/metrics/workout-labels";
import { Badge, Glass, LargeTitle, Page, SectionHeader, Value, cx } from "@/ui/kit";
import { DayEditor, SplitEditor } from "@/ui/PlanEditor";
import { fmtDuration, fmtNumber } from "@/ui/format";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training plan · Baseline" };

const STATUS: Record<DayStatus, { text: string; tone: "ok" | "neutral" | "warn" | "info" }> = {
  done: { text: "Done", tone: "ok" }, different: { text: "Trained", tone: "ok" }, missed: { text: "Not recorded", tone: "warn" },
  rest: { text: "Rested", tone: "neutral" }, restTrained: { text: "Trained", tone: "info" }, extra: { text: "Extra", tone: "info" },
  free: { text: "", tone: "neutral" }, upcoming: { text: "", tone: "neutral" }, before: { text: "", tone: "neutral" },
};
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** Weekly split, this week and next, adherence history and similar-workout comparisons. Never prescriptive. */
export default async function PlanPage() {
  const c = ctx();
  const v = planView(c.db, c.today, c.tz);
  const split = v.plan?.split ?? emptyPlan(c.today).split;
  const thisWeek = v.days.slice(0, 7), nextWeek = v.days.slice(7);
  const complete = v.weeks.filter((w) => !w.partial && w.planned > 0);

  return (
    <Page accent="load">
      <LargeTitle back={{ href: "/training", label: "Training" }} eyebrow="Training plan" title="Planner" trailing={<SplitEditor split={split} hasPlan={Boolean(v.plan)} />} />

      {v.plan ? (
        <div className="grid grid-cols-3 gap-3">
          <Glass thick className="rise p-3.5"><div className="text-[12px] font-semibold text-ink-3">Adherence</div><div className="mt-1"><Value value={pct(v.overall.rate)} size="md" /></div><div className="mt-0.5 text-[11px] text-ink-3">{v.overall.done + v.overall.different} of {v.overall.planned} sessions · 12 wk</div></Glass>
          <Glass thick className="rise rise-1 p-3.5"><div className="text-[12px] font-semibold text-ink-3">Consistent weeks</div><div className="mt-1"><Value value={String(v.consistentWeeks)} size="md" /></div><div className="mt-0.5 text-[11px] text-ink-3">in a row, all planned done</div></Glass>
          <Glass thick className="rise rise-2 p-3.5"><div className="text-[12px] font-semibold text-ink-3">Rest days kept</div><div className="mt-1"><Value value={String(v.overall.restKept)} size="md" /></div><div className="mt-0.5 text-[11px] text-ink-3">{v.overall.restTrained} trained instead · {v.overall.extra} extra</div></Glass>
        </div>
      ) : (
        <Glass thick className="rise p-5">
          <p className="text-[16px] font-semibold">Plan your training week</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">Name your training days (Push, Pull, Legs, …), set rest days, and Baseline compares them with the workouts Google records. Nothing is suggested for you, and no Hevy Pro is needed.</p>
        </Glass>
      )}

      <SectionHeader>Weekly split</SectionHeader>
      <Glass className="grid grid-cols-7 gap-1 p-2">
        {split.map((d, i) => (
          <div key={i} className={cx("flex min-w-0 flex-col items-center gap-1 rounded-[12px] px-0.5 py-2 text-center", d.kind === "train" ? "bg-[color-mix(in_oklab,var(--load)_16%,transparent)]" : "bg-[var(--fill)]")}>
            <span className="text-[11px] font-bold text-ink-3">{WEEKDAY_SHORT[i]}</span>
            <span className={cx("w-full truncate text-[11px] font-semibold", d.kind === "free" && "text-ink-4")}>{d.kind === "free" ? "—" : planDayLabel(d)}</span>
          </div>
        ))}
      </Glass>

      {[{ title: "This week", days: thisWeek }, { title: "Next week", days: nextWeek }].map((sec) => (
        <section key={sec.title}>
          <SectionHeader>{sec.title}</SectionHeader>
          <Glass className="list overflow-hidden">
            {sec.days.map((d) => {
              const st = STATUS[d.status];
              const label = `${WEEKDAY_SHORT[weekdayIndex(d.date)]} ${dayFmt.format(Date.parse(`${d.date}T12:00:00Z`))}: ${d.planned.kind === "free" ? "unplanned" : planDayLabel(d.planned)}${st.text ? `, ${st.text}` : ""}. Adjust this day`;
              return (
                <DayEditor key={d.date} date={d.date} day={d.planned} overridden={d.overridden} label={label} trigger={
                  <div className={cx("hoverable flex min-h-[56px] items-center gap-3 px-4 py-2.5", d.date === c.today && "bg-[var(--fill)]")}>
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-[11px] font-bold text-ink-3">{WEEKDAY_SHORT[weekdayIndex(d.date)]}</div>
                      <div className="num text-[17px] font-bold">{d.date.slice(8)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate text-[15px] font-semibold", d.planned.kind === "free" && "text-ink-3")}>
                        {d.planned.kind === "free" ? "Unplanned" : planDayLabel(d.planned)}
                        {d.planned.kind === "train" && d.planned.category && d.planned.name && d.planned.name.toLowerCase() !== CATEGORY_LABEL[d.planned.category].toLowerCase() && <span className="ml-1.5 text-[12px] font-medium text-ink-3">{CATEGORY_LABEL[d.planned.category]}</span>}
                        {d.overridden && <span className="ml-1.5 align-middle"><Badge>Adjusted</Badge></span>}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">{d.workouts.length ? d.workouts.map((w) => w.title).join(" · ") : d.date === c.today ? "Today" : d.date > c.today ? "Upcoming" : "No workout recorded"}</div>
                    </div>
                    {st.text && <Badge tone={st.tone}>{st.text}</Badge>}
                    <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
                  </div>
                } />
              );
            })}
          </Glass>
        </section>
      ))}

      {v.plan && (
        <>
          <SectionHeader>Adherence by week</SectionHeader>
          <Glass className="p-4">
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label={`Weekly adherence: ${complete.map((w) => `${dayFmt.format(Date.parse(`${w.start}T12:00:00Z`))} ${pct(w.rate)}`).join(", ") || "no complete planned weeks yet"}`}>
              {v.weeks.map((w) => (
                <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  {w.planned > 0 ? (
                    <div className="w-full rounded-[6px] bg-[var(--track)]" style={{ height: "100%", position: "relative" }}>
                      <div className={cx("absolute inset-x-0 bottom-0 rounded-[6px]", w.partial && "opacity-50")} style={{ height: `${Math.max(4, (w.rate ?? 0) * 100)}%`, background: "var(--load)" }} />
                    </div>
                  ) : <div className="h-1 w-full rounded-full border border-dashed border-[var(--ink-4)]" />}
                </div>
              ))}
            </div>
            <div className="num mt-1.5 flex justify-between text-[10.5px] text-ink-3" aria-hidden="true">
              <span>{dayFmt.format(Date.parse(`${v.weeks[0]!.start}T12:00:00Z`))}</span><span>this week</span>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">Share of planned training days with a recorded workout. Dashed: no planned training (or before the plan). The current week is shown lighter; today is never counted as missed.</p>
          </Glass>
        </>
      )}

      <SectionHeader>Similar workouts</SectionHeader>
      {v.similar.length ? (
        <div className="flex flex-col gap-3">
          {v.similar.slice(0, 6).map((g) => (
            <Glass key={g.key} className="overflow-hidden" aria-label={`${g.label} workouts`}>
              <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5">
                <span className="text-[15px] font-bold">{g.label}</span>
                <span className="text-[12px] text-ink-3">{g.count} in 180 days</span>
              </div>
              <div className="num grid grid-cols-4 gap-2 px-4 pt-2 pb-3 text-[12px]">
                {[{ k: "Duration", v: fmtDuration(g.average.durationMin, { compact: true }) }, { k: "Avg HR", v: g.average.avgHr !== null ? `${Math.round(g.average.avgHr)}` : "—" }, { k: "Load", v: g.average.trimp !== null ? fmtNumber(g.average.trimp) : "—" }, { k: "Effort", v: g.average.effort !== null ? fmtNumber(g.average.effort, 1) : "—" }].map((x) => (
                  <div key={x.k}><div className="text-ink-3">{x.k}</div><div className="text-[15px] font-semibold">{x.v}</div></div>
                ))}
              </div>
              <div className="overflow-x-auto border-t border-hairline">
                <table className="num w-full min-w-[340px] text-[13px]">
                  <caption className="sr-only">Last {g.recent.length} {g.label} workouts</caption>
                  <thead><tr className="text-left text-[11px] text-ink-3"><th scope="col" className="px-4 py-2 font-semibold">Date</th><th scope="col" className="py-2 font-semibold">Time</th><th scope="col" className="py-2 font-semibold">Avg HR</th><th scope="col" className="py-2 font-semibold">Load</th><th scope="col" className="py-2 pr-4 font-semibold">Effort</th></tr></thead>
                  <tbody>
                    {g.recent.map((r) => (
                      <tr key={r.id} className="border-t border-hairline">
                        <td className="px-4 py-2"><Link href={`/training/${encodeURIComponent(r.id)}`} transitionTypes={["nav-forward"]} className="font-semibold underline-offset-2 hover:underline">{dayFmt.format(Date.parse(`${r.date}T12:00:00Z`))}</Link></td>
                        <td className="py-2">{fmtDuration(r.durationMin, { compact: true })}</td>
                        <td className="py-2">{r.avgHr !== null ? Math.round(r.avgHr) : "—"}</td>
                        <td className="py-2">{r.trimp !== null ? Math.round(r.trimp) : "—"}</td>
                        <td className="py-2 pr-4">{r.effort ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Glass>
          ))}
        </div>
      ) : <Glass className="p-5 text-center text-[14px] text-ink-3">No workouts in the last 180 days.</Glass>}
      <p className="mt-4 px-1 text-[12px] leading-snug text-ink-3">
        Workouts come from Google Health (Fitbit Air and Hevy via Apple Health). Label a workout&apos;s category on its page to group it with similar sessions; a planned category is matched against that label, and unlabelled workouts count for any training day. Baseline does not recommend or change sessions, and recovery scores are not used here.
      </p>
    </Page>
  );
}
