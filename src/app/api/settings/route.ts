import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { setSetting } from "@/server/settings";
import { rescheduleFromSettings } from "@/server/sync/scheduler";
import { computeDerived } from "@/server/analytics/derive";
import { env } from "@/server/env";
import { sql } from "drizzle-orm";

const Body = z.object({
  sleepNeedMin: z.number().int().min(300).max(660).optional(),
  hrMaxOverride: z.number().int().min(120).max(230).nullable().optional(),
  autoSyncMinutes: z.number().int().refine((v) => [0, 15, 30, 60, 120, 240].includes(v)).optional(),
  rawRetentionDays: z.number().int().refine((v) => [0, 30, 90, 365].includes(v)).optional(),
  backupKeep: z.number().int().refine((v) => [0, 7, 14, 30].includes(v)).optional(),
});

/** Update owner preferences. Changing HRmax recomputes derived zone/load metrics for all days. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid settings" }, { status: 400 });
  const d = db();
  if (p.data.sleepNeedMin !== undefined) setSetting(d, "sleepNeedMin", p.data.sleepNeedMin);
  if (p.data.rawRetentionDays !== undefined) setSetting(d, "rawRetentionDays", p.data.rawRetentionDays);
  if (p.data.backupKeep !== undefined) setSetting(d, "backupKeep", p.data.backupKeep);
  if (p.data.autoSyncMinutes !== undefined) { setSetting(d, "autoSyncMinutes", p.data.autoSyncMinutes); rescheduleFromSettings(); }
  if (p.data.hrMaxOverride !== undefined) {
    setSetting(d, "hrMaxOverride", p.data.hrMaxOverride);
    const dates = (d.all(sql`select distinct date from derived_daily where metric = 'hr_worn_min'`) as { date: string }[]).map((r) => r.date);
    computeDerived(d, dates, env().HOME_TIME_ZONE);
  }
  return NextResponse.json({ ok: true });
}
