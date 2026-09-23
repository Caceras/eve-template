import { defineDynamic, defineInstructions } from "eve/instructions";
import { isOperator } from "@/lib/operator";
export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      if (!isOperator(ctx.session.auth.current)) return null;
      const attributes = ctx.session.auth.current!.attributes;
      if (typeof attributes.agentProfileError === "string")
        throw new Error(attributes.agentProfileError);
      const content = [
        attributes.agentProfileInstructions,
        attributes.composerMode === "image"
          ? "For this turn, help create an image using generate_image. If image generation is unavailable, report that accurately; never claim an image was created without a successful tool result."
          : "",
        attributes.composerMode === "research"
          ? "For this turn, investigate the question with sources. Delegate substantial research to the researcher or a saved agent when useful. Separate evidence, inference, and unanswered questions."
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return content ? defineInstructions({ role: "user", content }) : null;
    },
  },
});
