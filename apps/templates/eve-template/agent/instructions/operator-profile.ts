import { defineDynamic, defineInstructions } from "eve/instructions";
import { isOperator } from "@/lib/operator";

// A saved agent's instructions are standing rules for the turn, so they are a
// system-role instruction: a user-role one would be appended to the durable
// history again on every turn (up to ~8k characters each time).
export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      // Delegated copies inherit the caller's auth; their brief arrives in the delegation message.
      if (ctx.channel.kind === "subagent") return null;
      if (!isOperator(ctx.session.auth.current)) return null;
      const attributes = ctx.session.auth.current!.attributes;
      // A deleted saved agent is stopped by agent/hooks/saved-agent.ts.
      if (typeof attributes.agentProfileError === "string") return null;
      return typeof attributes.agentProfileInstructions === "string" &&
        attributes.agentProfileInstructions
        ? defineInstructions({ role: "system", content: attributes.agentProfileInstructions })
        : null;
    },
  },
});
