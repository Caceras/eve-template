import { defineEval, type EveEvalContext, type EveEvalSession, type EveEvalTurn } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import { NESTED_COMPLETION_PARENT_SCENARIO } from "../constants";

const REVIEW_RESULT = "REVIEW_VERDICT_CEDAR_947";

type SessionDriver = Pick<
  EveEvalSession,
  "pendingInputRequests" | "respondAll" | "sessionId" | "state"
>;

interface SessionCursor {
  readonly driver: SessionDriver;
  readonly events: EveEvalSession["events"];
}

/** A remote child must keep its caller while an invocation-owned nested review is pending. */
export default defineEval({
  description:
    "A remote child's interim acknowledgement does not complete its parent task before a gated nested reviewer returns.",
  async test(t) {
    const started = await t.send(NESTED_COMPLETION_PARENT_SCENARIO);
    started.expectOk();
    const receipt = started.events.find(
      (event) =>
        event.type === "subagent.completed" &&
        event.data.subagentName === "remote-loopback" &&
        event.data.backgroundTask !== undefined,
    );
    if (receipt?.type !== "subagent.completed" || receipt.data.backgroundTask === undefined) {
      throw new Error("The remote invocation returned no background task receipt.");
    }
    const parentTaskId = receipt.data.backgroundTask.taskId;

    const blocked = await waitForReviewGate(t, { driver: t, events: started.events });
    const remoteCall = blocked.events.find(
      (event) => event.type === "subagent.called" && event.data.callId === receipt.data.callId,
    );
    if (remoteCall?.type !== "subagent.called") {
      throw new Error("The background remote-loopback invocation did not start.");
    }

    const childAcknowledgementLive = t.target.watchTurn(remoteCall.data.childSessionId);
    const childAcknowledgement = await childAcknowledgementLive.result();
    childAcknowledgement.expectOk();
    childAcknowledgement.messageIncludes("Reviewing...");

    await t.require(
      blocked.events,
      satisfies(
        (events: typeof blocked.events) =>
          !events.some((event) => isTaskCompletion(event, parentTaskId)),
        "the parent task remains pending while the nested reviewer is gated",
      ),
    );

    const childFinal = t.target.watchTurn(remoteCall.data.childSessionId, {
      startIndex: requireStreamIndex(childAcknowledgementLive.session),
    });
    const released = await blocked.driver.respondAll("approve");
    released.noFailedActions();
    const completedChild = await childFinal.result();
    completedChild.expectOk();
    completedChild.messageIncludes(REVIEW_RESULT);

    const afterRelease = {
      driver: blocked.driver,
      events: [...blocked.events, ...released.events],
    };
    const completion = released.message?.includes(REVIEW_RESULT)
      ? { cursor: afterRelease, turn: released }
      : await waitForMessage(t, afterRelease, REVIEW_RESULT);
    completion.turn.expectOk();
    completion.turn.messageIncludes(REVIEW_RESULT);

    await t.require(
      completion.cursor.events,
      satisfies(
        (events: typeof completion.cursor.events) =>
          events.filter((event) => isTaskCompletion(event, parentTaskId)).length === 1,
        "the delegated invocation settles exactly once",
      ),
    );
    t.noFailedActions();
  },
});

async function waitForReviewGate(
  t: EveEvalContext,
  initial: SessionCursor,
): Promise<SessionCursor> {
  let cursor = initial;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (
      cursor.driver.pendingInputRequests.some(
        (request) => request.action.toolName === "review_gate",
      )
    ) {
      return cursor;
    }
    const live = watchNextTurn(t, cursor.driver, "review gate wait");
    const turn = await live.result();
    turn.noFailedActions();
    cursor = { driver: live.session, events: [...cursor.events, ...turn.events] };
  }
  throw new Error("The nested reviewer did not reach its approval gate after five turns.");
}

async function waitForMessage(
  t: EveEvalContext,
  initial: SessionCursor,
  marker: string,
): Promise<{ readonly cursor: SessionCursor; readonly turn: EveEvalTurn }> {
  let cursor = initial;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const live = watchNextTurn(t, cursor.driver, "nested completion wait");
    const turn = await live.result();
    turn.noFailedActions();
    cursor = { driver: live.session, events: [...cursor.events, ...turn.events] };
    if (turn.message?.includes(marker) === true) return { cursor, turn };
  }
  throw new Error("The nested review result did not reach the parent after five turns.");
}

function watchNextTurn(t: EveEvalContext, session: SessionDriver, operation: string) {
  if (session.sessionId === undefined || session.state === undefined) {
    throw new Error(`${operation} has no parent session cursor.`);
  }
  return t.target.watchTurn(session.sessionId, { startIndex: session.state.streamIndex });
}

function isTaskCompletion(event: EveEvalSession["events"][number], taskId: string): boolean {
  if (event.type !== "message.received") return false;
  const message = messageText(event.data.message);
  return message.includes(`Background task ${taskId}`) && message.includes(" is completed.");
}

function requireStreamIndex(session: {
  readonly state?: { readonly streamIndex?: number };
}): number {
  const streamIndex = session.state?.streamIndex;
  if (streamIndex === undefined) throw new Error("Remote child has no stream index.");
  return streamIndex;
}

function messageText(message: unknown): string {
  if (typeof message === "string") return message;
  if (!Array.isArray(message)) return "";
  return message
    .flatMap((part) =>
      part !== null &&
      typeof part === "object" &&
      Reflect.get(part, "type") === "text" &&
      typeof Reflect.get(part, "text") === "string"
        ? [Reflect.get(part, "text") as string]
        : [],
    )
    .join("\n");
}
