import { enforceLoginLimit } from "@/lib/login-limit";
import { NextResponse } from "next/server";
import {
  createPasswordSessionToken,
  hasSameOriginRequest,
  PASSWORD_SESSION_COOKIE_NAME,
  PASSWORD_SESSION_MAX_AGE,
  verifyChatPassword,
} from "@/lib/password-auth";
import {
  AUTH_HINT_COOKIE_MAX_AGE,
  AUTH_HINT_COOKIE_NAME,
  AUTH_HINT_COOKIE_VALUE,
  isSecureAuthHintCookie,
} from "@/lib/auth-hint";
import { getSetupStatus } from "@/lib/setup";

export async function POST(request: Request) {
  const setupStatus = await getSetupStatus();
  if (setupStatus.authMode !== "password")
    return NextResponse.json({ error: "Password sign-in is not configured." }, { status: 409 });
  if (!hasSameOriginRequest(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const retryAfter = enforceLoginLimit();
  if (retryAfter)
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); break; }
      chunks.push(value);
    }
  }
  if (size > 1024) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: { password?: unknown; username?: unknown } | null;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = null; }
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!(await verifyChatPassword(password, username)))
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  const secure = isSecureAuthHintCookie();
  response.cookies.set(PASSWORD_SESSION_COOKIE_NAME, createPasswordSessionToken(), {
    httpOnly: true, maxAge: PASSWORD_SESSION_MAX_AGE, path: "/", sameSite: "lax", secure,
  });
  response.cookies.set(AUTH_HINT_COOKIE_NAME, AUTH_HINT_COOKIE_VALUE, {
    httpOnly: false, maxAge: AUTH_HINT_COOKIE_MAX_AGE, path: "/", sameSite: "lax", secure,
  });
  return response;
}
