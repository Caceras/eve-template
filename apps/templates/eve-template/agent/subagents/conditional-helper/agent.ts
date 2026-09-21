import { defineAgent, defineDynamic } from "eve";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      ctx.session.auth.current?.attributes.eveTemplateDynamicAgent === true
        ? defineAgent({
            description:
              "Conditional helper exposed only when the authenticated caller enables the Eve Template dynamic-agent demonstration.",
            model: ctx.model?.id ?? "openai/gpt-5.6-luna-fast",
          })
        : null,
  },
});
