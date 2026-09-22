import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { registerHooks } from "node:module";
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-settings-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const originalFetch = globalThis.fetch;

const store = await import("../lib/schedule-store.ts");
const telegram = await import("../lib/telegram-settings.ts");
const { handleTelegramSettings } = await import("../lib/telegram-settings-handler.ts");
const { handleScheduleSettings } = await import("../lib/schedule-settings-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { isOperator, operatorAuth, OPERATOR_MEMORY_SCOPE } = await import("../lib/operator.ts");

try {
  // --- Operator identity: web, Telegram and schedules share one memory scope.
  const web = operatorAuth("password");
  assert.equal(
    JSON.stringify([web.principalType, web.authenticator, web.issuer, web.principalId]),
    OPERATOR_MEMORY_SCOPE,
    "web operator keeps its pre-existing memory scope",
  );
  assert(isOperator(operatorAuth("telegram")) && isOperator(operatorAuth("schedule")));
  assert(!isOperator({ ...web, attributes: {} }));
  assert(!isOperator(null));

  // --- Schedules: validation.
  const now = new Date("2026-09-22T20:00:00Z");
  await assert.rejects(store.createTask({ title: "x", prompt: "y", cron: "nope" }, now), /cron/);
  await assert.rejects(
    store.createTask({ title: "x", prompt: "y", cron: "*/5 * * * *" }, now),
    /15 minutes/,
  );
  await assert.rejects(
    store.createTask({ title: "x", prompt: "y", cron: "0 8 * * *", timezone: "Mars/Base" }, now),
    /time zone/,
  );
  await assert.rejects(
    store.createTask({ title: "x", prompt: "y", runAt: "2026-09-23T08:00:00" }, now),
    /offset/,
  );
  await assert.rejects(
    store.createTask({ title: "x", prompt: "y", runAt: "2026-09-20T08:00:00+02:00" }, now),
    /passed/,
  );
  await assert.rejects(store.createTask({ title: "x", prompt: "y" }, now), /cron expression or/);

  // --- Schedules: recurring in Stockholm time, one-time, lease exclusivity.
  const daily = await store.createTask(
    { title: "Morning brief", prompt: "Brief me.", cron: "0 8 * * 1-5" },
    now,
  );
  assert.equal(daily.timezone, "Europe/Stockholm");
  assert.equal(daily.nextRunAt, "2026-09-23T06:00:00.000Z", "08:00 CEST is 06:00 UTC");
  const once = await store.createTask(
    { title: "Call Anna", prompt: "Remind me to call Anna.", runAt: "2026-09-22T22:30:00+02:00" },
    now,
  );
  assert.equal(once.cron, null);

  const at = new Date("2026-09-23T06:00:30Z");
  const [first, second] = await Promise.all([
    store.claimDue({ now: at, limit: 10, leaseForMs: 300_000 }),
    store.claimDue({ now: at, limit: 10, leaseForMs: 300_000 }),
  ]);
  assert.equal(first.length + second.length, 2, "each due task is claimed exactly once");
  const claimed = [...first, ...second];
  assert.deepEqual(claimed.map((t) => t.title).sort(), ["Call Anna", "Morning brief"]);
  assert.deepEqual(await store.claimDue({ now: at, limit: 10, leaseForMs: 300_000 }), []);

  const claimedDaily = claimed.find((t) => t.id === daily.id);
  const claimedOnce = claimed.find((t) => t.id === once.id);
  await store.completeRun(claimedDaily, { chatId: "chat-1" }, at);
  await store.completeRun(claimedOnce, { chatId: "chat-2", failed: true }, at);
  let tasks = await store.listTasks();
  assert.equal(tasks.find((t) => t.id === daily.id).nextRunAt, "2026-09-24T06:00:00.000Z");
  assert.equal(tasks.find((t) => t.id === daily.id).lastChatId, "chat-1", "result chat recorded");
  assert.equal(tasks.find((t) => t.id === once.id).enabled, false, "one-time task finishes");
  assert.equal(tasks.find((t) => t.id === once.id).lastStatus, "failed", "failed turn is shown");
  assert.equal(tasks.find((t) => t.id === once.id).failures, 0, "failed turn is not retried");
  assert(!("lease" in tasks[0]), "leases never leave the store");

  // A stale completion (old lease token) is ignored.
  await store.completeRun({ ...claimedDaily, lease: { token: "old", until: 0 } }, {}, at);

  // Failures retry after 5 minutes, then skip to the next slot after 3 attempts.
  let failAt = new Date("2026-09-24T06:00:10Z");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const [job] = await store.claimDue({ now: failAt, limit: 1, leaseForMs: 300_000 });
    assert.equal(job.id, daily.id);
    await store.releaseRun(job, failAt);
    const row = (await store.listTasks()).find((t) => t.id === daily.id);
    if (attempt < 3) {
      assert.equal(Date.parse(row.nextRunAt) - failAt.getTime(), 300_000);
      failAt = new Date(Date.parse(row.nextRunAt) + 1000);
    } else assert.equal(row.nextRunAt, "2026-09-25T06:00:00.000Z");
  }

  // Pause and resume through the Settings API.
  const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
  const request = (path, body, options = {}) =>
    new Request(`https://app.test${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        host: "app.test",
        origin: options.origin ?? "https://app.test",
        ...(options.anonymous ? {} : { cookie }),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (
      await handleScheduleSettings(
        request("/api/settings/schedules", undefined, { anonymous: true }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleScheduleSettings(
        request(
          "/api/settings/schedules",
          { action: "delete", id: daily.id },
          { origin: "https://evil.test" },
        ),
      )
    ).status,
    403,
  );
  let listed = await (
    await handleScheduleSettings(
      request("/api/settings/schedules", { action: "pause", id: daily.id }),
    )
  ).json();
  assert.equal(listed.tasks.find((t) => t.id === daily.id).enabled, false);
  listed = await (
    await handleScheduleSettings(
      request("/api/settings/schedules", { action: "resume", id: daily.id }),
    )
  ).json();
  assert.equal(listed.tasks.find((t) => t.id === daily.id).enabled, true);
  listed = await (
    await handleScheduleSettings(
      request("/api/settings/schedules", { action: "delete", id: daily.id }),
    )
  ).json();
  assert(!listed.tasks.some((t) => t.id === daily.id));

  // --- Tasks page: create, edit, run now, and schedule validation errors.
  const post = async (body) => handleScheduleSettings(request("/api/settings/schedules", body));
  listed = await (
    await post({
      action: "create",
      title: "Briefing",
      prompt: "Summarise the news. ".repeat(150),
      cron: "0 8 * * 1-5",
      runAt: null,
      timezone: "Europe/Stockholm",
    })
  ).json();
  const briefing = listed.tasks.find((t) => t.title === "Briefing");
  assert.equal(briefing.cron, "0 8 * * 1-5");
  assert.equal(
    (await post({ action: "create", title: "Bad", prompt: "x", cron: "* * * * *" })).status,
    400,
  );
  const onceAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
  listed = await (
    await post({ action: "update", id: briefing.id, title: "Morning", cron: null, runAt: onceAt })
  ).json();
  const edited = listed.tasks.find((t) => t.id === briefing.id);
  assert.equal(edited.title, "Morning");
  assert.equal(edited.cron, null);
  assert.equal(edited.nextRunAt, onceAt);
  listed = await (await post({ action: "run", id: briefing.id })).json();
  assert(Date.parse(listed.tasks.find((t) => t.id === briefing.id).nextRunAt) <= Date.now());
  assert.equal((await post({ action: "run", id: "missing" })).status, 400);
  await post({ action: "delete", id: briefing.id });

  // --- Telegram connect: token format, getMe + setWebhook, encrypted storage.
  const token = "123456789:" + "A".repeat(35);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1);
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(init.body) : {} });
    if (method === "getMe")
      return Response.json({ ok: true, result: { username: "aegentica_bot" } });
    return Response.json({ ok: true, result: true });
  };
  assert.equal(
    (
      await handleTelegramSettings(
        request("/api/settings/telegram", undefined, { anonymous: true }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleTelegramSettings(
        request("/api/settings/telegram", { action: "connect", botToken: "nope" }),
      )
    ).status,
    400,
  );
  const connected = await (
    await handleTelegramSettings(
      request("/api/settings/telegram", { action: "connect", botToken: token }),
    )
  ).json();
  assert.equal(connected.botUsername, "aegentica_bot");
  assert.equal(connected.linked, false);
  const hook = calls.find((c) => c.method === "setWebhook");
  assert.equal(hook.body.url, "https://app.test/eve/v1/telegram");
  assert.match(hook.body.secret_token, /^[0-9a-f]{64}$/);
  assert(!JSON.stringify(connected).includes(token), "status never returns the token");

  // --- Pairing: wrong codes burn the code after five tries, the right one links once.
  let status = await (
    await handleTelegramSettings(request("/api/settings/telegram", { action: "pair" }))
  ).json();
  assert.match(status.pairingCode, /^\d{6}$/);
  const wrong = status.pairingCode === "000000" ? "111111" : "000000";
  const owner = { userId: "42", chatId: "42", username: "riki" };
  for (let i = 0; i < 5; i++) assert.equal(await telegram.completePairing(wrong, owner), false);
  assert.equal(await telegram.completePairing(status.pairingCode, owner), false, "code burned");
  status = await (
    await handleTelegramSettings(request("/api/settings/telegram", { action: "pair" }))
  ).json();
  assert.equal(await telegram.completePairing(status.pairingCode, owner), true);
  assert.equal(await telegram.completePairing(status.pairingCode, owner), false, "single use");
  status = await telegram.telegramStatus();
  assert.equal(status.linked, true);
  assert.equal(status.ownerUsername, "riki");

  // Reconnecting the same bot keeps the link; test message goes to the owner chat.
  await telegram.connectTelegram(token, "https://app.test");
  assert.equal((await telegram.telegramStatus()).linked, true);
  calls.length = 0;
  assert.equal(
    (await handleTelegramSettings(request("/api/settings/telegram", { action: "test" }))).status,
    200,
  );
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].body.chat_id, "42");

  // Disconnect removes the webhook and the stored token.
  await handleTelegramSettings(request("/api/settings/telegram", { action: "disconnect" }));
  assert(calls.some((c) => c.method === "deleteWebhook"));
  assert.equal((await telegram.telegramStatus()).connected, false);

  console.log(
    "PASS: shared operator identity and memory scope, schedule validation, Stockholm cron math, exclusive leases, completion/retry/give-up, Tasks API create/edit/run now/pause/resume/delete with auth and CSRF, Telegram connect/webhook/secret, pairing brute-force limit and single use, reconnect keeps link, test message, disconnect",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
