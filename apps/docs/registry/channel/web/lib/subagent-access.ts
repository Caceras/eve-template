import type { RouteHandlerArgs } from "eve/channels";
import type { SessionStore } from "./session-store.ts";

/** The event observer records an owner-scoped edge when eve calls a child. */
export async function canReadSubagent(
  request: Request,
  args: RouteHandlerArgs,
  owner: string,
  store: SessionStore,
): Promise<boolean> {
  const url = new URL(request.url);
  const parent = url.searchParams.get("parentSessionId"),
    call = url.searchParams.get("callId"),
    child = args.params.sessionId;
  return (
    !!parent &&
    !!call &&
    !!child &&
    parent !== child &&
    (await store.ownsChild(owner, parent, call, child))
  );
}
