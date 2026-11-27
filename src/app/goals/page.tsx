import { ctx } from "@/server/views";
import { goalsView, type GoalState } from "@/server/analytics/goals";
import { getSettings } from "@/server/settings";
import { Glass, LargeTitle, Page, SectionHeader, cx, toneVar } from "@/ui/kit";
import { Ring } from "@/ui/charts/Ring";
import { GoalsEditor } from "@/ui/GoalsEditor";
import { GOAL_TONE as TONE, STATUS_TEXT, formatGoalValue, formatTarget } from "@/ui/goal-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals · Baseline" };

export default async function GoalsPage() {
  const c = ctx();
  const v = goalsView(c.db, c.today, c.fb, c.tz);
  const goals = getSettings(c.db).goals;
  return (
    <Page accent="activity">
      <LargeTitle back={{ href: "/", label: "Today" }} title="Goals" trailing={<GoalsEditor goals={goals} triggerText={v.set.length ? "Edit" : "Set goals"} />} />
      {v.set.length === 0 ? (
        <Glass className="p-5 text-center">
          <p className="text-[16px] font-semibold">No goals yet</p>
          <p className="mt-1 text-[13px] text-ink-3">Set the targets you care about. Baseline does not assume any.</p>
          <div className="mt-4 flex justify-center"><GoalsEditor goals={goals} triggerText="Set goals" /></div>
        </Glass>
      ) : (
        <div className="flex flex-col gap-3">
          {v.set.map((g, i) => <GoalCard key={g.def.id} g={g} i={i} />)}
        </div>
      )}
      {v.unset.length > 0 && v.set.length > 0 && (
        <>
          <SectionHeader>More goals</SectionHeader>
          <Glass className="p-4 text-[13px] text-ink-2">
            Not set: {v.unset.map((d) => d.label).join(", ")}. Use <strong className="text-ink">Edit</strong> to add any of them.
          </Glass>
        </>
      )}
      <p className="mt-4 px-1 text-[12px] leading-snug text-ink-3">
        Days without data are never counted as missed. Today and the current week count as met as soon as the target is reached, and as missed only once they are complete. In bed by: met up to 15 minutes after the target. Wake-up: within 30 minutes.
      </p>
    </Page>
  );
}

function GoalCard({ g, i }: { g: GoalState; i: number }) {
  const id = g.def.id;
  const clock = g.def.kind !== "atLeast";
  const frac = !clock && g.current.value !== null ? Math.min(1, g.current.value / g.target) : null;
  const tone = toneVar(TONE[id]);
  return (
    <Glass className={cx("rise p-4", `rise-${Math.min(4, i + 1)}`)}>
      <div className="flex items-center gap-4">
        <Ring value={clock ? (g.current.status === "met" ? 1 : null) : frac} max={1} color={tone} size={64} stroke={7}
          label={`${g.def.label}: ${STATUS_TEXT[g.current.status]}`}>
          <span className="text-[11px] font-bold">{clock ? (g.current.status === "met" ? "✓" : "") : frac !== null ? `${Math.round(frac * 100)}%` : "—"}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink-3">{g.def.label} · {g.def.period === "day" ? "today" : "this week"}</div>
          <div className="num mt-0.5 text-[20px] font-bold">{formatGoalValue(id, g.current.value)}<span className="ml-1.5 text-[13px] font-semibold text-ink-3">/ {formatTarget(id, g.target)}</span></div>
          <div className="text-[12px] text-ink-3">{STATUS_TEXT[g.current.status]}</div>
        </div>
      </div>
      <History points={g.history} tone={tone} label={g.def.label} period={g.def.period} />
      <p className="mt-2 text-[12px] text-ink-3">
        {g.completion.rate === null ? "No completed days with data yet." : `Met ${g.completion.met} of ${g.completion.met + g.completion.missed} ${g.def.period === "day" ? "days" : "weeks"} with data (${Math.round(g.completion.rate * 100)}%)`}
        <span className="text-ink-4"> · {g.def.hint}</span>
      </p>
    </Glass>
  );
}

/** Met = filled dot, missed = hollow ring, in progress = dashed ring, no data = faint dot. Shape carries the meaning. */
function History({ points, tone, label, period }: { points: GoalState["history"]; tone: string; label: string; period: "day" | "week" }) {
  const met = points.filter((p) => p.status === "met").length;
  return (
    <div className="mt-3 flex flex-wrap gap-[5px]" role="img" aria-label={`${label}: met on ${met} of the last ${points.length} ${period === "day" ? "days" : "weeks"}`}>
      {points.map((p) => (
        <span key={p.key} title={`${p.key}: ${STATUS_TEXT[p.status]}`} className="block size-[9px] rounded-full"
          style={p.status === "met" ? { background: tone } : p.status === "missed" ? { boxShadow: `inset 0 0 0 1.5px ${tone}`, opacity: 0.8 }
            : p.status === "inProgress" ? { border: `1.5px dashed ${tone}` } : { background: "var(--fill-2)" }} />
      ))}
    </div>
  );
}
