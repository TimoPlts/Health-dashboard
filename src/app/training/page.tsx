import Link from "next/link";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getWorkouts } from "@/server/queries";
import { Glass, PageTitle, cx } from "@/ui/primitives";
import { Icon } from "@/ui/icons";
import { fmtDuration, fmtNumber } from "@/ui/format";

export const dynamic = "force-dynamic";

export default function TrainingPage() {
  const tz = env().HOME_TIME_ZONE;
  const workouts = getWorkouts(db(), 100);
  const byMonth = new Map<string, typeof workouts>();
  const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long", year: "numeric" });
  for (const w of workouts) {
    const k = monthFmt.format(w.startMs);
    byMonth.set(k, [...(byMonth.get(k) ?? []), w]);
  }
  const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric" });
  const wdFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" });

  return (
    <>
      <PageTitle eyebrow="Hevy workouts with Fitbit heart rate" title="Training" />
      {workouts.length === 0 && <Glass className="p-5 text-[14px] text-ink-2">No workouts yet. Connect Hevy in Settings to import your history.</Glass>}
      {[...byMonth.entries()].map(([month, ws]) => (
        <section key={month} className="mb-6">
          <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{month}</h2>
          <Glass className="divide-y divide-[var(--hairline)] overflow-hidden">
            {ws.map((w) => (
              <Link key={w.id} href={`/training/${encodeURIComponent(w.id)}`} className="pressable flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 shrink-0 text-center">
                  <div className="text-[11px] font-semibold uppercase text-ink-3">{wdFmt.format(w.startMs)}</div>
                  <div className="text-[20px] leading-tight font-semibold tabular">{dayFmt.format(w.startMs)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold">{w.title}</div>
                  <div className="text-[13px] text-ink-2 tabular">
                    {fmtDuration((w.endMs - w.startMs) / 60000, { compact: true })} · {w.exercises} exercises · {fmtNumber(w.volume.volumeKg)} kg
                  </div>
                </div>
                <div className="text-right">
                  <div className={cx("flex items-center justify-end gap-1 text-[15px] font-semibold tabular", w.hr.avg === null && "text-ink-3")}>
                    <span className="text-heart"><Icon name="heart" size={14} strokeWidth={2.2} /></span>
                    {w.hr.avg !== null ? Math.round(w.hr.avg) : "—"}
                  </div>
                  {w.hr.avg !== null && w.hr.coverage < 0.8 && <div className="text-[11px] font-medium text-warn">{Math.round(w.hr.coverage * 100)}% coverage</div>}
                </div>
              </Link>
            ))}
          </Glass>
        </section>
      ))}
    </>
  );
}
