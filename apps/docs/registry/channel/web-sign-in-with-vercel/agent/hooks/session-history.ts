import { waitUntil } from "@vercel/functions";
import { defineHook, type HookContext, type HookEvent } from "eve/hooks";
import { productionSessionStore, usesLocalSessions } from "../../lib/production-session-store.ts";
import { createSessionHistoryObserver } from "../../lib/session-history-observer.ts";

const project = createSessionHistoryObserver(productionSessionStore, waitUntil, (error) => {
  console.error("Web session index update failed", error);
});
function observe(event: HookEvent, ctx: HookContext) {
  if (!usesLocalSessions()) project(event, ctx);
}
export default defineHook({
  events: {
    "session.started": observe,
    "message.received": observe,
    "message.completed": observe,
    "turn.started": observe,
    "subagent.called": observe,
  },
});
