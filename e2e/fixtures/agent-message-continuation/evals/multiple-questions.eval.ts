import { defineEval } from "eve/evals";
import { expectReply, expectResponseReply, expectToolResult, requestFrom } from "./helpers.ts";

export default defineEval({
  description:
    "Two unanswered questions cannot swallow a tool reply even when no approval remains.",
  async test(t) {
    const first = await t.send("Prepare change A.");
    const approval = requestFrom(first, "change-a");
    const session = first.session;
    const color = await session.send("Ask which color to use, then read the draft status.");
    const colorRequest = requestFrom(color, "ask_question");
    const size = await session.send("Ask which size to use.");
    const sizeRequest = requestFrom(size, "ask_question");
    await expectResponseReply(
      t,
      await session.startRespond([{ requestId: approval.requestId, optionId: "cancel" }]),
      "Change A resolved.",
      approval.requestId,
    );
    session.notEvent("action.result", {
      data: { status: "completed", result: { toolName: "change-a" } },
    });

    const live = await session.start("Read the draft status.");
    await expectToolResult(t, live, "read-draft");
    await expectReply(t, live, "Draft status: ready.");
    session.eventsSatisfy("Neither unanswered question was silently resolved", (events) =>
      events.every(
        (event) =>
          event.type !== "input.resolved" ||
          event.data.resolutions.every(
            (resolution) =>
              resolution.requestId !== colorRequest.requestId &&
              resolution.requestId !== sizeRequest.requestId,
          ),
      ),
    );
  },
});
