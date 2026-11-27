import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMutation } from "@/server/guard";
import { db } from "@/server/db/client";
import { env, isDemoMode } from "@/server/env";
import { verifyPassword } from "@/server/crypto";
import { disconnectProvider } from "@/server/connections";
import { deleteAllData } from "@/server/data/delete";
import { loginLocked, recordLoginFailure } from "@/server/auth-state";

const Body = z.object({ password: z.string().min(1).max(500), confirm: z.literal("DELETE") });

/**
 * Delete ALL personal data. Requires the app password again and the word DELETE.
 * Order: revoke Google's grant (needs the stored token) → erase every table (secure_delete + VACUUM) → delete
 * backups, exports, probe output and logs. config.env (app password) stays so you can still sign in.
 */
export async function POST(req: Request) {
  const denied = await guardMutation(req);
  if (denied) return denied;
  if (isDemoMode()) return NextResponse.json({ error: "Not available in demo mode" }, { status: 400 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Type DELETE and your password to confirm." }, { status: 400 });
  // Shares the login brake, so this password check cannot be used to guess the password faster.
  if (loginLocked()) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const hash = env().APP_PASSWORD_HASH;
  if (!hash || !verifyPassword(p.data.password, hash)) {
    recordLoginFailure();
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const d = db();
  const google = await disconnectProvider(d, "google");
  await disconnectProvider(d, "hevy");
  const r = deleteAllData(d);
  return NextResponse.json({ ok: true, googleRevoked: google.revoked, rows: r.rows, files: r.files });
}
