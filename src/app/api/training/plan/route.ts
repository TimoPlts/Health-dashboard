import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { deleteSetting, getSettings, setSetting } from "@/server/settings";
import { todayDate } from "@/server/queries";
import { WORKOUT_CATEGORIES } from "@/lib/metrics/workout-labels";
import { emptyPlan, normalisePlan, withSplit } from "@/lib/metrics/training-plan";

const Day = z.object({
  kind: z.enum(["train", "rest", "free"]),
  name: z.string().trim().max(40).nullable(),
  category: z.enum(WORKOUT_CATEGORIES).nullable(),
});
const Body = z.union([
  z.object({ split: z.array(Day).length(7) }),
  z.object({ override: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), day: Day.nullable() }) }),
  z.object({ clear: z.literal(true) }),
]);

/**
 * Training plan (stored in settings, no provider data involved): replace the weekly split from today on, set or
 * reset one day, or remove the plan. Values are normalised by lib/metrics/training-plan.ts before they are stored.
 */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  const d = db();
  const today = todayDate();
  const cur = getSettings(d).trainingPlan;
  if ("clear" in p.data) { deleteSetting(d, "trainingPlan"); return NextResponse.json({ ok: true }); }
  let next;
  if ("split" in p.data) next = withSplit(cur, p.data.split.map((x) => ({ ...x, name: x.name || null })), today);
  else {
    const { date, day } = p.data.override;
    const base = cur ?? emptyPlan(date < today ? date : today);
    const overrides = { ...base.overrides };
    if (day) overrides[date] = { ...day, name: day.name || null }; else delete overrides[date];
    next = { ...base, overrides };
  }
  const clean = normalisePlan(next);
  if (!clean) return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  setSetting(d, "trainingPlan", clean);
  return NextResponse.json({ ok: true });
}
