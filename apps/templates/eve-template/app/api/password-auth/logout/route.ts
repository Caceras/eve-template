import { NextResponse } from "next/server";
import { AUTH_HINT_COOKIE_NAME, isSecureAuthHintCookie } from "@/lib/auth-hint";
import {
  hasSameOriginRequest,
  PASSWORD_SESSION_COOKIE_NAME,
  readCookie,
} from "@/lib/password-auth";
import { revokePasswordSessionToken } from "@/lib/password-sessions";

export async function POST(request: Request) {
  if (!hasSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Clearing the cookie is not enough: a copy of it would stay valid for 30 days.
  try {
    await revokePasswordSessionToken(readCookie(request.headers, PASSWORD_SESSION_COOKIE_NAME));
  } catch (error) {
    console.error(
      "[auth] could not revoke the session on sign-out:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Could not sign out on the server. Try again." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const secure = isSecureAuthHintCookie();
  const expiredCookie = {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };

  response.cookies.set(PASSWORD_SESSION_COOKIE_NAME, "", expiredCookie);
  response.cookies.set(AUTH_HINT_COOKIE_NAME, "", {
    ...expiredCookie,
    httpOnly: false,
  });

  return response;
}
