import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { verifyPassword } from "@/server/crypto";
import { createSessionValue, SESSION_COOKIE, SESSION_TTL_MS } from "@/server/session";
import { viaHttps } from "@/server/request";

// Naive in-process brute-force brake (single-user app, single process).
const failures: number[] = [];

export async function POST(req: Request) {
  const e = env();
  if (!e.APP_PASSWORD_HASH || !e.SESSION_SECRET) {
    return NextResponse.json({ error: "App password is not configured. Run `npm run configure` (see README)." }, { status: 503 });
  }
  const now = Date.now();
  while (failures.length && failures[0]! < now - 15 * 60_000) failures.shift();
  if (failures.length >= 10) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const password = form?.get("password");
  if (typeof password !== "string" || !verifyPassword(password, e.APP_PASSWORD_HASH)) {
    failures.push(now);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(e.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: viaHttps(req) || e.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
