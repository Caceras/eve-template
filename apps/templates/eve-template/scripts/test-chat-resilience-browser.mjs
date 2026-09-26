// A persisted chat survives the ways people actually leave and return: Back to
// a chat, leaving while a reply streams, a reload mid-reply, and a large photo.
// Runs only against an isolated production build (check-product.sh) with eve's
// mock model, and reads that build's own SQLite file to prove what was saved.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync, crc32 } from "node:zlib";
import { randomBytes } from "node:crypto";
import { launchBrowser } from "./browser.mjs";

const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Local fixture only.");
const databasePath = process.env.EVE_CHAT_DB_PATH;
assert(databasePath, "EVE_CHAT_DB_PATH must point at the fixture's chat database");
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa");
await mkdir(output, { recursive: true });

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(page.url() + " — " + error.message));
const posts = [];
page.on("request", (request) => {
  if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/eve/v1/session"))
    posts.push(request.postData() ?? "");
});

const composer = () => page.locator("[data-chat-composer-input]").first();
async function send(text) {
  await composer().click();
  await composer().fill(text);
  await composer().press("Enter");
}
const reply = (text) => page.getByText("Mock reply: " + text).first();
const chatId = () => new URL(page.url()).pathname.split("/").pop();
function saved(id) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const events = db
      .prepare("SELECT event FROM chat_event WHERE chat_id = ? ORDER BY event_index")
      .all(id)
      .map((row) => JSON.parse(row.event));
    const chat = db
      .prepare(
        "SELECT pending_user_message AS pending, eve_session AS session FROM chat WHERE id = ?",
      )
      .get(id);
    const received = events
      .filter((event) => event.type === "message.received")
      .map((event) => event.data.parts?.find((part) => part.type === "text")?.text ?? "");
    return {
      events,
      pending: chat?.pending ?? null,
      received,
      session: chat?.session ? JSON.parse(chat.session) : null,
    };
  } finally {
    db.close();
  }
}
const sentCount = (text) => posts.filter((body) => body.includes(text)).length;
const cancels = [];
page.on("request", (request) => {
  if (request.method() === "POST" && /\/eve\/v1\/session\/[^/]+\/cancel$/.test(request.url()))
    cancels.push(request.url());
});
async function newChat() {
  await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
  await composer().waitFor();
  // Typing before hydration is dropped; wait until the composer reacts.
  await page.waitForFunction(() => {
    const box = document.querySelector("[data-chat-composer-input]");
    return box && !box.hasAttribute("disabled");
  });
  await page.waitForTimeout(500);
}
async function composerReady() {
  await page.waitForFunction(() => {
    const box = document.querySelector("[data-chat-composer-input]");
    return box && !box.hasAttribute("disabled");
  });
}
// Stream reads end right after the first line matching `pattern`, as a dropped connection would.
async function cutStreamsAfter(pattern) {
  await page.evaluate((pattern) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const response = await realFetch(input, init);
      if (!url.includes("/stream") || !response.body) return response;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let cut = false;
      const body = new ReadableStream({
        async pull(controller) {
          if (cut) return new Promise(() => {});
          const { value, done } = await reader.read();
          if (done) return controller.close();
          buffer += decoder.decode(value, { stream: true });
          let out = "";
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline + 1);
            buffer = buffer.slice(newline + 1);
            out += line;
            if (line.includes(pattern)) {
              cut = true;
              break;
            }
          }
          if (out) controller.enqueue(encoder.encode(out));
        },
      });
      return new Response(body, { status: response.status, headers: response.headers });
    };
  }, pattern);
}
// A turn eve runs on the chat's session without this page, as a finished task reports back.
async function postToSession(id, message) {
  const { sessionId } = saved(id).session;
  const response = await context.request.post(`${origin}/eve/v1/session/${sessionId}`, {
    headers: { Origin: origin, "content-type": "application/json" },
    data: { message },
  });
  assert.equal(response.status(), 202, "eve accepts the message");
}
// Error toasts; Next's route announcer is an empty role="alert" too.
const alertTexts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')]
      .map((node) => node.textContent?.trim())
      .filter(Boolean),
  );
async function waitFor(condition, what, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    assert(Date.now() < deadline, what);
    await page.waitForTimeout(200);
  }
}

async function check(name, work) {
  try {
    await work();
    checks.push({ name, passed: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: String(error) });
    await page
      .screenshot({ path: join(output, `chat-failure-${checks.length}.png`), fullPage: true })
      .catch(() => {});
    throw error;
  }
}

try {
  await check("every response carries the baseline security headers", async () => {
    const response = await context.request.get(origin + "/");
    const headers = response.headers();
    assert.match(headers["content-security-policy"] ?? "", /frame-ancestors 'self'/);
    assert.match(headers["content-security-policy"] ?? "", /img-src 'self' data: blob:/);
    assert.equal(headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.match(headers["strict-transport-security"] ?? "", /max-age=/);
    assert.equal(headers["x-powered-by"], undefined);
  });

  await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
  const username = page.getByLabel("Username", { exact: true });
  for (let attempt = 0; !(await username.isVisible()); attempt++) {
    assert(attempt < 15, "sign-in dialog opens");
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await username.waitFor({ timeout: 2000 }).catch(() => {});
  }
  await username.fill(process.env.EVE_CHAT_USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(async () => (await fetch("/api/agents")).status === 200);
  await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });

  await check("Back to a chat neither resends its first message nor cuts history", async () => {
    await newChat();
    const first = "Back first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    const second = "Back second " + Date.now();
    await send(second);
    await reply(second).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const id = chatId();
    const url = page.url();
    const before = saved(id).events.length;
    // The window and history name the chat, and hand the title to the next page.
    assert.equal(await page.title(), `${first} · Ægentica`);
    await page
      .getByRole("link", { name: /^Tasks/ })
      .first()
      .click();
    await page.waitForURL(/\/tasks/);
    await page.waitForTimeout(1000);
    assert.doesNotMatch(await page.title(), /Back first/, "the chat's title stays with the chat");
    await page.goBack();
    await page.waitForURL(url);
    await page.waitForTimeout(5000);
    assert.equal(await page.title(), `${first} · Ægentica`, "and returns with it");
    assert.equal(sentCount(first), 1, "the first message is sent once");
    assert.equal(sentCount(second), 1, "the second message is sent once");
    const after = saved(id);
    assert.equal(after.events.length, before, "saved history is unchanged by Back");
    assert.deepEqual(after.received, [first, second]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(second).waitFor();
    assert.equal(await page.getByText("Mock reply: " + first).count(), 1);
  });

  await check("leaving while a reply streams resumes it on return", async () => {
    await newChat();
    const first = "Leave first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const url = page.url();
    const id = chatId();
    // A full load, so the page's server data no longer carries the first message.
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await reply(first).waitFor();
    await page.waitForTimeout(1000);
    // Hold the reply's stream so the turn is still open when the page is left.
    await page.route("**/eve/v1/session/*/stream**", async (route) => {
      await new Promise((done) => setTimeout(done, 3000));
      await route.continue().catch(() => {});
    });
    const second = "Leave second " + Date.now();
    await send(second);
    await page.waitForTimeout(700);
    await page
      .getByRole("link", { name: /^Tasks/ })
      .first()
      .click();
    await page.waitForURL(/\/tasks/);
    await page.waitForTimeout(3500);
    await page.goBack();
    await page.waitForURL(url);
    await page.unroute("**/eve/v1/session/*/stream**");
    await reply(second).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => {
      const box = document.querySelector("[data-chat-composer-input]");
      return box && !box.hasAttribute("disabled");
    });
    assert.equal(await page.getByRole("button", { name: "Stop response" }).count(), 0);
    await page.waitForTimeout(1500);
    const after = saved(id);
    assert.deepEqual(after.received, [first, second], "both turns are saved");
    assert.equal(after.pending, null, "the turn settled");
    assert.equal(sentCount(second), 1, "the second message is sent once");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(second).waitFor();
  });

  await check("a reload mid-reply resumes without saving the reply twice", async () => {
    await newChat();
    // Cut the stream right after the reply completes, as a dropped connection would.
    await page.evaluate(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        const response = await realFetch(input, init);
        if (!url.includes("/stream") || !response.body) return response;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";
        let cut = false;
        const body = new ReadableStream({
          async pull(controller) {
            if (cut) return new Promise(() => {});
            const { value, done } = await reader.read();
            if (done) return controller.close();
            buffer += decoder.decode(value, { stream: true });
            let out = "";
            let newline;
            while ((newline = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, newline + 1);
              buffer = buffer.slice(newline + 1);
              out += line;
              if (line.includes('"type":"message.completed"')) {
                cut = true;
                break;
              }
            }
            if (out) controller.enqueue(encoder.encode(out));
          },
        });
        return new Response(body, { status: response.status, headers: response.headers });
      };
    });
    const text = "What is the weather like? " + Date.now();
    await send(text);
    await page.waitForURL(/\/chat\//);
    await page.waitForTimeout(4000);
    const id = chatId();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(text).waitFor({ timeout: 30000 });
    assert.equal(await page.getByText("Mock reply: " + text).count(), 1, "one reply");
    const completed = saved(id).events.filter((event) => event.type === "message.completed");
    const ids = completed.map((event) => event.meta?.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "no completed message is saved twice");
  });

  await check(
    "a reload before eve's receipt is saved does not send the message twice",
    async () => {
      await newChat();
      const first = "Receipt first " + Date.now();
      await send(first);
      await reply(first).waitFor({ timeout: 30000 });
      await page.waitForTimeout(1000);
      const id = chatId();
      await page.goto(page.url(), { waitUntil: "domcontentloaded" });
      await reply(first).waitFor();
      await composerReady();
      // Hold every stream read, so message.received never reaches this page.
      await page.route("**/eve/v1/session/*/stream**", async (route) => {
        await new Promise((done) => setTimeout(done, 60000));
        await route.continue().catch(() => {});
      });
      const second = "Receipt second " + Date.now();
      await send(second);
      await waitFor(() => saved(id).pending === second, "the message is marked pending");
      await waitFor(() => sentCount(second) === 1, "the message was posted to eve");
      await page.unroute("**/eve/v1/session/*/stream**");
      await page.reload({ waitUntil: "domcontentloaded" });
      await reply(second).waitFor({ timeout: 30000 });
      await page.waitForTimeout(2500);
      assert.equal(sentCount(second), 1, "the message is sent once");
      assert.equal(await page.getByText("Mock reply: " + second).count(), 1, "one reply");
      const after = saved(id);
      assert.deepEqual(after.received, [first, second], "eve's turn is saved once");
      assert.equal(after.pending, null, "the turn settled");
    },
  );

  await check("a resumed reply in several pieces is not repeated by the next message", async () => {
    await newChat();
    const first = "Pieces first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const id = chatId();
    await page.goto(page.url(), { waitUntil: "domcontentloaded" });
    await reply(first).waitFor();
    await composerReady();
    await cutStreamsAfter('"type":"message.received"');
    const second = "Pieces second slow reply " + Date.now();
    await send(second);
    await waitFor(() => saved(id).received.includes(second), "eve received the message");
    // The reload resumes the reply from the saved cursor, fragment by fragment.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByText("Slow mock reply: " + second)
      .first()
      .waitFor({ timeout: 30000 });
    await waitFor(
      () =>
        saved(id).events.filter((event) => event.type === "message.completed").length === 2 &&
        saved(id).pending === null,
      "the resumed reply is saved",
      20000,
    );
    const pieces = saved(id).events.filter(
      (event) => event.type === "message.appended" && event.data.turnId.endsWith("turn_1"),
    );
    assert.equal(pieces.length, 1, "the saved reply joins its streamed pieces");
    await composerReady();
    const third = "Pieces third " + Date.now();
    await send(third);
    await reply(third).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const countEnds = async () =>
      (await page.locator("article").allInnerTexts()).join("\n").split("Eight.").length - 1;
    assert.equal(await countEnds(), 1, "the resumed reply is shown once");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(third).waitFor();
    assert.equal(await countEnds(), 1, "and saved once");
  });

  await check("an open chat shows and saves turns it did not start", async () => {
    await newChat();
    const first = "Follow first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const id = chatId();
    const url = page.url();
    // After this page's own turn (eve's hook reads the session).
    const afterSend = "Follow after send " + Date.now();
    await postToSession(id, afterSend);
    await reply(afterSend).waitFor({ timeout: 15000 });
    // After a reload (this page reads the session from its saved cursor).
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(afterSend).waitFor();
    await composerReady();
    const afterReload = "Follow after reload " + Date.now();
    await postToSession(id, afterReload);
    await reply(afterReload).waitFor({ timeout: 15000 });
    // While the page is hidden by client navigation, then Back.
    await page
      .getByRole("link", { name: /^Tasks/ })
      .first()
      .click();
    await page.waitForURL(/\/tasks/);
    const whileAway = "Follow while away " + Date.now();
    await postToSession(id, whileAway);
    await page.waitForTimeout(2000);
    await page.goBack();
    await page.waitForURL(url);
    await reply(whileAway).waitFor({ timeout: 15000 });
    await waitFor(
      () => saved(id).received.length === 4 && saved(id).pending === null,
      "every turn is saved",
    );
    const after = saved(id);
    assert.deepEqual(after.received, [first, afterSend, afterReload, whileAway]);
    const ids = after.events.map((event) => event.meta?.id);
    assert.equal(new Set(ids).size, ids.length, "no event is saved twice");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(whileAway).waitFor();
    for (const text of [first, afterSend, afterReload, whileAway])
      assert.equal(await page.getByText("Mock reply: " + text).count(), 1, text);
  });

  await check("a chat whose session ended continues in a new one and says so", async () => {
    const startedOver = page.getByRole("note").filter({ hasText: "started over" });
    // eve ends a session at its deadline (and on failure) and then refuses messages.
    await newChat();
    const first = "Ended first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const id = chatId();
    const ended = saved(id).session.sessionId;
    const reset = await context.request.post(`${origin}/eve/v1/session/${ended}/reset`, {
      headers: { Origin: origin, "content-type": "application/json" },
      data: { reason: "browser check" },
    });
    assert(reset.ok(), "eve ends the session");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(first).waitFor();
    await composerReady();
    const second = "Ended second " + Date.now();
    await send(second);
    await reply(second).waitFor({ timeout: 30000 });
    await startedOver.waitFor();
    assert.deepEqual(await alertTexts(), [], "no error");
    await waitFor(() => saved(id).pending === null, "the reply is saved");
    const after = saved(id);
    assert.notEqual(after.session.sessionId, ended, "the chat keeps its new session");
    assert.deepEqual(after.received, [first, second]);

    // Activity's Reset also retires the session; the chat that used it starts a new one.
    const retired = after.session.sessionId;
    await page.goto(origin + "/session", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Session ID").fill(retired);
    await page.getByRole("button", { name: /Reset/ }).first().click();
    await page
      .getByRole("button", { name: /^Reset$/ })
      .last()
      .click();
    await waitFor(() => saved(id).session === null, "Activity forgets the reset session");
    await page.goto(`${origin}/chat/${id}`, { waitUntil: "domcontentloaded" });
    await reply(second).waitFor();
    await composerReady();
    const third = "Ended third " + Date.now();
    await send(third);
    await reply(third).waitFor({ timeout: 30000 });
    assert.equal(await startedOver.count(), 2, "each restart is marked");
    assert.deepEqual(await alertTexts(), [], "no error after the Activity reset");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply(third).waitFor();
    assert.equal(await startedOver.count(), 2, "and stays marked after a reload");
  });

  await check(
    "a correction steers a streaming reply, also one resumed after a reload",
    async () => {
      const steerButton = page.getByRole("button", { name: "Steer current turn" });
      const steer = async (text) => {
        await page.waitForFunction(() => {
          const box = document.querySelector("[data-chat-composer-input]");
          return box && !box.disabled && box.placeholder === "Add a correction…";
        });
        await composer().fill(text);
        await steerButton.click();
        await reply(text).waitFor({ timeout: 30000 });
        assert(
          posts.some((body) => body.includes(text) && body.includes('"turnPolicy":"steer"')),
          "sent as a correction of the running turn",
        );
      };
      await newChat();
      const slow = "Steer slow reply " + Date.now();
      await send(slow);
      const correction = "Steer correction " + Date.now();
      await steer(correction);
      const id = chatId();
      // A reply the page resumes after a reload can be corrected too.
      const resumed = "Steer again slow reply " + Date.now();
      await send(resumed);
      await waitFor(() => saved(id).received.includes(resumed), "eve received the message");
      await page.reload({ waitUntil: "domcontentloaded" });
      const again = "Steer resumed correction " + Date.now();
      await steer(again);
      await waitFor(() => saved(id).pending === null && saved(id).received.length === 4, "saved");
      assert.deepEqual(saved(id).received, [slow, correction, resumed, again]);
      assert.equal(sentCount(resumed), 1, "the resumed message is not sent again");
      assert.deepEqual(await alertTexts(), [], "no error");
    },
  );

  await check("Stop cancels a reply, also one resumed after a reload", async () => {
    const stop = page.getByRole("button", { name: "Stop response" });
    const stopReply = async (id) => {
      const before = cancels.length;
      await stop.click();
      await waitFor(() => cancels.length > before, "Stop asks eve to cancel the turn");
      await stop.waitFor({ state: "hidden", timeout: 15000 });
      await waitFor(
        () => saved(id).events.filter((event) => event.type === "turn.cancelled").length > 0,
        "the cancelled turn is saved",
      );
    };
    await newChat();
    const own = "Stop own slow reply " + Date.now();
    await send(own);
    // The saved chat, not the provisional one shown while it is created.
    await page.waitForURL(/\/chat\/[0-9a-f]{8}-/);
    const id = chatId();
    await waitFor(() => saved(id).received.includes(own), "eve received the message");
    await stopReply(id);
    const resumed = "Stop resumed slow reply " + Date.now();
    await composerReady();
    await send(resumed);
    await waitFor(() => saved(id).received.includes(resumed), "eve received the message");
    await page.reload({ waitUntil: "domcontentloaded" });
    await stop.waitFor();
    const cancelled = saved(id).events.filter((event) => event.type === "turn.cancelled").length;
    await stopReply(id);
    await waitFor(
      () => saved(id).events.filter((event) => event.type === "turn.cancelled").length > cancelled,
      "the resumed turn is cancelled",
    );
    await page.waitForTimeout(6000);
    assert.equal(
      (await page.locator("article").allInnerTexts()).join("\n").split("Eight.").length - 1,
      0,
      "neither reply ran to the end",
    );
    assert.deepEqual(await alertTexts(), [], "no error");
    await composerReady();
    // A correction folds into a turn this page did not start; Stop still ends it.
    const corrected = "Stop corrected slow reply " + Date.now();
    await send(corrected);
    await waitFor(() => saved(id).received.includes(corrected), "eve received the message");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const box = document.querySelector("[data-chat-composer-input]");
      return box && !box.disabled && box.placeholder === "Add a correction…";
    });
    const correction = "Stop correction slow reply " + Date.now();
    await composer().fill(correction);
    await page.getByRole("button", { name: "Steer current turn" }).click();
    await waitFor(() => saved(id).received.includes(correction), "the correction arrived");
    const before = saved(id).events.filter((event) => event.type === "turn.cancelled").length;
    await stopReply(id);
    await waitFor(
      () => saved(id).events.filter((event) => event.type === "turn.cancelled").length > before,
      "the corrected turn is cancelled",
    );
    assert.deepEqual(await alertTexts(), [], "no error after stopping a correction");
  });

  await check("offline and an expired sign-in are explained; the message is kept", async () => {
    const password = page.getByLabel("Password", { exact: true });
    const signInAgain = async () => {
      await page.getByLabel("Username", { exact: true }).fill(process.env.EVE_CHAT_USERNAME);
      await password.fill(process.env.EVE_CHAT_PASSWORD);
      await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
      await password.waitFor({ state: "hidden" });
    };
    const expectReadable = async (pattern) => {
      await waitFor(
        async () => (await alertTexts()).some((text) => pattern.test(text)),
        `the error toast says ${pattern}`,
      );
      assert.doesNotMatch((await alertTexts()).join(" "), /Minified React error|react\.dev/);
    };
    await newChat();
    const first = "Kept first " + Date.now();
    await send(first);
    await reply(first).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const id = chatId();

    await context.setOffline(true);
    const offline = "Kept offline " + Date.now();
    await send(offline);
    await expectReadable(/You're offline/);
    assert.equal(await composer().inputValue(), offline, "the message stays in the box");
    await context.setOffline(false);
    await composer().fill("");

    // The sign-in expires while the chat is open.
    await context.clearCookies();
    const expired = "Kept after sign-in " + Date.now();
    await send(expired);
    await password.waitFor();
    await expectReadable(/sign-in has expired/);
    assert.equal(await composer().inputValue(), expired, "the message stays in the box");
    await signInAgain();
    await page.waitForURL(new RegExp(id));
    await waitFor(
      async () => (await composer().inputValue()) === expired,
      "the message is back in its chat after signing in",
    );
    await composerReady();
    await composer().press("Enter");
    await reply(expired).waitFor({ timeout: 30000 });

    // The sign-in expires on the home page: the new chat cannot be created.
    await newChat();
    await context.clearCookies();
    const fromHome = "Kept from home " + Date.now();
    await send(fromHome);
    await password.waitFor();
    await page.waitForURL(origin + "/");
    await expectReadable(/sign-in has expired/);
    assert.equal(await composer().inputValue(), fromHome, "the message is back in the box");
    await signInAgain();
    await waitFor(
      async () => (await composer().inputValue()) === fromHome,
      "the message is still there after signing in",
    );
  });

  await check(
    "approvals and questions: approve, cancel, answer; a pending one survives a reload",
    async () => {
      const answers = () => posts.filter((body) => body.includes('"inputResponses"')).length;
      const answered = (text) => page.getByText("Mock reply: " + text).first();
      const replyText = (text) =>
        page
          .locator("article")
          .filter({ hasText: "Mock reply: " + text })
          .last()
          .innerText();
      await newChat();
      // Approve, after a reload with the approval pending, with a double tap.
      const approve = "Approval demo approve " + Date.now();
      await send(approve);
      const approveButton = page.getByRole("button", { name: "Approve", exact: true });
      await approveButton.waitFor({ timeout: 30000 });
      const id = chatId();
      await waitFor(() => saved(id).pending === null, "the pending approval is saved");
      await page.reload({ waitUntil: "domcontentloaded" });
      await approveButton.waitFor();
      const before = answers();
      await approveButton.dblclick();
      await answered(approve).waitFor({ timeout: 30000 });
      assert.equal(answers() - before, 1, "a double tap sends one answer");
      assert.equal(await approveButton.count(), 0, "the approval is settled");
      await waitFor(
        () =>
          saved(id).events.some(
            (event) =>
              event.type === "input.resolved" && event.data.resolutions[0]?.outcome === "approved",
          ),
        "eve recorded the approval",
      );
      // The approved call ran: a per-turn note after the answer used to leave it unrun.
      await waitFor(
        () =>
          saved(id).events.some(
            (event) =>
              event.type === "action.result" &&
              event.data.result?.toolName === "write_file" &&
              event.data.status === "completed",
          ),
        "the approved write_file ran",
      );
      await waitFor(
        async () => /Tool result:/.test(await replyText(approve)),
        "its result reached the agent",
      );
      // Cancel.
      await composerReady();
      const cancel = "Approval demo cancel " + Date.now();
      await send(cancel);
      await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 30000 });
      await answered(cancel).waitFor({ timeout: 30000 });
      await page.getByText("Denied").last().waitFor({ state: "attached" });
      // A question, answered with an option.
      await composerReady();
      const option = "Ask me with an option " + Date.now();
      await send(option);
      await page.getByRole("button", { name: "Blue", exact: true }).click({ timeout: 30000 });
      await answered(option).waitFor({ timeout: 30000 });
      await waitFor(
        async () => /"answer":"Blue"/.test(await replyText(option)),
        "the answer reached the agent",
      );
      // A question, answered in words.
      await composerReady();
      const words = "Ask me in words " + Date.now();
      await send(words);
      const field = page.getByPlaceholder("Type a response").last();
      await field.fill("Purple");
      await field.press("Enter");
      await answered(words).waitFor({ timeout: 30000 });
      await waitFor(
        async () => /"answer":"Purple"/.test(await replyText(words)),
        "the words reached the agent",
      );
      await waitFor(() => saved(id).pending === null, "saved");
      assert.equal(
        saved(id).events.filter((event) => event.type === "input.resolved").length,
        4,
        "four answers settled",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await answered(words).waitFor();
      assert.equal(await approveButton.count(), 0, "nothing is left to answer after a reload");
      assert.deepEqual(await alertTexts(), [], "no error");
    },
  );

  await check("a chat with a large photo saves completely", async () => {
    // A 2.4 MB PNG: past Next's 1 MB default body limit once sent as a data URL.
    const width = 900;
    const rows = Buffer.concat(
      Array.from({ length: width }, () =>
        Buffer.concat([Buffer.from([0]), randomBytes(width * 3)]),
      ),
    );
    const chunk = (type, data) => {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(data.length);
      const tail = Buffer.alloc(4);
      tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])) >>> 0);
      return Buffer.concat([head, Buffer.from(type), data, tail]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(width, 4);
    header.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows, { level: 0 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const file = join(output, "large-photo.png");
    await writeFile(file, png);
    const note = join(output, "notes.txt");
    await writeFile(note, "Notes for the photo.\n");
    await newChat();
    await page.locator('input[type="file"]').first().setInputFiles([file, note]);
    await page.waitForTimeout(800);
    const text = "Large photo " + Date.now();
    await send(text);
    await reply(text).waitFor({ timeout: 40000 });
    await page.waitForTimeout(2500);
    assert.equal(await page.getByText(/Failed to save/).count(), 0, "no save error");
    const after = saved(chatId());
    assert.equal(after.pending, null, "the end-of-turn save went through");
    assert.deepEqual(after.received, [text]);
    // The files show in the message they were sent with: the photo as a
    // thumbnail that opens the viewer, the text file as a chip.
    const sent = async () => {
      const message = page.locator("article").filter({ hasText: text }).first();
      await message.getByRole("button", { name: "View large-photo.png" }).waitFor();
      await message.getByText("notes.txt").waitFor();
    };
    await sent();
    // Opening the chat sends its history once: from /api/chats/:id, not also
    // inside the page (the photo is in the history as a data URL).
    const loads = [];
    const countLoads = (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/chats/")) loads.push(request.url());
    };
    page.on("request", countLoads);
    const document = await page.reload({ waitUntil: "domcontentloaded" });
    await reply(text).waitFor();
    await sent();
    await page.waitForTimeout(1500);
    page.off("request", countLoads);
    assert.equal(loads.length, 1, "the history is loaded once");
    assert((await document.body()).length < 1_000_000, "the page itself does not carry the photo");
    await page.getByRole("button", { name: "View large-photo.png" }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
  });

  assert.deepEqual(errors, [], "no uncaught page errors");
  await writeFile(
    join(output, "chat-browser-results.json"),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  console.log(`PASS: ${checks.length} chat resilience checks; no uncaught page errors`);
} finally {
  await context.close();
  await browser.close();
}
