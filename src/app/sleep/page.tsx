import Link from "next/link";
import { ctx, parseDate, sleepView } from "@/server/views";
import { Calibrating, Glass, Label, LargeTitle, Page, SectionHeader, Value, cx, toneVar } from "@/ui/kit";
import { Meter, Ring } from "@/ui/charts/Ring";
import { Hypnogram, StageLegend } from "@/ui/charts/Hypnogram";
import { Spark, TrendChart } from "@/ui/charts/TrendChart";
import { formatValue } from "@/ui/value-format";
import { DateNav, Sheet } from "@/ui/controls";
import { Icon } from "@/ui/icons";
import { fmtDayLong, fmtDuration, fmtTime } from "@/ui/format";
import { HrChart } from "@/ui/charts/HrChart";
import type { NightSummary } from "@/server/analytics/sleep-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sleep · Baseline" };

export default async function SleepPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const v = sleepView(parseDate(sp.date, ctx().today));
  const { day, night } = v;
  const sc = day.sleepScore;
  const stageMin = night?.stages ?? {};
  const asleep = night?.minutesAsleep ?? null;
  const pct = (m: number | undefined) => (m !== undefined && asleep ? Math.round((m / asleep) * 100) : null);
  const comp = sc?.components;
  const x = v.detail;

  return (
    <Page accent="sleep">
      <LargeTitle eyebrow={fmtDayLong(v.date)} title="Sleep" />
      <div className="mb-4 px-1"><DateNav date={v.date} today={v.today} earliest={v.earliest} /></div>

      <Glass thick className="rise p-5">
        {night ? (
          <>
            <div className="flex items-center gap-5">
              <Ring value={sc ? sc.score : null} color={toneVar("sleep")} size={118} stroke={11} label={sc ? `Sleep score ${Math.round(sc.score)}` : "No score"}>
                <div className="flex flex-col items-center">
                  {sc ? <Value value={String(Math.round(sc.score))} size="lg" /> : <span className="text-ink-4">—</span>}
                  <span className="mt-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Score</span>
                </div>
              </Ring>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div>
                  <Label>Time asleep</Label>
                  <Value value={fmtDuration(asleep, { compact: true })} size="lg" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Meter value={asleep} max={Math.max(v.needMin * 1.15, asleep ?? 0)} target={v.needMin} color={toneVar("sleep")} label="Asleep versus sleep need" />
                  <span className="text-[12px] text-ink-3">Need {fmtDuration(v.needMin, { compact: true })} <span className="text-ink-4">(estimate)</span></span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-hairline pt-4 text-center">
              <div><div className="text-[12px] font-semibold text-ink-3">In bed</div><div className="num mt-0.5 text-[15px] font-semibold">{fmtTime(night.startMs, v.tz)}</div></div>
              <div><div className="text-[12px] font-semibold text-ink-3">Woke up</div><div className="num mt-0.5 text-[15px] font-semibold">{fmtTime(night.endMs, v.tz)}</div></div>
              <div><div className="text-[12px] font-semibold text-ink-3">Efficiency</div><div className="num mt-0.5 text-[15px] font-semibold">{night.minutesAsleep !== null ? `${Math.round((night.minutesAsleep / night.timeInBedMin) * 100)}%` : "—"}</div></div>
            </div>
          </>
        ) : (
          <div className="py-6 text-center"><p className="text-[16px] font-semibold">No sleep recorded</p><p className="mt-1 text-[13px] text-ink-3">Wear the Fitbit Air overnight and sync the Google Health app.</p></div>
        )}
      </Glass>

      <SectionHeader action={<CalcSheet />}>{v.date === v.today ? "Tonight" : "Next night"}</SectionHeader>
      <Glass className="rise rise-1 p-4">
        {x.bedtime ? (
          <div className="flex items-center gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--sleep)_18%,transparent)] text-sleep"><Icon name="sleep" size={22} strokeWidth={2} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><Value value={clock(x.bedtime.bedtimeMin)} size="lg" /><span className="text-[13px] font-semibold text-ink-3">in bed by</span></div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                to sleep {fmtDuration(x.bedtime.needMin, { compact: true })} before {x.bedtime.wakeSource === "target" ? "your wake-up target" : "your usual wake-up time"} of <strong className="text-ink">{clock(x.bedtime.wakeMin)}</strong>
                {x.bedtime.efficiencyPct !== null ? `, allowing for your usual ${Math.round(x.bedtime.efficiencyPct)}% sleep efficiency.` : "."}
              </p>
              {x.bedtime.basis === "need-only" && <p className="mt-1 text-[12px] text-ink-3">Minimum only: your usual efficiency is known after 5 nights ({x.bedtime.nights}/5).</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-ink-2">A bedtime recommendation needs a wake-up target or your usual wake-up time.</p>
            <Calibrating have={5 - x.usualWakeNightsNeeded} need={5} what="usual wake-up time" compact />
          </div>
        )}
        <Link href="/settings#personal" className="mt-3 inline-block text-[13px] font-semibold text-ink-2 underline decoration-[var(--hairline)] underline-offset-4">Set wake-up target and sleep need</Link>
      </Glass>

      {night && (
        <>
          <SectionHeader>Stages</SectionHeader>
          <Glass className="rise rise-1 p-4">
            <Hypnogram segments={v.stages} startMs={night.startMs} endMs={night.endMs} timeZone={v.tz} height={132} />
            <div className="mt-4"><StageLegend minutes={stageMin} /></div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[12px] text-ink-3 tabular">
              <span>{pct(stageMin.AWAKE) !== null ? `${pct(stageMin.AWAKE)}%` : ""}</span>
              <span>{pct(stageMin.REM) !== null ? `${pct(stageMin.REM)}% · 20–25` : ""}</span>
              <span>{pct(stageMin.LIGHT) !== null ? `${pct(stageMin.LIGHT)}%` : ""}</span>
              <span>{pct(stageMin.DEEP) !== null ? `${pct(stageMin.DEEP)}% · 13–23` : ""}</span>
            </div>
            {x.interruptions && (
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-4 text-center">
                <div><div className="text-[12px] font-semibold text-ink-3">Awake after falling asleep</div><div className="num mt-0.5 text-[15px] font-semibold">{fmtDuration(x.interruptions.wasoMin, { compact: true })}</div></div>
                <div><div className="text-[12px] font-semibold text-ink-3">Wakings</div><div className="num mt-0.5 text-[15px] font-semibold">{x.interruptions.interruptions}</div></div>
                <div><div className="text-[12px] font-semibold text-ink-3">Longest</div><div className="num mt-0.5 text-[15px] font-semibold">{fmtDuration(x.interruptions.longestMin, { compact: true })}</div></div>
                <p className="col-span-3 mt-1 text-[12px] text-ink-3">{x.interruptions.shortAwakenings} short awakenings flagged by Google (brief, inside a sleep stage, not counted as awake time).</p>
              </div>
            )}
          </Glass>

          {x.overnight && (
            <>
              <SectionHeader>Overnight</SectionHeader>
              <div className="flex flex-col gap-3">
                {([
                  ["Heart rate", x.overnight.hr, "bpm", "var(--heart)", 10, 5, 0, "1-minute averages of 3-second samples"],
                  ["Heart rate variability", x.overnight.hrv, "ms", "var(--heart)", 10, 5, 0, "rMSSD per 5-minute window during sleep"],
                  ["Blood oxygen", x.overnight.spo2, "%", "var(--vitals)", 2, 0.5, 1, "Per-minute SpO₂ during sleep. Not a medical measurement"],
                ] as const).map(([title, series, unit, color, step, pad, dec, note]) => (
                  <Glass key={title} className="p-4">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-semibold">{title}</span>
                      <span className="num text-[12px] text-ink-3">{series.length ? `${rangeText(series.map((p) => p.bpm), dec)} ${unit}` : ""}</span>
                    </div>
                    <HrChart samples={series} fromMs={x.overnight!.startMs} toMs={x.overnight!.endMs} timeZone={v.tz} height={120} unit={unit} color={color}
                      step={step} pad={pad} decimals={dec} label={`${title} during the night`} emptyText={`No ${title.toLowerCase()} recorded this night`} />
                    <p className="mt-1.5 text-[11px] text-ink-3">{note}</p>
                  </Glass>
                ))}
              </div>
            </>
          )}

          {sc && comp && (
            <>
              <SectionHeader action={
                <Sheet title="How the sleep score works" triggerClassName="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-ink-2" trigger={<><Icon name="info" size={16} />Method</>}>
                  <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
                    <p>Baseline&apos;s sleep score combines four parts of last night against published adult norms. It is <strong className="text-ink">not</strong> the Fitbit Sleep Score — Google does not share that through its API.</p>
                    <ul className="flex flex-col gap-1.5">
                      <li><strong className="text-ink">Duration · 50%</strong> — time asleep against your sleep need.</li>
                      <li><strong className="text-ink">Efficiency · 20%</strong> — share of time in bed asleep; 90%+ scores full, 85% is the clinical threshold.</li>
                      <li><strong className="text-ink">Deep · 15%</strong> — full marks at 13–23% of sleep (Ohayon 2004).</li>
                      <li><strong className="text-ink">REM · 15%</strong> — full marks at 20–25% of sleep.</li>
                    </ul>
                    <p className="text-[12px] text-ink-3">Version sleep-score@1 · docs/CALCULATIONS.md § SLP-SCORE</p>
                  </div>
                </Sheet>}>Score breakdown</SectionHeader>
              <Glass className="flex flex-col gap-3.5 p-4">
                {([["Duration", comp.duration, "50%"], ["Efficiency", comp.efficiency, "20%"], ["Deep sleep", comp.deep, "15%"], ["REM sleep", comp.rem, "15%"]] as const).map(([k, val, w]) => (
                  <div key={k} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[13px]"><span className="font-semibold">{k} <span className="font-normal text-ink-3">· {w}</span></span><span className="num font-semibold text-ink-2">{val === null ? "—" : Math.round(val)}</span></div>
                    <Meter value={val} max={100} color={toneVar("sleep")} label={`${k} component`} />
                  </div>
                ))}
              </Glass>
            </>
          )}

          <SectionHeader>Compared with other nights</SectionHeader>
          <Glass className="p-4"><NightCompare night={x.night} previous={x.previous} average={x.average} /></Glass>
        </>
      )}

      {x.naps.length > 0 && (
        <>
          <SectionHeader>Naps</SectionHeader>
          <Glass className="list overflow-hidden">
            {x.naps.map((n) => (
              <div key={n.startMs} className="flex items-center justify-between px-4 py-3 text-[14px]">
                <span className="font-semibold">{fmtTime(n.startMs, v.tz)} – {fmtTime(n.endMs, v.tz)}</span>
                <span className="num text-ink-2">{n.asleepMin !== null ? `${fmtDuration(n.asleepMin, { compact: true })} asleep` : "—"}</span>
              </div>
            ))}
          </Glass>
          <p className="mt-2 px-1 text-[12px] text-ink-3">Naps are listed separately. The sleep score, need and debt use the main sleep of each night only.</p>
        </>
      )}

      <SectionHeader href="/metric/sleep_asleep">Last 14 nights</SectionHeader>
      <Glass className="p-4">
        <TrendChart points={v.last14.map((n) => ({ date: n.date, value: n.asleepH }))} color={toneVar("sleep")} kind="bar" height={150} format="hours" target={{ value: v.needMin / 60, label: "Need" }} label="Hours asleep, last 14 nights" />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
          <div>
            <Label>Sleep debt · 7 nights</Label>
            {day.sleepDebtNights >= 3 && day.sleepDebtMin !== null
              ? <><Value value={fmtDuration(day.sleepDebtMin, { compact: true })} size="md" /><div className="text-[12px] text-ink-3">{day.sleepDebtNights} of 7 nights tracked</div></>
              : <Calibrating have={day.sleepDebtNights} need={3} what="sleep debt" compact />}
          </div>
          <div>
            <Label>Consistency</Label>
            {v.consistency.status === "ok" && v.consistency.sri
              ? <><Value value={String(Math.round(v.consistency.sri.sri))} unit="SRI" size="md" /><div className="text-[12px] text-ink-3">{v.consistency.midpoint ? `Midpoint ±${Math.round(v.consistency.midpoint.sdMin)} min` : ""}</div></>
              : <Calibrating have={v.consistency.status === "calibrating" ? v.consistency.have : 0} need={5} what="regularity" compact />}
          </div>
        </div>
      </Glass>

      <SectionHeader href="/metric/sleep_debt">Sleep debt · 30 days</SectionHeader>
      <Glass className="p-4">
        <TrendChart points={x.debtHistory} color={toneVar("sleep")} kind="bar" height={120} format="hours" zero label="Seven-night sleep debt, last 30 days" />
        <p className="mt-2 text-[12px] text-ink-3">Each bar is the shortfall against your sleep need over the 7 nights up to that day. Shown once 3 of those nights are tracked.</p>
      </Glass>

      <SectionHeader>Bed &amp; wake times</SectionHeader>
      <Glass className="p-4">
        <BedWake rows={v.last14} />
      </Glass>

      <SectionHeader href="/health">During sleep</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        {v.vitals.map((x) => (
          <Link key={x.def.id} href={`/metric/${x.def.id}`} transitionTypes={["nav-forward"]} className="glass pressable flex flex-col gap-2 p-3.5">
            <Label tone={x.def.tone}>{x.def.short ?? x.def.label}</Label>
            <div className="flex items-end justify-between">
              <Value value={x.value === null ? "—" : formatValue(x.value, "number", x.def.decimals)} unit={x.def.unit} size="sm" />
              <Spark values={x.spark} color={toneVar(x.def.tone)} width={56} height={22} />
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}

/** Bed→wake bars per night on a 20:00–12:00 clock axis (bedtime value is minutes after noon). */
function BedWake({ rows }: { rows: { date: string; bed: number | null; wake: number | null }[] }) {
  const start = 8 * 60, span = 16 * 60; // 20:00 → 12:00 next day, in minutes after noon
  const pos = (minAfterNoon: number) => Math.max(0, Math.min(100, ((minAfterNoon - start) / span) * 100));
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "narrow" });
  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.date} className="flex items-center gap-2">
            <span className="w-3 text-[11px] font-semibold text-ink-3">{fmt.format(Date.parse(`${r.date}T12:00:00Z`))}</span>
            <div className="relative h-3 flex-1 rounded-full bg-[var(--fill)]">
              {r.bed !== null && r.wake !== null && (
                <div className={cx("absolute h-full rounded-full")} style={{ left: `${pos(r.bed)}%`, width: `${Math.max(1, pos(r.wake + 720) - pos(r.bed))}%`, background: "var(--sleep)" }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 ml-5 flex justify-between text-[11px] font-medium text-ink-3 tabular"><span>20:00</span><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span></div>
    </div>
  );
}

const clock = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(Math.round(((min % 1440) + 1440) % 1440 % 60)).padStart(2, "0")}`;
const rangeText = (v: number[], dec: number) => `${Math.min(...v).toFixed(dec)}–${Math.max(...v).toFixed(dec)}`;

/** This night vs the previous night vs the 14-night average. Missing values show as —. */
function NightCompare({ night, previous, average }: { night: NightSummary | null; previous: NightSummary | null; average: NightSummary & { nights: number } }) {
  const dur = (m: number | null) => (m === null ? "—" : fmtDuration(m, { compact: true }));
  const pct = (m: number | null) => (m === null ? "—" : `${Math.round(m)}%`);
  const num = (m: number | null, d = 0) => (m === null ? "—" : m.toFixed(d));
  const bed = (m: number | null) => (m === null ? "—" : clock(m + 720));
  const wake = (m: number | null) => (m === null ? "—" : clock(m));
  const rows: [string, (n: NightSummary) => string][] = [
    ["Score", (n) => num(n.score)], ["Asleep", (n) => dur(n.asleepMin)], ["Efficiency", (n) => pct(n.efficiencyPct)],
    ["Deep", (n) => dur(n.deepMin)], ["REM", (n) => dur(n.remMin)], ["Awake after onset", (n) => dur(n.wasoMin)],
    ["Wakings", (n) => num(n.interruptions, n.date === "avg" ? 1 : 0)], ["Bedtime", (n) => bed(n.bedtime)], ["Wake-up", (n) => wake(n.wake)],
  ];
  const cols = [night, previous, average];
  return (
    <div>
      <div className="grid grid-cols-[1fr_repeat(3,minmax(0,4.2rem))] gap-x-2 pb-2 text-right text-[12px] font-semibold text-ink-3">
        <span className="text-left">Measure</span><span>This night</span><span>Previous</span><span>{average.nights}-night avg</span>
      </div>
      <div className="list">
        {rows.map(([label, f]) => (
          <div key={label} className="grid grid-cols-[1fr_repeat(3,minmax(0,4.2rem))] items-center gap-x-2 py-2 text-right text-[14px]">
            <span className="text-left text-ink-2">{label}</span>
            {cols.map((c, i) => <span key={i} className={cx("num", i === 0 && "font-semibold")}>{c ? f(c) : "—"}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Plain-language method summary for every sleep number on this page. */
function CalcSheet() {
  return (
    <Sheet title="How sleep is calculated" triggerClassName="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-ink-2" trigger={<><Icon name="info" size={16} />Methods</>}>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
        <p><strong className="text-ink">Measured by the Fitbit Air (via Google):</strong> sleep start and end, stages, minutes asleep, breathing rate, SpO₂, HRV and heart rate.</p>
        <p><strong className="text-ink">Sleep need</strong> is your setting (default 8 h, the middle of the 7–9 h adult recommendation). It is an estimate, not a measurement.</p>
        <p><strong className="text-ink">Recommended bedtime</strong> = wake-up target − sleep need ÷ your usual sleep efficiency (median of the last 14 nights, from 5 nights on). Your wake-up target is a setting; without one, your usual wake-up time is used.</p>
        <p><strong className="text-ink">Sleep debt</strong> adds up how far each of the last 7 nights fell short of your need. Extra sleep does not cancel earlier debt. Nights without data are skipped, never counted as zero.</p>
        <p><strong className="text-ink">Awake after falling asleep</strong> (WASO, a standard sleep-lab measure) counts the awake periods between first falling asleep and the final wake-up. <strong className="text-ink">Wakings</strong> is how many there were.</p>
        <p><strong className="text-ink">Consistency (SRI)</strong> is the chance that you are in the same state (asleep or awake) at the same time on consecutive days, scaled −100 to 100 (Phillips 2017).</p>
        <p><strong className="text-ink">Sleep score</strong>: duration 50%, efficiency 20%, deep 15%, REM 15%. It is Baseline&apos;s own score, not the Fitbit Sleep Score.</p>
        <p className="text-[12px] text-ink-3">Details, references and versions: docs/CALCULATIONS.md (SLP-*)</p>
      </div>
    </Sheet>
  );
}
