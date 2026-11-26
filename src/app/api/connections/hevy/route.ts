import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { saveHevyApiKey } from "@/server/connections";
import { HevyClient } from "@/server/providers/hevy/client";
import { HttpError } from "@/server/http";
import { syncAll } from "@/server/sync/run";

const Body = z.object({ apiKey: z.string().trim().uuid("Hevy API keys are UUIDs") });

/** Validates a Hevy API key against /v1/user/info, then stores it encrypted. */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid key" }, { status: 400 });
  try {
    const info = await new HevyClient(parsed.data.apiKey, { retries: 1 }).userInfo();
    saveHevyApiKey(db(), parsed.data.apiKey, info.id);
    void syncAll(db(), "connect").catch(() => {});
    return NextResponse.json({ ok: true, isPro: info.is_pro ?? null });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 0;
    const msg = status === 401 || status === 403 ? "Hevy rejected this key (API access requires Hevy Pro)." : "Could not reach Hevy to validate the key.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
