import { defineAgent, defineDynamic } from "eve";

function isEnabled(value: string | readonly string[] | undefined) {
  return value === "true" || (Array.isArray(value) && value.includes("true"));
}

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      isEnabled(ctx.session.auth.current?.attributes.eveTemplateDynamicAgent)
        ? defineAgent({
            description:
              "Conditional helper exposed only when the authenticated caller enables the Eve Template dynamic-agent demonstration.",
            model: ctx.model?.id ?? "openai/gpt-5.6-luna-fast",
          })
        : null,
  },
});
