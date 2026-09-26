import {
  Client,
  isCurrentTurnBoundaryEvent,
  type ClientSession,
  type ClientSessionState,
  type MessageResponse,
  type MessageStreamEvent,
} from "eve/client";
import { compactStreamFragments } from "@/lib/chat/event-log";
import { createChat, deleteChatForUser, saveChatSnapshot } from "@/lib/db/queries";
import { generatedImageUrls } from "@/lib/generated-images";
import { INTERNAL_HEADER, internalToken } from "@/lib/internal-auth";
import { OPERATOR_PRINCIPAL_ID } from "@/lib/operator";
import { sendPush } from "@/lib/push-notifications";
import type { ScheduledTask } from "@/lib/schedule-store";
import { SKILL_HEADER } from "@/lib/skills";
import { readTelegram } from "@/lib/telegram-settings";
import { describeTurnFailure } from "@/lib/turn-failure";
import { splitTelegramMessageText } from "eve/channels/telegram";

const RUN_TIMEOUT_MS = 10 * 60_000;
const TIMED_OUT = "It ran longer than 10 minutes and was stopped.";
const LOST = "The connection to the agent was lost, so the run was stopped.";

/** The last assistant text of a run, flattened for a notification preview. */
export function finalAnswer(events: readonly MessageStreamEvent[]) {
  const text = lastAnswer(events);
  return text
    ? text
        .replace(/[#*_`>[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;
}

/** The last assistant reply of a run, as written. Narration before a tool call is not a reply. */
function lastAnswer(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (
      event.type === "message.completed" &&
      event.data.finishReason !== "tool-calls" &&
      event.data.message?.trim()
    )
      return event.data.message.trim();
  }
  return null;
}

/**
 * True when the run's last reply is eve's `<eve-empty-delivery/>` marker (a
 * completed message with no text): a conditional check found nothing to report.
 */
export function endedQuietly(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.type === "turn.started") return false;
    if (event.type === "message.completed" && event.data.finishReason !== "tool-calls")
      return event.data.message === null;
  }
  return false;
}

// eve reports a background task in a later turn whose input reads
// "Background task <id> (<name>) is completed.", "… failed." or "… is cancelled.".
const TASK_NOTICE =
  /Background task (\S+) \([^\n]*?\) (is completed|failed|is cancelled|needs input|update)/g;

/**
 * Background tasks the run started (eve's `{ status: "working", taskId }`
 * receipts, for delegated agents and background workflow tools) that have not
 * reported back yet. A report in a shape this cannot read settles them all, so
 * a change in eve's wording ends the wait instead of stalling the run.
 */
export function openBackgroundTasks(events: readonly MessageStreamEvent[]) {
  const open = new Set<string>();
  for (const event of events) {
    if (event.type === "action.result") {
      const { result } = event.data;
      const output = result.output as { status?: unknown; taskId?: unknown } | null;
      const receipt =
        output?.status === "working" && typeof output.taskId === "string"
          ? output.taskId
          : "backgroundTask" in result // older eve streams marked subagent receipts this way
            ? result.backgroundTask?.taskId
            : undefined;
      if (receipt) open.add(receipt);
    }
    if (event.type === "message.received" && event.data.kind === "execution.background_task") {
      const notices = [...event.data.message.matchAll(TASK_NOTICE)];
      if (notices.length === 0) open.clear();
      for (const [, taskId, status] of notices)
        if (status !== "needs input" && status !== "update") open.delete(taskId!);
    }
  }
  return open;
}

export type RunOutcome =
  | { status: "done" }
  | { status: "failed"; reason: string }
  | { status: "waiting" };

/**
 * How the run's last turn ended. A provider error (out of credits, a rejected
 * key) fails the turn but leaves the session waiting, so `session.failed`
 * alone misses it; an approval or question pauses the turn instead.
 */
export function runOutcome(events: readonly MessageStreamEvent[]): RunOutcome {
  let start = 0;
  for (let index = events.length - 1; index >= 0; index--)
    if (events[index]!.type === "turn.started") {
      start = index;
      break;
    }
  const pending = new Set<string>();
  for (const event of events.slice(start)) {
    if (event.type === "turn.failed" || event.type === "session.failed")
      return { status: "failed", reason: describeTurnFailure(event.data) };
    if (event.type === "input.requested")
      for (const request of event.data.requests) pending.add(request.requestId);
    if (event.type === "input.resolved")
      for (const resolution of event.data.resolutions) pending.delete(resolution.requestId);
    if (event.type === "authorization.required") pending.add("authorization");
    if (event.type === "authorization.completed") pending.delete("authorization");
  }
  return pending.size > 0 ? { status: "waiting" } : { status: "done" };
}

/** The session has parked and nothing it started is still due to report. */
function isSettled(events: readonly MessageStreamEvent[]) {
  const last = events.at(-1);
  if (!last || !isCurrentTurnBoundaryEvent(last)) return false;
  // A turn that waits for the operator, or failed, reports nothing more until answered.
  return (
    last.type !== "session.waiting" ||
    runOutcome(events).status !== "done" ||
    openBackgroundTasks(events).size === 0
  );
}

/** Follows the session, one turn boundary at a time, until it has settled. */
async function settledSnapshot(session: ClientSession, signal: AbortSignal) {
  for (;;) {
    const snapshot = await session.snapshot({ signal });
    if (isSettled(snapshot.events)) return snapshot;
    for await (const event of session.stream({ startIndex: snapshot.session.streamIndex, signal }))
      if (isCurrentTurnBoundaryEvent(event)) break;
    signal.throwIfAborted();
  }
}

/** Saves the run as a chat, compacted like the web chat's own saves; never throws. */
async function saveRun(
  job: ScheduledTask,
  events: readonly MessageStreamEvent[],
  session: ClientSessionState | undefined,
) {
  let chatId: string | undefined;
  try {
    chatId = (await createChat(OPERATOR_PRINCIPAL_ID, { title: job.title })).id;
    await saveChatSnapshot({
      chatId,
      events: compactStreamFragments(events),
      session,
      userId: OPERATOR_PRINCIPAL_ID,
    });
    return chatId;
  } catch (error) {
    console.error("[scheduled-tasks] could not save the run", { id: job.id, error });
    if (chatId) await deleteChatForUser(chatId, OPERATOR_PRINCIPAL_ID).catch(() => undefined);
    return undefined;
  }
}

async function mirrorToTelegram(text: string) {
  const telegram = await readTelegram().catch(() => undefined);
  if (!telegram?.owner) return;
  for (const chunk of splitTelegramMessageText(text)) {
    const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegram.owner.chatId, text: chunk }),
    });
    if (!response.ok) throw new Error(`Telegram answered ${response.status}`);
  }
}

/**
 * Runs one scheduled task through the eve session API, exactly like a web chat:
 * waits (up to 10 minutes) until the turn and any background work it started
 * have settled, saves the run as a chat in the operator's history, then
 * notifies installed devices (and the linked Telegram chat, if any).
 *
 * Throws only when the session could not be started, so the dispatcher can
 * retry. Once eve has started it, the run is recorded however it ended, never
 * started a second time: `onStarted` stores the session id with the lease, and
 * a job whose lease already has one (a restart mid-run) attaches to it.
 */
export async function runScheduledTask(
  job: ScheduledTask,
  options: {
    host?: string;
    onStarted?: (sessionId: string) => Promise<void> | void;
    timeoutMs?: number;
  } = {},
) {
  const host =
    options.host ?? `http://127.0.0.1:${process.env.NITRO_PORT || process.env.PORT || "4274"}`;
  const client = new Client({
    host,
    headers: {
      [INTERNAL_HEADER]: internalToken(),
      ...(job.skill ? { [SKILL_HEADER]: job.skill } : {}),
    },
    redirect: "error",
  });
  // One budget for the whole run. eve's reader can end quietly when it is
  // aborted, so the signal, not an exception, tells a timeout apart.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), options.timeoutMs ?? RUN_TIMEOUT_MS);
  try {
    let session: ClientSession;
    let first: MessageResponse | undefined;
    if (job.lease?.sessionId) session = client.sessions.attach(job.lease.sessionId);
    else {
      ({ session, response: first } = await client.sessions.create({
        message: `Scheduled task "${job.title}" is due now. Carry it out and write the result for the user. If the task asks you to report only when there is something to report and there is nothing, reply with exactly <eve-empty-delivery/> and nothing else.\n\n${job.prompt}`,
        // eve's own schedules use this too: background results arrive together, in one report.
        taskDeliveryPolicy: "cohort",
        signal: deadline.signal,
      }));
      try {
        await options.onStarted?.(session.state.sessionId);
      } catch (error) {
        console.error("[scheduled-tasks] could not record the session", { id: job.id, error });
      }
    }

    let events: readonly MessageStreamEvent[] = [];
    let cursor: ClientSessionState | undefined;
    let stopped: string | null = null;
    try {
      if (first) {
        events = (await first.result()).events;
        cursor = session.state;
      }
      // Background work, a restart (attached) or a turn cut short: follow the session.
      if (!isSettled(events))
        ({ events, session: cursor } = await settledSnapshot(session, deadline.signal));
    } catch (error) {
      stopped = deadline.signal.aborted ? TIMED_OUT : LOST;
      console.error("[scheduled-tasks] run did not finish", { id: job.id, error });
      // eve keeps a durable session and its background work running after the
      // client gives up; stop both so they cannot finish later, unseen.
      await session.cancel({ tasks: true, signal: AbortSignal.timeout(10_000) }).catch(() => {});
      const last = await session.snapshot({ signal: AbortSignal.timeout(60_000) }).catch(() => {});
      if (last && last.events.length >= events.length) ({ events, session: cursor } = last);
    }

    const outcome: RunOutcome = stopped
      ? { status: "failed", reason: stopped }
      : runOutcome(events);
    const quiet = outcome.status === "done" && endedQuietly(events);
    const chatId = events.length > 0 ? await saveRun(job, events, cursor) : undefined;

    // A check with nothing to report stays quiet; its chat is still saved.
    if (!quiet || !chatId) {
      const answer = lastAnswer(events);
      const unsaved = chatId ? "" : "Couldn't save the result. ";
      const body =
        outcome.status === "failed"
          ? `Couldn't finish. ${outcome.reason}`
          : outcome.status === "waiting"
            ? "Waiting for you. Open the chat to answer."
            : (finalAnswer(events) ?? "Your scheduled task finished.");
      await sendPush({
        title: job.title,
        body: unsaved + body,
        url: chatId ? `/chat/${chatId}` : "/tasks",
        tag: job.id,
      }).catch((error) =>
        console.error("[scheduled-tasks] notification failed", { id: job.id, error }),
      );
      // Optional mirror for operators who also linked Telegram; pictures stay in the app.
      const images = events.flatMap((event) =>
        event.type === "action.result" ? generatedImageUrls(event.data) : [],
      ).length;
      const mirror =
        (outcome.status === "done" && answer
          ? `${job.title}\n\n${answer}`
          : `${job.title}: ${unsaved}${body}`) +
        (images === 0
          ? ""
          : `\n\n${images === 1 ? "The image is" : `The ${images} images are`} in the Ægentica app.`);
      await mirrorToTelegram(mirror).catch((error) =>
        console.error("[scheduled-tasks] Telegram mirror failed", { id: job.id, error }),
      );
    }

    return {
      chatId,
      failed: outcome.status === "failed" || !chatId,
      waiting: outcome.status === "waiting",
    };
  } finally {
    clearTimeout(timer);
  }
}
