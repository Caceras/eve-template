import type { MessageStreamEvent } from "eve/client";

// Event-log helpers for the persisted chat: event identity, compact saves of
// streamed fragments, and what the user typed in a received message.

/** eve stamps every event with a unique, sortable id (stream version 20 on). */
export function streamEventId(event: MessageStreamEvent): string | undefined {
  const id = (event as { readonly meta?: { readonly id?: unknown } }).meta?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

type Fragment = Extract<
  MessageStreamEvent,
  { type: "message.appended" | "reasoning.appended" | "action.input.appended" }
>;

function isFragment(event: MessageStreamEvent): event is Fragment {
  return (
    event.type === "message.appended" ||
    event.type === "reasoning.appended" ||
    event.type === "action.input.appended"
  );
}

function sameRun(left: Fragment, right: Fragment) {
  return (
    left.type === right.type &&
    left.data.turnId === right.data.turnId &&
    left.data.stepIndex === right.data.stepIndex &&
    (left.type !== "action.input.appended" ||
      (right.type === "action.input.appended" && left.data.callId === right.data.callId))
  );
}

function joined(left: Fragment, right: Fragment): Fragment {
  switch (left.type) {
    case "message.appended":
      return {
        ...left,
        data: {
          ...left.data,
          messageDelta: left.data.messageDelta + (right as typeof left).data.messageDelta,
        },
      };
    case "reasoning.appended":
      return {
        ...left,
        data: {
          ...left.data,
          reasoningDelta: left.data.reasoningDelta + (right as typeof left).data.reasoningDelta,
        },
      };
    case "action.input.appended":
      return {
        ...left,
        data: {
          ...left.data,
          inputTextDelta: left.data.inputTextDelta + (right as typeof left).data.inputTextDelta,
        },
      };
  }
}

/**
 * Joins each run of adjacent streamed fragments (text, reasoning or tool input
 * deltas of one step) into a single event. eve's reducer appends deltas in
 * order, so the joined event renders exactly like the run it replaces, while
 * a saved reply shrinks from thousands of events to a handful.
 */
export function compactStreamFragments(events: readonly MessageStreamEvent[]) {
  const compacted: MessageStreamEvent[] = [];
  for (const event of events) {
    const previous = compacted.at(-1);
    if (previous && isFragment(previous) && isFragment(event) && sameRun(previous, event))
      compacted[compacted.length - 1] = joined(previous, event);
    else compacted.push(event);
  }
  return compacted;
}

/**
 * The text the user typed in a `message.received` event. `data.message` also
 * lists attachments ("…\n[file: photo.png (image/png)]"), so prefer the text parts.
 */
export function receivedUserText(event: MessageStreamEvent) {
  if (event.type !== "message.received") return null;
  const texts = event.data.parts?.flatMap((part) => (part.type === "text" ? [part.text] : []));
  return (texts?.length ? texts.join("\n") : event.data.message).trim();
}

/** The text of the latest message the user sent (not one eve wrote for a finished task). */
export function latestUserText(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "message.received" && !event.data.kind) return receivedUserText(event);
  }
  return null;
}

/**
 * What a chat has already shown, to recognise an event that arrives again: a
 * page reading the session from an older cursor, or two readers of one stream.
 * eve's ids identify events, but a saved reply joins its streamed fragments
 * under the first fragment's id, so a fragment also counts as seen once its
 * block (or its turn) has finished.
 */
export type SeenEvents = {
  readonly ids: Set<string>;
  readonly finished: Set<string>;
};

export function createSeenEvents(events: readonly MessageStreamEvent[] = []): SeenEvents {
  const seen: SeenEvents = { ids: new Set(), finished: new Set() };
  for (const event of events) markSeen(seen, event);
  return seen;
}

export function markSeen(seen: SeenEvents, event: MessageStreamEvent) {
  const id = streamEventId(event);
  if (id) seen.ids.add(id);
  for (const key of finishedKeys(event)) seen.finished.add(key);
}

export function hasSeen(seen: SeenEvents, event: MessageStreamEvent) {
  const id = streamEventId(event);
  if (id && seen.ids.has(id)) return true;
  // An event without a turn id cannot be matched to a finished turn.
  if (!isFragment(event) || !event.data.turnId) return false;
  return (
    seen.finished.has(`turn:${event.data.turnId}`) || seen.finished.has(fragmentBlockKey(event))
  );
}

function fragmentBlockKey(event: Fragment) {
  switch (event.type) {
    case "message.appended":
      return `text:${event.data.turnId}:${event.data.stepIndex}`;
    case "reasoning.appended":
      return `reasoning:${event.data.turnId}:${event.data.stepIndex}`;
    case "action.input.appended":
      return `input:${event.data.callId}`;
  }
}

function finishedKeys(event: MessageStreamEvent): string[] {
  if ("data" in event && (event.data as { turnId?: unknown }).turnId === "") return [];
  switch (event.type) {
    case "message.completed":
      return [`text:${event.data.turnId}:${event.data.stepIndex}`];
    case "reasoning.completed":
      return [`reasoning:${event.data.turnId}:${event.data.stepIndex}`];
    case "actions.requested":
      return event.data.actions.map((action) => `input:${action.callId}`);
    case "turn.completed":
    case "turn.cancelled":
    case "turn.failed":
      return [`turn:${event.data.turnId}`];
    default:
      return [];
  }
}

export function isStreamFragment(event: MessageStreamEvent) {
  return isFragment(event);
}
