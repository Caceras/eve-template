import type { SessionAuthContext } from "#channel/types.js";
import { isEveDevEnvironment } from "#internal/application/dev-environment.js";

/**
 * Reciprocity rule for remote callbacks: this deployment authenticates its
 * callbacks with its own identity, so it only performs callback work
 * (`callback`, `activityObserver`) for callers that are themselves
 * authenticated as a `service` or `runtime` principal. Local `eve dev` is
 * exempt. Returns the 400 rejection, or `null` when the request may proceed.
 */
export function checkRemoteCallbackPrincipal(
  body: { readonly activityObserver?: unknown; readonly callback?: unknown },
  auth: SessionAuthContext,
): Response | null {
  if (body.callback === undefined && body.activityObserver === undefined) return null;
  if (auth.principalType === "service" || auth.principalType === "runtime") return null;
  if (isEveDevEnvironment() && process.env.VERCEL !== "1") return null;
  return Response.json(
    {
      error: "Remote callbacks require a caller authenticated as a service or runtime principal.",
      ok: false,
    },
    { status: 400 },
  );
}
