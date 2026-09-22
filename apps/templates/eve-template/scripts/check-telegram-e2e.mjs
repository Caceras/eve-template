// End-to-end check against a running app whose outgoing Telegram API calls are
// faked (see docs/SELF_HOSTING.md). Drives pairing, owner/stranger messages,
// webhook secret rejection and one scheduled task saved as a web chat.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const host = process.env.CHECK_ORIGIN || "http://127.0.0.1:3311";
const logFile = process.env.FAKE_TELEGRAM_LOG;
const telegram = await import("../lib/telegram-settings.ts");
const store = await import("../lib/schedule-store.ts");
const chats = await import("../lib/db/sqlite-queries.ts");
const { OPERATOR_PRINCIPAL_ID } = await import("../lib/operator.ts");
const calls = () =>
  readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

await telegram.connectTelegram("123456789:" + "A".repeat(35), "https://example.test");
const config = await telegram.readTelegram();
let updateId = 1;
const webhook = (message, secret = config.webhookSecret) =>
  fetch(`${host}/eve/v1/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: message.chatId, type: "private" },
        from: { id: message.userId, is_bot: false, first_name: "Test", username: message.username },
        text: message.text,
      },
    }),
  });
const sentTo = (chatId, pattern) =>
  calls().find(
    (c) =>
      c.method === "sendMessage" &&
      String(c.body.chat_id) === String(chatId) &&
      pattern.test(c.body.text),
  );

// Wrong secret is rejected before anything is processed.
const forged = await webhook({ chatId: 42, userId: 42, text: "hi" }, "f".repeat(64));
assert(forged.status >= 400, `forged webhook must be rejected, got ${forged.status}`);

// Pair via the one-tap deep link payload.
const code = await telegram.startPairing();
assert.equal(
  (await webhook({ chatId: 42, userId: 42, username: "riki", text: `/start link${code}` })).ok,
  true,
);
await waitFor(() => sentTo(42, /^Linked/), "link confirmation");
assert.equal((await telegram.telegramStatus()).linked, true);
console.log("ok  pairing via deep link");

// A stranger gets nothing and starts no session.
const before = calls().length;
await webhook({ chatId: 99, userId: 99, text: "Hello, who are you?" });
await sleep(3000);
assert(
  !calls()
    .slice(before)
    .some((c) => String(c.body.chat_id) === "99"),
  "stranger is ignored",
);
console.log("ok  stranger ignored");

// The owner's message starts a session: typing, then a reply (the fake model key fails the turn).
const mark = calls().length;
await webhook({ chatId: 42, userId: 42, text: "Hello" });
await waitFor(
  () =>
    calls()
      .slice(mark)
      .find((c) => c.method === "sendChatAction"),
  "typing indicator",
);
const reply = await waitFor(
  () =>
    calls()
      .slice(mark)
      .find((c) => c.method === "sendMessage" && String(c.body.chat_id) === "42"),
  "reply to owner",
);
console.log(
  "ok  owner message reached the agent; reply:",
  JSON.stringify(reply.body.text).slice(0, 120),
);

// A task due now runs on the one-minute schedule and is saved as a web chat.
const task = await store.createTask({
  title: "E2E reminder",
  prompt: "Remind me to stretch.",
  runAt: new Date(Date.now() + 1000).toISOString(),
});
const done = await (async () => {
  const deadline = Date.now() + 130_000;
  while (Date.now() < deadline) {
    const row = (await store.listTasks()).find((t) => t.id === task.id);
    if (row?.lastStatus) return row;
    await sleep(2000);
  }
  throw new Error("Timed out waiting for the scheduled task run");
})();
// A fake model key fails the turn; the run still completes and saves its chat.
assert(["sent", "failed"].includes(done.lastStatus));
assert.equal(done.enabled, false);
const chat = await chats.getChatForUser(done.lastChatId, OPERATOR_PRINCIPAL_ID);
assert.equal(chat?.title, "E2E reminder");
assert(chat.events.some((event) => event.type === "message.received"));
console.log("ok  scheduled task saved as chat", done.lastChatId, "at", done.lastRunAt);
console.log(
  "PASS: Telegram webhook security, pairing, owner-only access, agent session, scheduled task run",
);
