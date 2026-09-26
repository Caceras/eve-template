import { defineDynamic, defineInstructions } from "eve/instructions";
import { isOperator } from "@/lib/operator";
import { resumesApproval } from "../lib/resumed-approval";

// The skill chosen in the composer applies to this turn only: a short
// user-role note in the turn's history, but not on the turn that carries out
// an answered approval, which would not run.
export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      if (ctx.channel.kind === "subagent") return null;
      if (!isOperator(ctx.session.auth.current)) return null;
      if (resumesApproval(ctx.messages)) return null;
      const skill = ctx.session.auth.current!.attributes.composerSkill;
      return typeof skill === "string"
        ? defineInstructions({
            role: "user",
            content: `For this turn the operator chose the "${skill}" skill. Load it with load_skill and follow it. If it cannot be loaded, say so.`,
          })
        : null;
    },
  },
});
