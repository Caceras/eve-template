import { defineHook } from "eve/hooks";

export default defineHook({
  events: {
    "session.started"(_event, ctx) {
      console.info("[eve-template] session.started", { sessionId: ctx.session.id });
    },
    "turn.completed"(event, ctx) {
      console.info("[eve-template] turn.completed", {
        sessionId: ctx.session.id,
        turnId: event.data.turnId,
      });
    },
    "subagent.completed"(event, ctx) {
      console.info("[eve-template] subagent.completed", {
        sessionId: ctx.session.id,
        subagent: event.data.subagentName,
      });
    },
  },
});
