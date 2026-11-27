import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { setWorkoutLabel } from "@/server/analytics/workouts";
import { WORKOUT_CATEGORIES } from "@/lib/metrics/workout-labels";

const Body = z.object({
  sessionIds: z.array(z.string().min(1).max(300)).min(1).max(10),
  name: z.string().max(60).nullable(),
  category: z.enum(WORKOUT_CATEGORIES).nullable(),
  effort: z.number().int().min(1).max(10).nullable(),
});

/** Name, category and effort for a workout. Stored separately from provider data; all null removes the label. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid label" }, { status: 400 });
  setWorkoutLabel(db(), p.data.sessionIds, { name: p.data.name, category: p.data.category, effort: p.data.effort });
  return NextResponse.json({ ok: true });
}
