import Link from "next/link";
import { ctx } from "@/server/views";
import { calendarView } from "@/server/analytics/calendar";
import { getSettings } from "@/server/settings";
import { isMonth, monthGrid, monthOf, shiftMonth } from "@/lib/metrics/calendar";
import { Glass, LargeTitle, Page, Value } from "@/ui/kit";
import { Segmented } from "@/ui/controls";
import { HealthCalendar, type CalendarMetric } from "@/ui/HealthCalendar";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar · Baseline" };

const METRICS = [{ value: "recovery", label: "Recovery" }, { value: "sleep", label: "Sleep" }, { value: "load", label: "Load" }, { value: "steps", label: "Steps" }];
const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const c = ctx();
  const current = monthOf(c.today);
  const month = isMonth(sp.month) && sp.month <= current ? sp.month : current;
  const metric: CalendarMetric = typeof sp.show === "string" && ["recovery", "sleep", "load", "steps"].includes(sp.show) ? (sp.show as CalendarMetric) : "recovery";
  const v = calendarView(c.db, month, c.today, c.fb, c.tz);
  const past = v.days.filter((d) => !d.future);
  const avg = (f: (d: (typeof past)[number]) => number | null) => { const x = past.map(f).filter((n): n is number => n !== null); return x.length ? { v: x.reduce((a, b) => a + b, 0) / x.length, n: x.length } : null; };
  const rec = avg((d) => d.recovery), sleep = avg((d) => d.sleepScore);
  const workouts = past.reduce((a, d) => a + d.workouts.length, 0), rest = past.filter((d) => d.restDay).length;
  const href = (m: string) => `/calendar?month=${m}${metric !== "recovery" ? `&show=${metric}` : ""}`;
  const navBtn = "pressable grid size-9 place-items-center rounded-full text-ink-2";

  return (
    <Page accent="sleep">
      <LargeTitle back={{ href: "/health", label: "Health" }} eyebrow="Health calendar" title={monthFmt.format(Date.parse(`${month}-01T12:00:00Z`))}
        trailing={
          <div className="glass glass-pill flex items-center gap-0.5 p-1">
            <Link aria-label="Previous month" href={href(shiftMonth(month, -1))} transitionTypes={["nav-back"]} scroll={false} className={navBtn}><Icon name="chevronLeft" size={18} strokeWidth={2.4} /></Link>
            {month < current
              ? <Link aria-label="Next month" href={href(shiftMonth(month, 1))} transitionTypes={["nav-forward"]} scroll={false} className={navBtn}><Icon name="chevronRight" size={18} strokeWidth={2.4} /></Link>
              : <button aria-label="Next month" disabled className={`${navBtn} opacity-30`}><Icon name="chevronRight" size={18} strokeWidth={2.4} /></button>}
          </div>
        } />

      <Segmented param="show" value={metric} options={METRICS} />

      <Glass thick className="rise mt-3 p-3 sm:p-4">
        <HealthCalendar grid={monthGrid(month)} days={v.days} metric={metric} today={c.today} stepsGoal={getSettings(c.db).goals.stepsDaily} />
      </Glass>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: "Avg recovery", v: rec ? String(Math.round(rec.v)) : "—", s: rec ? `${rec.n} days` : "no scores yet" },
          { k: "Avg sleep score", v: sleep ? String(Math.round(sleep.v)) : "—", s: sleep ? `${sleep.n} nights` : "no nights" },
          { k: "Workouts", v: String(workouts), s: `${past.filter((d) => d.workouts.length).length} training days` },
          { k: "Rest days", v: String(rest), s: "tracked, no workout" },
        ].map((x) => (
          <Glass key={x.k} className="p-3">
            <div className="text-[12px] font-semibold text-ink-3">{x.k}</div>
            <div className="mt-1"><Value value={x.v} size="sm" /></div>
            <div className="mt-0.5 text-[11px] text-ink-3">{x.s}</div>
          </Glass>
        ))}
      </div>
      <p className="mt-3 px-1 text-[12px] leading-snug text-ink-3">Recovery and readiness appear once your HRV baseline is calibrated. Today&apos;s load and steps are totals so far. Workouts you excluded are not shown.</p>
    </Page>
  );
}
