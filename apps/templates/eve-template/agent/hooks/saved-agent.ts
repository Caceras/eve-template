import { defineHook } from "eve/hooks";
import { isOperator } from "@/lib/operator";

// A saved agent chosen in the composer that no longer exists ends the turn with
// that reason. The dynamic instructions resolver cannot do this: eve logs a
// throwing resolver and skips it, so the base agent would answer silently.
export default defineHook({
  events: {
    "turn.started"(_event, ctx) {
      const current = ctx.session.auth.current;
      if (ctx.channel.kind === "subagent" || !isOperator(current)) return;
      const error = current?.attributes.agentProfileError;
      if (typeof error === "string") throw new Error(error);
    },
  },
});
