import type {
  EveEvalContext,
  EveEvalLiveTurn,
  EveEvalSession,
  EveEvalTurn,
  InputRequest,
} from "eve/evals";
import { equals } from "eve/evals/expect";

export function requestFrom(turn: EveEvalTurn, toolName: string): InputRequest {
  turn.expectOk();
  const matches = turn.inputRequests.filter((request) => request.action.toolName === toolName);
  if (matches.length !== 1)
    throw new Error(`Expected one ${toolName} request; found ${matches.length}.`);
  return matches[0]!;
}

export function ownerOf(turn: EveEvalTurn): string {
  const started = turn.events.find((event) => event.type === "turn.started");
  if (!started) throw new Error("Expected turn.started.");
  return started.data.turnId;
}

export async function expectReply(
  t: EveEvalContext,
  live: EveEvalLiveTurn,
  expected: string | RegExp,
  owner?: string,
): Promise<EveEvalTurn> {
  const turnId = owner ?? (await live.waitForEvent("message.received")).data.turnId;
  const turn = (await live.result()).expectOk();
  turn.event("message.completed", { data: { turnId, message: expected }, count: 1 });
  turn.event("turn.completed", { data: { turnId }, count: 1 });
  turn.notEvent("input.requested", { data: { turnId } });
  t.log(`Reply and completion belong to ${turnId}.`);
  return turn;
}

export async function expectToolResult(t: EveEvalContext, live: EveEvalLiveTurn, toolName: string) {
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
  await response.body?.cancel();
}

export async function approveSavedChange(session: EveEvalSession, request: InputRequest) {
  const approved = (
    await session.respond([{ requestId: request.requestId, optionId: "approve" }])
  ).expectOk();
  approved.calledTool(request.action.toolName, { status: "completed", count: 1 });
  session.event("action.result", {
    data: { result: { toolName: request.action.toolName } },
    count: 1,
  });
}
