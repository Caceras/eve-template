import type {
  EveEvalContext,
  EveEvalLiveTurn,
  EveEvalSession,
  EveEvalTurn,
  InputRequest,
} from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";

export const scriptedSession = { headers: { "x-eve-fixture-model": "continuation" } };

export function requestFrom(turn: EveEvalTurn, toolName: string): InputRequest {
  turn.expectOk();
  const matches = turn.inputRequests.filter((request) => request.action.toolName === toolName);
  if (matches.length !== 1)
    throw new Error(`Expected one ${toolName} request; found ${matches.length}.`);
  return matches[0]!;
}

export async function expectReply(
  t: EveEvalContext,
  live: EveEvalLiveTurn,
  expected: string | RegExp,
  owner?: string,
): Promise<EveEvalTurn> {
  t.log(`Accepted input in ${live.sessionId}; awaiting the reply and its turn completion.`);
  const turnId = owner ?? (await live.waitForEvent("message.received")).data.turnId;
  const turn = (await live.result()).expectOk();
  const replies = turn.events.filter(
    (event) =>
      event.type === "message.completed" &&
      event.data.turnId === turnId &&
      typeof event.data.message === "string" &&
      (typeof expected === "string"
        ? event.data.message === expected
        : expected.test(event.data.message)),
  );
  await t.require(
    replies.length,
    satisfies<number>(
      (count) => count === 1,
      `Exactly one reply matching ${String(expected)} in ${turnId}`,
    ),
  );
  const completions = turn.events.filter(
    (event) => event.type === "turn.completed" && event.data.turnId === turnId,
  );
  await t.require(
    completions.length,
    satisfies<number>((count) => count === 1, `Exactly one completion for ${turnId}`),
  );
  turn.notEvent("input.requested", { data: { turnId } });
  t.log(`Checking answer and completion for ${turnId}.`);
  return turn;
}

export async function expectResponseReply(
  t: EveEvalContext,
  live: EveEvalLiveTurn,
  expected: string | RegExp,
  requestId: string,
): Promise<EveEvalTurn> {
  t.log(`Accepted response for ${requestId}; awaiting resolution and its resumed turn.`);
  await live.waitForEvent("input.resolved");
  const resumed = await live.waitForEvent("turn.started");
  const turn = await expectReply(t, live, expected, resumed.data.turnId);
  turn.eventsSatisfy("Resolves the saved request before answering", (events) =>
    events.some(
      (event) =>
        event.type === "input.resolved" &&
        event.data.resolutions.some((resolution) => resolution.requestId === requestId),
    ),
  );
  return turn;
}

export async function expectToolResult(t: EveEvalContext, live: EveEvalLiveTurn, toolName: string) {
  t.log(`Accepted input in ${live.sessionId}; awaiting ${toolName}.`);
  const event = await live.waitForEvent("action.result", { data: { result: { toolName } } });
  t.log(`${toolName} returned before the reply: ${JSON.stringify(event.data)}`);
  return event;
}

export function expectChangeStillUnexecuted(session: EveEvalSession, toolName = "change-a") {
  session.notEvent("action.result", { data: { result: { toolName } } });
}

// A partial approval has no turn boundary to await. Await the real HTTP
// acceptance, then send the next message on that same session's ordered inbox.
export async function submitPartialApproval(
  t: EveEvalContext,
  session: EveEvalSession,
  request: InputRequest,
) {
  const response = await t.target.fetch(
    `/eve/v1/session/${encodeURIComponent(session.sessionId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        inputResponses: [{ requestId: request.requestId, optionId: "approve" }],
      }),
    },
  );
  await t.require(response.status, equals(202));
  const accepted = await response.json();
  t.log(`Partial approval accepted: ${JSON.stringify(accepted)}`);
}

export async function approveSavedChange(session: EveEvalSession, request: InputRequest) {
  const approved = (
    await session.respond([{ requestId: request.requestId, optionId: "approve" }])
  ).expectOk();
  approved.calledTool(request.action.toolName, {
    status: "completed",
    output: { executions: 1 },
    count: 1,
  });
  session.event("action.result", {
    data: { result: { toolName: request.action.toolName } },
    count: 1,
  });
}
