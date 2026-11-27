import Link from "next/link";
import { parseRange, trainingView, trendSeries } from "@/server/views";
import { Badge, Calibrating, Glass, Label, LargeTitle, Page, Row, SectionHeader, Value, toneVar } from "@/ui/kit";
import { Segmented } from "@/ui/controls";
import { TrendChart } from "@/ui/charts/TrendChart";
import { fmtDuration, fmtTime } from "@/ui/format";
import { db } from "@/server/db/client";
import { getWorkouts } from "@/server/queries";
import { CATEGORY_LABEL, WORKOUT_CATEGORIES, isCategory } from "@/lib/metrics/workout-labels";
import { Icon } from "@/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training · Baseline" };

const RANGES = [{ value: "7d", label: "Week" }, { value: "30d", label: "Month" }, { value: "90d", label: "3 Months" }];
const BAND_COPY = { low: "Below your usual load", optimal: "Building steadily", caution: "Rising quickly", high: "Sharp spike" } as const;
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function TrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const range = parseRange(sp.range, "30d");
  const v = trainingView(range);
  const cat = typeof sp.cat === "string" && (isCategory(sp.cat) || sp.cat === "unlabelled") ? sp.cat : "all";
  const shown = v.workouts.filter((w) => cat === "all" || (cat === "unlabelled" ? !w.label?.category : w.label?.category === cat));
  const filterHref = (c: string) => `/training?range=${range}${c === "all" ? "" : `&cat=${c}`}`;
  const usedCats = WORKOUT_CATEGORIES.filter((c) => v.workouts.some((w) => w.label?.category === c));
  const load = trendSeries(["strain"], range, v.today).strain!;
  const totalZone = v.zones.reduce((a, b) => a + b, 0);
  const counted = v.workouts.filter((w) => !w.excluded && !w.tooShort);
  const hevy = v.hevyWorkouts ? getWorkouts(db(), 5) : [];

  return (
    <Page accent="load">
      <LargeTitle title="Training" />
      <Segmented param="range" value={range} options={RANGES} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Glass className="rise p-4">
          <Label icon="bolt" tone="load">Workouts</Label>
          <div className="mt-1.5"><Value value={String(counted.length)} size="lg" /></div>
          <div className="mt-0.5 text-[12px] text-ink-3">{fmtDuration(counted.reduce((a, w) => a + w.durationMin, 0), { compact: true })} total</div>
        </Glass>
        <Glass className="rise rise-1 p-4">
          <Label tone="load">Load ratio</Label>
          {v.acwr.ratio !== null && v.acwr.band ? (
            <><div className="mt-1.5"><Value value={v.acwr.ratio.toFixed(2)} unit="×" size="lg" /></div><div className="mt-0.5 text-[12px] text-ink-3">{BAND_COPY[v.acwr.band]}</div></>
          ) : <div className="mt-2"><Calibrating have={v.acwr.trackedDays} need={v.acwr.requiredDays} what="acute:chronic" compact /></div>}
        </Glass>
      </div>

      <Link href="/cardio" transitionTypes={["nav-forward"]} className="glass pressable rise rise-2 mt-3 flex items-center gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--heart)_18%,transparent)] text-heart"><Icon name="heart" size={18} strokeWidth={2.2} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Cardio &amp; Zone 2</span><span className="block text-[12px] text-ink-3">Weekly zones, Active Zone Minutes, sessions and resting heart rate</span></span>
        <span className="text-ink-4"><Icon name="chevronRight" size={15} strokeWidth={2.4} /></span>
      </Link>

      <SectionHeader href={`/metric/strain?range=${range}`}>Daily cardio load</SectionHeader>
      <Glass className="p-4">
        <TrendChart points={load.points} color={toneVar("load")} kind="bar" height={150} unit="TRIMP" label="Daily cardio load (Edwards TRIMP)" />
        <p className="mt-2 text-[12px] text-ink-3">All-day heart rate in %HRmax zones, weighted 1–5 (Edwards TRIMP). Strength work is under-represented by any heart-rate method.</p>
      </Glass>

      <SectionHeader href={`/metric/zone2?range=${range}`}>Time in zones</SectionHeader>
      <Glass className="flex flex-col gap-2.5 p-4">
        {v.zones.map((m, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-8 text-[13px] font-bold">Z{i + 1}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--fill)]">
              <div className="h-full rounded-full" style={{ width: `${totalZone ? (m / totalZone) * 100 : 0}%`, background: `var(--z${i + 1})` }} />
            </div>
            <span className="num w-16 text-right text-[13px] font-semibold">{fmtDuration(m, { compact: true })}</span>
          </div>
        ))}
        <p className="mt-1 text-[12px] text-ink-3">{v.zoneDays} days with heart rate · Z1 50–60 · Z2 60–70 · Z3 70–80 · Z4 80–90 · Z5 90+ % HRmax</p>
      </Glass>

      <SectionHeader>History</SectionHeader>
      {v.workouts.length > 0 && (
        <nav aria-label="Filter workouts" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {(["all", ...usedCats, "unlabelled"] as const).map((c) => (
            <Link key={c} href={filterHref(c)} scroll={false} replace aria-current={cat === c ? "page" : undefined}
              className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${cat === c ? "bg-ink text-bg" : "glass glass-pill text-ink-2"}`}>
              {c === "all" ? "All" : c === "unlabelled" ? "Unlabelled" : CATEGORY_LABEL[c]}
            </Link>
          ))}
        </nav>
      )}
      {shown.length ? (
        <Glass className="list overflow-hidden">
          {shown.map((w) => (
            <Row key={w.id} href={`/training/${encodeURIComponent(w.id)}`} icon={w.type.includes("WALK") || w.type.includes("RUN") ? "steps" : "bolt"} tone="load"
              title={<span className={w.excluded || w.tooShort ? "text-ink-3" : undefined}>{w.title}{w.label?.category && <span className="ml-1.5 align-middle"><Badge>{CATEGORY_LABEL[w.label.category]}</Badge></span>}{w.excluded && <span className="ml-1.5 align-middle"><Badge>Excluded</Badge></span>}{w.tooShort && <span className="ml-1.5 align-middle"><Badge>Too short</Badge></span>}</span>}
              subtitle={`${dayFmt.format(w.startMs)} · ${fmtTime(w.startMs, v.tz)} · ${fmtDuration(w.durationMin, { compact: true })}${w.label?.effort ? ` · effort ${w.label.effort}` : ""}${w.sources.some((s) => s.app === "com.hevyapp.hevy") ? " · Hevy" : ""}`}
              trailing={w.hr?.stats.avgBpm ? <span className="num text-[14px] font-semibold text-ink-2">{Math.round(w.hr.stats.avgBpm)}<span className="ml-0.5 text-[11px] text-ink-3">bpm</span></span> : undefined} />
          ))}
        </Glass>
      ) : <Glass className="p-5 text-center text-[14px] text-ink-3">{v.workouts.length ? "No workouts match this filter." : "No workouts in this period."}</Glass>}

      {hevy.length > 0 && (
        <>
          <SectionHeader>Hevy <span className="ml-1 align-middle"><Badge>Optional</Badge></span></SectionHeader>
          <Glass className="list overflow-hidden">
            {hevy.map((w) => (
              <Row key={w.id} href={`/training/hevy/${encodeURIComponent(w.id)}`} icon="training" tone="load" title={w.title} subtitle={`${dayFmt.format(w.startMs)} · ${w.exercises} exercises`} />
            ))}
          </Glass>
        </>
      )}
      <p className="mt-4 px-1 text-[12px] leading-snug text-ink-3">
        Workouts come from Google Health: sessions recorded by the Fitbit Air and those Hevy writes to Apple Health. Hevy&apos;s Apple Health entries contain the time and a calorie estimate only — exercises, sets, reps and weights are not shared. <Link href="/settings" className="underline">Hevy direct import</Link> is optional.
      </p>
    </Page>
  );
}
