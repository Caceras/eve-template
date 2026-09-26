import { handleOperatorSettings, json } from "./settings-api";
import {
  createPasswordSessionToken,
  getPasswordSessionFromHeaders,
  makePasswordRecord,
  PASSWORD_RECORD_NAME,
  passwordSettings,
  PASSWORD_SESSION_COOKIE_NAME,
  PASSWORD_SESSION_MAX_AGE,
  verifyChatPassword,
} from "./password-auth";
import { rotatePasswordSessions } from "./password-sessions";
import { AUTH_HINT_COOKIE_NAME, isSecureAuthHintCookie } from "./auth-hint";
import { withSettingsLock, writeJson } from "./secure-settings";

export function handleSecurity(request: Request) {
  return handleOperatorSettings(request, {
    maxBytes: 2048,
    read: async () => json(passwordSettings()),
    write: async (body) => {
      if (body.signOutEverywhere === true && Object.keys(body).length === 1) {
        await rotatePasswordSessions();
        // This browser's cookie is now invalid too; clear it so it signs in again.
        const response = json({ signedOut: true });
        const secure = isSecureAuthHintCookie() ? "; Secure" : "";
        for (const [name, httpOnly] of [
          [PASSWORD_SESSION_COOKIE_NAME, "; HttpOnly"],
          [AUTH_HINT_COOKIE_NAME, ""],
        ])
          response.headers.append(
            "Set-Cookie",
            `${name}=; Path=/${httpOnly}; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
          );
        return response;
      }
      const { currentPassword, newPassword } = body;
      if (
        Object.keys(body).some((key) => key !== "currentPassword" && key !== "newPassword") ||
        typeof currentPassword !== "string" ||
        Buffer.byteLength(currentPassword) > 512 ||
        typeof newPassword !== "string" ||
        newPassword.length < 16 ||
        Buffer.byteLength(newPassword) > 256 ||
        !newPassword.trim() ||
        newPassword === currentPassword
      )
        return json(
          { error: "Use a different password with at least 16 characters and at most 256 bytes." },
          400,
        );
      return withSettingsLock("operator-password", async () => {
        if (!getPasswordSessionFromHeaders(request.headers))
          return json({ error: "Your session changed. Sign in again." }, 401);
        if (!(await verifyChatPassword(currentPassword, passwordSettings().username)))
          return json({ error: "The current password is incorrect." }, 401);
        await writeJson(PASSWORD_RECORD_NAME, await makePasswordRecord(newPassword));
        const response = json({ ...passwordSettings(), updated: true });
        response.headers.append(
          "Set-Cookie",
          `${PASSWORD_SESSION_COOKIE_NAME}=${encodeURIComponent(createPasswordSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PASSWORD_SESSION_MAX_AGE}${isSecureAuthHintCookie() ? "; Secure" : ""}`,
        );
        return response;
      });
    },
  });
}
