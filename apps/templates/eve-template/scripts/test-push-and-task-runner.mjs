import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-push-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
// A chat database that cannot be opened until the runner checks fix the path.
await writeFile(join(directory, "not-a-folder"), "");
process.env.EVE_CHAT_DB_PATH = join(directory, "not-a-folder", "chats.sqlite");
const realFetch = globalThis.fetch;
const { default: webpush } = await import("web-push");

const { handleNotificationSettings } = await import("../lib/notification-settings-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { INTERNAL_HEADER, internalToken, isInternalRequest } =
  await import("../lib/internal-auth.ts");
const { endedQuietly, finalAnswer, openBackgroundTasks, runOutcome, runScheduledTask } =
  await import("../lib/task-runner.ts");
const { describeTurnFailure } = await import("../lib/turn-failure.ts");
const { addDevice, deviceCount, removeDevice, sendPush } =
  await import("../lib/push-notifications.ts");
const { base64UrlToBytes, currentSubscription, forgetThisDevice, hasOtherKey } =
  await import("../lib/pwa/push-subscription.ts");
const { writeEncrypted } = await import("../lib/secure-settings.ts");
const { getChatForUser } = await import("../lib/db/queries.ts");
const { OPERATOR_PRINCIPAL_ID } = await import("../lib/operator.ts");
const event = (type, data) => ({ type, data, meta: {} });
const report = (message) =>
  event("message.received", { kind: "execution.background_task", message });

try {
  const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
  const call = (body, options = {}) =>
    handleNotificationSettings(
      new Request("https://app.test/api/settings/notifications", {
        method: body ? "POST" : "GET",
        headers: {
          host: "app.test",
          origin: options.origin ?? "https://app.test",
          ...(options.anonymous ? {} : { cookie }),
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );

  // Operator-only, same-origin writes.
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.equal((await call({ action: "test" }, { origin: "https://evil.test" })).status, 403);

  // VAPID key is generated once and kept, encrypted at rest.
  const first = await (await call()).json();
  assert.match(first.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal(first.devices, 0);
  assert.equal((await (await call()).json()).publicKey, first.publicKey);
  const raw = await readFile(
    join(
      directory,
      (await readdir(directory)).find((f) => f.startsWith("push")),
    ),
    "utf8",
  );
  assert(!raw.includes(first.publicKey));

  // Subscriptions are validated, de-duplicated and removable.
  const subscription = {
    endpoint: "https://push.example.test/send/abc",
    keys: { p256dh: "BNc".padEnd(87, "x"), auth: "auth-secret-1234" },
  };
  assert.equal(
    (await call({ action: "subscribe", subscription: { endpoint: "http://x" } })).status,
    400,
  );
  assert.equal(
    (await (await call({ action: "subscribe", subscription, label: "Pixel" })).json()).devices,
    1,
  );
  assert.equal(
    (await (await call({ action: "subscribe", subscription, label: "Pixel" })).json()).devices,
    1,
  );
  assert.equal(
    (await (await call({ action: "unsubscribe", endpoint: subscription.endpoint })).json()).devices,
    0,
  );
  assert.equal((await call({ action: "test" })).status, 422);
  assert.equal((await call({ action: "nope" })).status, 400);

  // Internal token authenticates the scheduler's local eve calls, nothing else.
  assert(isInternalRequest(new Headers({ [INTERNAL_HEADER]: internalToken() })));
  assert(!isInternalRequest(new Headers({ [INTERNAL_HEADER]: "x".repeat(64) })));
  assert(!isInternalRequest(new Headers()));

  // Notification preview is the final assistant message, without markdown.
  assert.equal(
    finalAnswer([
      event("message.completed", { message: "draft" }),
      event("message.completed", { message: "## Weather\n**Sunny**, 18°C" }),
      event("session.waiting", {}),
    ]),
    "Weather Sunny, 18°C",
  );
  assert.equal(finalAnswer([event("session.failed", {})]), null);

  // A task run reports what happened to its last turn, not just session.failed.
  const credits = {
    code: "MODEL_CALL_FAILED",
    message: "Insufficient credits. Add more using https://openrouter.ai/settings/credits",
    details: { statusCode: 402 },
  };
  assert.deepEqual(
    runOutcome([
      event("turn.started", {}),
      event("turn.failed", credits),
      event("session.waiting", {}),
    ]),
    {
      status: "failed",
      reason:
        "OpenRouter is out of credits. Add credits to that account, or switch provider in Settings.",
    },
    "a provider error that leaves the session waiting is a failed run",
  );
  assert.deepEqual(
    runOutcome([
      event("turn.started", {}),
      event("turn.failed", credits),
      event("turn.started", {}),
      event("message.completed", { message: "Done" }),
      event("turn.completed", {}),
    ]),
    { status: "done" },
    "only the last turn counts",
  );
  const asked = event("input.requested", { requests: [{ requestId: "q1" }] });
  assert.deepEqual(runOutcome([event("turn.started", {}), asked]), { status: "waiting" });
  assert.deepEqual(
    runOutcome([
      event("turn.started", {}),
      asked,
      event("input.resolved", { resolutions: [{ requestId: "q1" }] }),
      event("turn.completed", {}),
    ]),
    { status: "done" },
  );

  // Provider failures read as what to do, in every surface.
  assert.match(
    describeTurnFailure({ message: "Unauthorized", details: { statusCode: 401 } }),
    /rejected the API key\. Update the key in Settings/,
  );
  assert.match(
    describeTurnFailure({
      message: "AI Gateway: rate limited",
      details: { upstreamStatusCode: 429 },
    }),
    /^AI Gateway is limiting requests/,
  );
  assert.equal(describeTurnFailure({ message: "Tool crashed" }), "Tool crashed");

  // Narration before a tool call is not the answer; eve's empty-delivery marker is quiet.
  const said = (message, finishReason = "stop") =>
    event("message.completed", { message, finishReason });
  assert.equal(finalAnswer([said("Let me look that up first…", "tool-calls")]), null);
  assert.equal(
    finalAnswer([said("Checking…", "tool-calls"), said("Sunny."), said("Also…", "tool-calls")]),
    "Sunny.",
  );
  assert(endedQuietly([event("turn.started", {}), said(null), event("session.waiting", {})]));
  assert(!endedQuietly([said(null), event("turn.started", {}), said("New turn")]));
  assert(!endedQuietly([event("turn.started", {}), said("Report")]));

  // Background receipts stay open until eve reports them in a later turn.
  const receipt = (taskId) =>
    event("action.result", {
      result: {
        kind: "tool-result",
        callId: taskId,
        toolName: "agent",
        output: { status: "working", taskId },
      },
    });
  assert.deepEqual([...openBackgroundTasks([receipt("t1"), receipt("t2")])], ["t1", "t2"]);
  assert.deepEqual(
    [
      ...openBackgroundTasks([
        receipt("t1"),
        receipt("t2"),
        report("Background task t1 (review) is completed.\n\nResult:\nok"),
        report("Background task t2 (review) needs input."),
      ]),
    ],
    ["t2"],
  );
  assert.equal(
    openBackgroundTasks([receipt("t1"), report("Background task t1 (review) failed.")]).size,
    0,
  );
  assert.equal(openBackgroundTasks([receipt("t1"), report("Some future wording")]).size, 0);

  await runnerChecks();
  await pushChecks();
  console.log(
    "PASS: notification settings auth and CSRF, stable encrypted VAPID key, subscription validation/dedupe/removal, devices refused for a lost key pruned, stale browser subscriptions renewed, sign-out forgets this device, internal scheduler token, result preview without tool-call narration, empty delivery, background receipts, run outcomes (provider failure, waiting for input) and readable provider errors; scheduled runs against a fake eve: compacted chat, background work followed to its report, quiet checks, timeout, failures after start never rethrown, restart attaches to the running session",
  );
} finally {
  globalThis.fetch = realFetch;
  await rm(directory, { recursive: true, force: true });
}

async function pushChecks() {
  // Devices the push service refuses for this server's key (401, 403) are pruned like gone ones.
  await removeDevice("https://push.example.test/send/runner");
  const statuses = { ok: 201, busy: 500, unauthorized: 401, forbidden: 403, gone: 410 };
  for (const name of Object.keys(statuses))
    await addDevice(
      {
        endpoint: `https://push.example.test/send/${name}`,
        keys: { p256dh: "BNc".padEnd(87, "x"), auth: "auth-secret-1234" },
      },
      name,
    );
  webpush.sendNotification = async (device) => {
    const status = statuses[device.endpoint.split("/").at(-1)];
    if (status >= 400) throw Object.assign(new Error(`HTTP ${status}`), { statusCode: status });
    return { statusCode: status };
  };
  const errors = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await sendPush({ title: "t", body: "b", url: "/" }), { sent: 1 });
  } finally {
    console.error = errors;
  }
  assert.equal(await deviceCount(), 2, "only the working and the temporarily failing device stay");

  // A browser subscription made with a key the server no longer has is renewed.
  const [oldKey, newKey] = [webpush.generateVAPIDKeys(), webpush.generateVAPIDKeys()].map(
    (keys) => keys.publicKey,
  );
  const subscription = (key, endpoint = `https://push.example.test/send/${key?.slice(0, 8)}`) => ({
    endpoint,
    options: { applicationServerKey: key ? base64UrlToBytes(key).buffer : null },
    unsubscribed: false,
    async unsubscribe() {
      this.unsubscribed = true;
      return true;
    },
  });
  const pushManager = (existing, refuse = false) => ({
    current: existing,
    subscribes: 0,
    async getSubscription() {
      return this.current && !this.current.unsubscribed ? this.current : null;
    },
    async subscribe({ applicationServerKey }) {
      this.subscribes += 1;
      if (refuse) throw new Error("NotAllowedError");
      const key = Buffer.from(applicationServerKey).toString("base64url");
      return (this.current = subscription(key));
    },
  });
  assert(hasOtherKey(subscription(oldKey), newKey));
  assert(!hasOtherKey(subscription(newKey), newKey));
  assert(!hasOtherKey(subscription(null), newKey), "an unknown key is kept");
  const same = pushManager(subscription(newKey));
  assert.deepEqual(await currentSubscription(same, newKey), {
    subscription: same.current,
    replaced: null,
  });
  assert.equal(same.subscribes, 0);
  const stale = subscription(oldKey);
  const renewing = pushManager(stale);
  const renewed = await currentSubscription(renewing, newKey);
  assert.equal(renewed.replaced, stale.endpoint);
  assert(stale.unsubscribed);
  assert(!hasOtherKey(renewed.subscription, newKey), "resubscribed with the server's key");
  const none = pushManager(null);
  assert.equal((await currentSubscription(none, newKey)).subscription, null);
  assert.equal(none.subscribes, 0, "notifications stay off until turned on");
  assert.equal((await currentSubscription(none, newKey, true)).subscription, none.current);
  // Without a tap some browsers refuse to subscribe: drop the stale one, keep Turn on.
  const refused = await currentSubscription(pushManager(subscription(oldKey), true), newKey);
  assert.equal(refused.subscription, null);
  assert.equal(typeof refused.replaced, "string");
  await assert.rejects(currentSubscription(pushManager(null, true), newKey, true));

  // Signing out removes this device on the server first, then in the browser; best effort.
  const posted = [];
  const thisDevice = subscription(newKey, "https://push.example.test/send/this");
  const serviceWorker = (value) =>
    Object.defineProperty(globalThis.navigator, "serviceWorker", { configurable: true, value });
  serviceWorker({ getRegistration: async () => ({ pushManager: pushManager(thisDevice) }) });
  globalThis.fetch = async (url, init) => {
    posted.push({ url, body: JSON.parse(init.body) });
    return Response.json({});
  };
  await forgetThisDevice();
  assert.deepEqual(posted, [
    {
      url: "/api/settings/notifications",
      body: { action: "unsubscribe", endpoint: "https://push.example.test/send/this" },
    },
  ]);
  assert(thisDevice.unsubscribed);
  const offline = subscription(newKey, "https://push.example.test/send/offline");
  serviceWorker({ getRegistration: async () => ({ pushManager: pushManager(offline) }) });
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  await forgetThisDevice();
  assert(offline.unsubscribed, "the browser stops even when the server cannot be told");
  serviceWorker(undefined);
  await forgetThisDevice();
  globalThis.fetch = realFetch;
}

/** A fake eve session API: scripted sessions, NDJSON streams that follow appends. */
function fakeEve() {
  const sessions = new Map();
  const scripts = [];
  const requests = [];
  const stamp = (event, index) => ({
    ...event,
    meta: { id: `evt_${String(index).padStart(6, "0")}`, at: new Date().toISOString() },
  });
  const session = (id) => {
    const created = { id, events: [], listeners: new Set(), failSnapshots: false };
    sessions.set(id, created);
    return created;
  };
  const append = (target, ...events) => {
    for (const event of events) {
      const stamped = stamp(event, target.events.length);
      target.events.push(stamped);
      for (const listener of target.listeners) listener(stamped);
    }
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://eve.test");
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, path: url.pathname, query: url.search, body });
    if (request.method === "POST" && url.pathname === "/eve/v1/session") {
      const created = session(`s${sessions.size + 1}`);
      scripts.shift()?.(created);
      response.writeHead(202, {
        "content-type": "application/json",
        "x-eve-session-id": created.id,
      });
      return response.end(JSON.stringify({ sessionId: created.id }));
    }
    const match = /^\/eve\/v1\/session\/([^/]+)\/(stream|cancel)$/.exec(url.pathname);
    const target = match && sessions.get(match[1]);
    if (!target) {
      response.writeHead(404, { "content-type": "application/json" });
      return response.end("{}");
    }
    if (match[2] === "cancel") {
      response.writeHead(202, { "content-type": "application/json" });
      return response.end(JSON.stringify({ ok: true, status: "accepted", sessionId: target.id }));
    }
    const bounded = url.searchParams.has("includeTailIndex");
    if (bounded && target.failSnapshots) {
      response.writeHead(400, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: "snapshot refused" }));
    }
    response.writeHead(200, {
      "content-type": "application/x-ndjson",
      "x-eve-stream-version": "25",
      "x-eve-stream-tail-index": String(target.events.length - 1),
    });
    const start = Number(url.searchParams.get("startIndex") ?? 0);
    for (const event of target.events.slice(start)) response.write(JSON.stringify(event) + "\n");
    if (bounded || target.endStreams) return response.end();
    const listener = (event) => response.write(JSON.stringify(event) + "\n");
    target.listeners.add(listener);
    response.on("close", () => target.listeners.delete(listener));
  });
  return { server, sessions, scripts, requests, session, append };
}

async function runnerChecks() {
  const eve = fakeEve();
  await new Promise((resolve) => eve.server.listen(0, "127.0.0.1", resolve));
  const host = `http://127.0.0.1:${eve.server.address().port}`;
  const pushes = [];
  webpush.sendNotification = async (_device, payload) => {
    pushes.push(JSON.parse(payload));
    return { statusCode: 201 };
  };
  await addDevice(
    {
      endpoint: "https://push.example.test/send/runner",
      keys: { p256dh: "BNc".padEnd(87, "x"), auth: "auth-secret-1234" },
    },
    "Runner",
  );
  await writeEncrypted("telegram.enc", {
    botToken: "123456789:" + "A".repeat(35),
    webhookSecret: "s".repeat(64),
    botUsername: "aegentica_bot",
    owner: { userId: "42", chatId: "42" },
    updatedAt: new Date().toISOString(),
  });
  const telegram = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://api.telegram.org/")) return realFetch(url, init);
    telegram.push(JSON.parse(init.body).text);
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  const job = (title, lease) => ({
    id: `task-${title}`,
    title,
    prompt: "Check the weather.",
    cron: null,
    timezone: "UTC",
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: null,
    failures: 0,
    createdAt: "",
    lease,
  });
  const turn = (...events) => [
    event("turn.started", { turnId: "turn_0", sequence: 0 }),
    ...events,
    event("turn.completed", { turnId: "turn_0" }),
    event("session.waiting", {}),
  ];
  const said = (message, finishReason = "stop") =>
    event("message.completed", {
      message,
      finishReason,
      turnId: "turn_0",
      sequence: 0,
      stepIndex: 0,
    });
  const reset = () => {
    pushes.length = 0;
    telegram.length = 0;
  };
  const errors = console.error;
  console.error = () => {};
  try {
    // A failure after the session started (here: saving the chat) is reported, never rethrown.
    reset();
    eve.scripts.push((session) => eve.append(session, ...turn(said("Sunny."))));
    const unsaved = await runScheduledTask(job("Unsaved"), { host });
    assert.deepEqual(unsaved, { chatId: undefined, failed: true, waiting: false });
    assert.equal(pushes[0].url, "/tasks");
    assert.match(pushes[0].body, /^Couldn't save the result\. Sunny\./);
    assert.deepEqual(telegram, ["Unsaved\n\nSunny."], "the answer still reaches Telegram");
    process.env.EVE_CHAT_DB_PATH = join(directory, "chats.sqlite");

    // A normal run: the session id is recorded at once, the chat is saved compacted,
    // and narration before a tool call never becomes the notification.
    reset();
    const started = [];
    eve.scripts.push((session) =>
      eve.append(
        session,
        event("session.started", {}),
        ...turn(
          said("Let me look that up first…", "tool-calls"),
          event("action.result", {
            status: "completed",
            result: {
              kind: "tool-result",
              callId: "call_image",
              toolName: "generate_image",
              output: { images: [{ url: "/api/media/sun.png", alt: "Sun" }] },
            },
          }),
          event("message.appended", {
            messageDelta: "It is ",
            turnId: "turn_0",
            sequence: 0,
            stepIndex: 1,
          }),
          event("message.appended", {
            messageDelta: "sunny",
            turnId: "turn_0",
            sequence: 0,
            stepIndex: 1,
          }),
          event("message.appended", {
            messageDelta: ".",
            turnId: "turn_0",
            sequence: 0,
            stepIndex: 1,
          }),
          said("It is sunny."),
        ),
      ),
    );
    const done = await runScheduledTask(job("Weather"), {
      host,
      onStarted: (id) => started.push(id),
    });
    assert.equal(done.failed, false);
    assert.deepEqual(started, ["s2"]);
    const created = JSON.parse(eve.requests.findLast((r) => r.path === "/eve/v1/session").body);
    assert.equal(created.taskDeliveryPolicy, "cohort", "background results arrive in one report");
    assert.match(created.message, /<eve-empty-delivery\/>/, "the run knows how to stay quiet");
    assert.equal(pushes[0].body, "It is sunny.");
    assert.equal(pushes[0].url, `/chat/${done.chatId}`);
    assert.deepEqual(
      telegram,
      ["Weather\n\nIt is sunny.\n\nThe image is in the Ægentica app."],
      "the mirror says a picture is waiting in the app",
    );
    const chat = await getChatForUser(done.chatId, OPERATOR_PRINCIPAL_ID);
    const appended = chat.events.filter((e) => e.type === "message.appended");
    assert.deepEqual(
      appended.map((e) => e.data.messageDelta),
      ["It is sunny."],
      "the saved chat joins streamed fragments like the web chat",
    );
    assert.equal(chat.events.length, eve.sessions.get("s2").events.length - 2);

    // Background work: the run follows the session until eve reports the task.
    reset();
    eve.scripts.push((session) => {
      eve.append(
        session,
        ...turn(
          event("action.result", {
            result: {
              kind: "tool-result",
              callId: "call_1",
              toolName: "background_review",
              output: { status: "working", taskId: "task_1" },
            },
            status: "completed",
          }),
          said("I started a review in the background."),
        ),
      );
      setTimeout(
        () =>
          eve.append(
            session,
            ...turn(
              report("Background task task_1 (background_review) is completed.\n\nResult:\nok"),
              said("The review found two problems."),
            ),
          ),
        300,
      );
    });
    const background = await runScheduledTask(job("Review"), { host });
    assert.equal(background.failed, false);
    assert.equal(pushes[0].body, "The review found two problems.");
    assert.deepEqual(telegram, ["Review\n\nThe review found two problems."]);

    // A check with nothing to report is saved but sends nothing.
    reset();
    eve.scripts.push((session) => eve.append(session, ...turn(said(null))));
    const quiet = await runScheduledTask(job("Quiet"), { host });
    assert.deepEqual(
      { ...quiet, chatId: typeof quiet.chatId },
      {
        chatId: "string",
        failed: false,
        waiting: false,
      },
    );
    assert.deepEqual([pushes, telegram], [[], []]);

    // Timing out stops the session and its tasks and reports the timeout, not the narration.
    reset();
    eve.scripts.push((session) =>
      eve.append(
        session,
        event("turn.started", { turnId: "turn_0", sequence: 0 }),
        said("Let me look that up first…", "tool-calls"),
      ),
    );
    const slow = await runScheduledTask(job("Slow"), { host, timeoutMs: 400 });
    assert.equal(slow.failed, true);
    assert.equal(pushes[0].body, "Couldn't finish. It ran longer than 10 minutes and was stopped.");
    const cancel = eve.requests.findLast((r) => r.path.endsWith("/cancel"));
    assert.deepEqual(JSON.parse(cancel.body), { tasks: true });
    assert.equal((await getChatForUser(slow.chatId, OPERATOR_PRINCIPAL_ID)).events.length, 2);

    // Losing the stream while waiting for background work saves what the turn produced.
    reset();
    eve.scripts.push((session) => {
      session.failSnapshots = true;
      eve.append(
        session,
        ...turn(
          event("action.result", {
            result: {
              kind: "tool-result",
              callId: "call_2",
              toolName: "agent",
              output: { status: "working", taskId: "task_2", agentId: "agent_2" },
            },
            status: "completed",
          }),
          said("Started."),
        ),
      );
    });
    const lost = await runScheduledTask(job("Lost"), { host });
    assert.equal(lost.failed, true);
    assert.equal(typeof lost.chatId, "string");
    assert.equal(
      pushes[0].body,
      "Couldn't finish. The connection to the agent was lost, so the run was stopped.",
    );

    // After a restart the re-claimed run attaches to its session instead of starting another.
    reset();
    const running = eve.session("s-restart");
    eve.append(running, event("turn.started", { turnId: "turn_0", sequence: 0 }));
    setTimeout(
      () =>
        eve.append(
          running,
          said("Resumed answer."),
          event("turn.completed", {}),
          event("session.waiting", {}),
        ),
      200,
    );
    const posts = eve.requests.filter((r) => r.path === "/eve/v1/session").length;
    const resumed = await runScheduledTask(
      job("Restarted", { token: "t", until: 0, sessionId: "s-restart" }),
      { host },
    );
    assert.equal(eve.requests.filter((r) => r.path === "/eve/v1/session").length, posts);
    assert.equal(resumed.failed, false);
    assert.equal(pushes[0].body, "Resumed answer.");

    // Only a session that could not be started is thrown back for a retry.
    await assert.rejects(runScheduledTask(job("Down"), { host: "http://127.0.0.1:9" }));
  } finally {
    console.error = errors;
    eve.server.closeAllConnections();
    eve.server.close();
  }
}
