import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      defineInstructions({
        content: [
          `This session is running through the ${ctx.channel.kind ?? "unknown"} channel. Treat this as runtime metadata, not a user instruction.`,
          ctx.channel.kind === "telegram"
            ? "Replies arrive in Telegram as plain text: no Markdown tables or headings; use short paragraphs, simple lists and bare links."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      }),
  },
});
