// The persisted chat's event-log helpers: joined fragments render exactly like
// the stream they replace (through eve's own reducer), event identity, and the
// typed text of a received message.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { defaultMessageReducer } from "eve/client";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const {
  compactStreamFragments,
  createSeenEvents,
  hasSeen,
  latestUserText,
  markSeen,
  receivedUserText,
  streamEventId,
} = await import("../lib/chat/event-log.ts");

let id = 0;
const event = (type, data) => ({
  type,
  data,
  meta: { id: `evt_${String(id++).padStart(6, "0")}` },
});
const turn = "turn_1";
const delta = (type, text, extra = {}) =>
  event(type, {
    ...(type === "message.appended" ? { messageDelta: text } : {}),
    ...(type === "reasoning.appended" ? { reasoningDelta: text } : {}),
    ...(type === "action.input.appended" ? { inputTextDelta: text } : {}),
    sequence: 1,
    stepIndex: 0,
    turnId: turn,
    ...extra,
  });
const events = [
  event("turn.started", { sequence: 1, turnId: turn }),
  event("message.received", {
    message: "Plan my day\n[file: day.png (image/png)]",
    parts: [
      { type: "text", text: "Plan my day" },
      { type: "file", mediaType: "image/png", filename: "day.png" },
    ],
    sequence: 1,
    turnId: turn,
  }),
  event("step.started", { modelId: "m", sequence: 1, stepIndex: 0, turnId: turn }),
  ...["Think", "ing ", "hard"].map((text) => delta("reasoning.appended", text)),
  ...["Hel", "lo ", "there"].map((text) => delta("message.appended", text)),
  ...['{"ci', 'ty":', '"Oslo"}'].map((text) =>
    delta("action.input.appended", text, { callId: "call_1", toolName: "get_weather" }),
  ),
  ...['{"x":', "1}"].map((text) =>
    delta("action.input.appended", text, { callId: "call_2", toolName: "get_weather" }),
  ),
  ...[" and", " more"].map((text) => delta("message.appended", text)),
  event("message.completed", {
    finishReason: "stop",
    message: "Hello there and more",
    sequence: 1,
    stepIndex: 0,
    turnId: turn,
  }),
  event("turn.completed", { sequence: 1, turnId: turn }),
];

const compacted = compactStreamFragments(events);
assert.deepEqual(
  compacted.map((item) => item.type),
  [
    "turn.started",
    "message.received",
    "step.started",
    "reasoning.appended",
    "message.appended",
    "action.input.appended",
    "action.input.appended",
    "message.appended",
    "message.completed",
    "turn.completed",
  ],
  "each adjacent run of one step's fragments becomes one event; separate runs stay apart",
);
assert.equal(compacted[3].data.reasoningDelta, "Thinking hard");
assert.equal(compacted[4].data.messageDelta, "Hello there");
assert.equal(compacted[5].data.inputTextDelta, '{"city":"Oslo"}');
assert.equal(compacted[6].data.callId, "call_2", "a different tool call is its own run");
assert.equal(streamEventId(compacted[4]), streamEventId(events[6]), "a run keeps its first id");

// eve's reducer renders the joined log exactly like the streamed one, including
// the state in the middle of a reply (before message.completed).
const reduce = (log) => {
  const reducer = defaultMessageReducer();
  let state = reducer.initial();
  for (const item of log) state = reducer.reduce(state, item);
  return JSON.parse(JSON.stringify(state));
};
assert.deepEqual(reduce(compacted), reduce(events), "same messages after the turn");
const midway = events.slice(0, 9);
assert.deepEqual(reduce(compactStreamFragments(midway)), reduce(midway), "same while streaming");
assert.deepEqual(compactStreamFragments([]), []);

assert.equal(receivedUserText(events[1]), "Plan my day", "attachment lines are not typed text");
assert.equal(
  receivedUserText(event("message.received", { message: "  plain  ", sequence: 1, turnId: turn })),
  "plain",
);
assert.equal(receivedUserText(events[0]), null);
assert.equal(streamEventId({ type: "turn.started", data: {} }), undefined);
// A chat that saved the joined reply recognises the stream read again from an
// older cursor: every event by id, and fragments 2..n (whose ids the joined
// event dropped) because their block or turn already finished.
const savedReply = createSeenEvents(compacted);
for (const item of events) assert(hasSeen(savedReply, item), `seen again: ${item.type}`);
const nextTurn = "turn_2";
const fresh = event("message.appended", {
  messageDelta: "new",
  sequence: 2,
  stepIndex: 0,
  turnId: nextTurn,
});
assert(!hasSeen(savedReply, fresh), "a fragment of a new turn is new");
markSeen(savedReply, fresh);
assert(hasSeen(savedReply, fresh), "and seen once shown");
const sameBlock = event("message.appended", {
  messageDelta: " more",
  sequence: 2,
  stepIndex: 0,
  turnId: nextTurn,
});
assert(!hasSeen(savedReply, sameBlock), "the next fragment of an open block is new");
const midReply = createSeenEvents(events.slice(0, 7));
assert(!hasSeen(midReply, events[7]), "a live reply keeps streaming");
assert(hasSeen(createSeenEvents([events[7]]), events[7]), "by id");

// eve 0.67 streams the continuation after an answered question with an empty
// turn id: its end must not make every later empty-id fragment look replayed.
const continued = createSeenEvents([event("turn.completed", { sequence: 3, turnId: "" })]);
assert(
  !hasSeen(
    continued,
    event("message.appended", { messageDelta: "x", sequence: 4, stepIndex: 0, turnId: "" }),
  ),
  "an empty turn id never counts as a finished turn",
);

assert.equal(latestUserText(events), "Plan my day");
assert.equal(
  latestUserText([
    ...events,
    event("message.received", {
      kind: "execution.background_task",
      message: "task done",
      sequence: 2,
      turnId: nextTurn,
    }),
  ]),
  "Plan my day",
  "a message eve wrote for a finished task is not the user's",
);
assert.equal(latestUserText([]), null);
console.log(
  "PASS: joined stream fragments render like the stream (eve reducer), event ids, typed text of received messages, replayed events recognised",
);
