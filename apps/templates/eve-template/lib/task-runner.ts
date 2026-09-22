import { Client, type MessageStreamEvent } from "eve/client";
import { createChat, saveChatSnapshot } from "@/lib/db/queries";
import { INTERNAL_HEADER, internalToken } from "@/lib/internal-auth";
import { OPERATOR_PRINCIPAL_ID } from "@/lib/operator";
import { sendPush } from "@/lib/push-notifications";
import type { ScheduledTask } from "@/lib/schedule-store";
import { readTelegram } from "@/lib/telegram-settings";

const RUN_TIMEOUT_MS = 10 * 60_000;

/** The last assistant text of a run, flattened for a notification preview. */
export function finalAnswer(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.type === "message.completed" && event.data.message?.trim())
      return event.data.message
        .replace(/[#*_`>[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();
  }
  return null;
}

/**
 * Runs one scheduled task through the eve session API, exactly like a web chat,
 * saves the run as a chat in the operator's history, then notifies installed
 * devices (and the linked Telegram chat, if any). Throws only when the run
 * could not be started or saved, so the dispatcher can retry.
 */
export async function runScheduledTask(job: ScheduledTask, options: { host?: string } = {}) {
  const host =
    options.host ?? `http://127.0.0.1:${process.env.NITRO_PORT || process.env.PORT || "4274"}`;
  const client = new Client({
    host,
    headers: { [INTERNAL_HEADER]: internalToken() },
    redirect: "error",
  });
  const { session, response } = await client.sessions.create({
    message: `Scheduled task "${job.title}" is due now. Carry it out and write the result for the user.\n\n${job.prompt}`,
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
  });
  await response.result();
  const snapshot = await session.snapshot({ signal: AbortSignal.timeout(60_000) });

  const chat = await createChat(OPERATOR_PRINCIPAL_ID, { title: job.title });
  await saveChatSnapshot({
    chatId: chat.id,
    events: snapshot.events,
    session: snapshot.session,
    userId: OPERATOR_PRINCIPAL_ID,
  });

  const failed = snapshot.events.some((event) => event.type === "session.failed");
  const answer = finalAnswer(snapshot.events);
  const body = failed
    ? "The task could not finish. Open it to see what happened."
    : (answer ?? "Your scheduled task finished.");
  await sendPush({ title: job.title, body, url: `/chat/${chat.id}`, tag: job.id }).catch(
    () => undefined,
  );

  // Optional mirror for operators who also linked Telegram.
  const telegram = await readTelegram().catch(() => undefined);
  if (telegram?.owner && answer)
    await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram.owner.chatId,
        text: `${job.title}\n\n${answer}`.slice(0, 4000),
      }),
    }).catch(() => undefined);

  return { chatId: chat.id, failed };
}
