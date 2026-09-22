import { defineDynamic, defineInstructions } from "eve/instructions";
import { DEFAULT_TIMEZONE } from "@/lib/schedule-store";

// Per-turn user-role context keeps the system prompt stable (prompt caching)
// while letting the agent resolve "tomorrow at 8" into an exact time.
export default defineDynamic({
  events: {
    "turn.started": () => {
      const now = new Date();
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: DEFAULT_TIMEZONE,
        dateStyle: "full",
        timeStyle: "long",
      }).format(now);
      return defineInstructions({
        role: "user",
        content: `[Context] Current time: ${local} (${DEFAULT_TIMEZONE}); UTC ${now.toISOString()}.`,
      });
    },
  },
});
