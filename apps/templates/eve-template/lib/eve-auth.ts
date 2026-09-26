import { MODEL_HEADER, isModelId } from "@/lib/model-catalog";
import type { AuthFn } from "eve/channels/auth";
import { auth } from "@/lib/auth";
import { getPasswordSessionFromHeaders, hasSameOriginRequest } from "@/lib/password-auth";
import { getSetupStatus } from "@/lib/setup";
import { operatorAuth } from "@/lib/operator";
import { isInternalRequest } from "@/lib/internal-auth";
import { profileAttributes } from "@/lib/agent-profiles";
import { skillAttribute } from "@/lib/skills";

/** An absent or unknown model falls back to the active provider's default at each model step. */
function chatModelAttribute(request: Request): Record<string, string> {
  const model = request.headers.get(MODEL_HEADER);
  return isModelId(model) ? { chatModel: model } : {};
}

export const betterAuthEveAuth: AuthFn<Request> = async (request) => {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady || setupStatus.authMode !== "vercel") {
    return null;
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return null;
  }

  return {
    attributes: {
      ...chatModelAttribute(request),
      email: session.user.email,
      name: session.user.name,
    },
    authenticator: "better-auth",
    issuer: "better-auth",
    principalId: session.user.id,
    principalType: "user",
    subject: session.user.email,
  };
};

export const passwordEveAuth: AuthFn<Request> = async (request) => {
  const setupStatus = await getSetupStatus();

  if (
    !setupStatus.appReady ||
    setupStatus.authMode !== "password" ||
    !getPasswordSessionFromHeaders(request.headers)
  ) {
    return null;
  }

  // A cookie alone does not prove the request came from this app's pages (a
  // text/plain post needs no CORS preflight), so writes must carry its Origin,
  // as the settings APIs require. Next's /eve proxy passes Origin through and
  // sets x-forwarded-host to the public host.
  if (request.method !== "GET" && request.method !== "HEAD" && !hasSameOriginRequest(request)) {
    return null;
  }

  return operatorAuth("password", {
    ...(await profileAttributes(request)),
    ...skillAttribute(request),
    ...chatModelAttribute(request),
  });
};

/** Scheduled tasks call the eve API from inside the server as the operator. */
export const internalEveAuth: AuthFn<Request> = (request) =>
  isInternalRequest(request.headers) ? operatorAuth("schedule", skillAttribute(request)) : null;
