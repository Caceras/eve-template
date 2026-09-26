import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { registerHooks } from "node:module";
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-settings-"));
// The webhook URL comes from the request origin; a developer shell must not override it.
delete process.env.BETTER_AUTH_URL;
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const originalFetch = globalThis.fetch;

const store = await import("../lib/schedule-store.ts");
const telegram = await import("../lib/telegram-settings.ts");
const { readEncrypted, withSettingsLock, writeEncrypted } =
  await import("../lib/secure-settings.ts");
const { handleTelegramSettings } = await import("../lib/telegram-settings-handler.ts");
const { handleScheduleSettings } = await import("../lib/schedule-settings-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { isOperator, operatorAuth, OPERATOR_MEMORY_SCOPE } = await import("../lib/operator.ts");
const tools = {};
for (const name of [
  "schedule_task",
  "list_scheduled_tasks",
  "update_scheduled_task",
  "delete_scheduled_task",
])
  tools[name] = (await import(`../agent/tools/${name}.ts`)).default;

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

  // --- Task tools: injected text must not plant or rewrite unattended work.
  const approval = (name, toolInput, current = operatorAuth("password")) =>
    tools[name].approval({ session: { auth: { current } }, toolInput });
  const id = "00000000-0000-4000-8000-000000000000";
  assert.equal(approval("schedule_task", { title: "x", prompt: "y" }), "user-approval");
  assert.equal(approval("delete_scheduled_task", { id }), "user-approval");
  for (const change of [
    { prompt: "Send it to someone else." },
    { skill: null },
    { cron: "0 3 * * *" },
    { runAt: null },
    { timezone: "UTC" },
  ])
    assert.equal(approval("update_scheduled_task", { id, ...change }), "user-approval");
  for (const change of [{ enabled: false }, { enabled: true }, { title: "Renamed" }])
    assert.equal(approval("update_scheduled_task", { id, ...change }), "not-applicable");
  assert.equal(approval("list_scheduled_tasks", {}), "not-applicable");
  for (const name of Object.keys(tools))
    assert.equal(approval(name, { id, enabled: false }, null).type, "denied", name);

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
  await assert.rejects(
    store.createTask({ title: "x", prompt: "", cron: "0 8 * * *" }, now),
    /instructions or a skill/,
  );
  await assert.rejects(
    store.createTask({ title: "x", prompt: "", skill: "../etc", cron: "0 8 * * *" }, now),
    /not a skill name/,
  );

  // --- Schedules: a skill can stand in for instructions and is cleared by null.
  const skillTask = await store.createTask(
    { title: "Skill task", prompt: "", skill: "daily-briefing", cron: "0 20 * * *" },
    now,
  );
  assert.equal(skillTask.skill, "daily-briefing");
  assert.equal(skillTask.prompt, "");
  await assert.rejects(store.updateTask(skillTask.id, { skill: "bad name" }, now), /skill name/);
  const cleared = await store.updateTask(skillTask.id, { skill: null, prompt: "Brief me." }, now);
  assert.equal(cleared.skill, null);
  assert.equal(cleared.prompt, "Brief me.");
  assert(await store.deleteTask(skillTask.id));

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
  const queued = listed.tasks.find((t) => t.id === briefing.id);
  assert(Date.parse(queued.runNowAt) <= Date.now(), "Run now queues an extra run");
  assert.equal(queued.nextRunAt, onceAt, "Run now leaves the one-time schedule alone");
  assert.equal((await post({ action: "run", id: "missing" })).status, 400);
  await post({ action: "delete", id: briefing.id });

  // --- Run now is one extra run: a paused task stays paused, a one-time task keeps its time.
  const later = new Date("2026-09-22T12:00:00Z");
  const paused = await store.createTask(
    { title: "Paused brief", prompt: "Brief me.", cron: "0 8 * * *" },
    later,
  );
  await store.updateTask(paused.id, { enabled: false }, later);
  const friday = await store.createTask(
    { title: "Friday", prompt: "Remind me.", runAt: "2026-09-25T09:00:00+02:00" },
    later,
  );
  await store.runTaskNow(paused.id, later);
  await store.runTaskNow(friday.id, later);
  const manualJobs = await store.claimDue({ now: later, limit: 10, leaseForMs: 300_000 });
  assert.deepEqual(manualJobs.map((t) => t.title).sort(), ["Friday", "Paused brief"]);
  for (const job of manualJobs) await store.completeRun(job, { chatId: `run-${job.id}` }, later);
  let rows = await store.listTasks();
  const pausedRow = rows.find((t) => t.id === paused.id);
  const fridayRow = rows.find((t) => t.id === friday.id);
  assert.equal(pausedRow.enabled, false, "a paused task stays paused after Run now");
  assert.equal(pausedRow.lastChatId, `run-${paused.id}`);
  assert.equal(pausedRow.runNowAt, null);
  assert.equal(fridayRow.enabled, true, "a one-time task still runs at its own time");
  assert.equal(fridayRow.nextRunAt, "2026-09-25T07:00:00.000Z");
  assert.deepEqual(await store.claimDue({ now: later, limit: 10, leaseForMs: 300_000 }), []);
  // A failed hand-off of Run now retries, then gives up without touching the schedule.
  await store.runTaskNow(paused.id, later);
  let retryAt = later;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const [job] = await store.claimDue({ now: retryAt, limit: 1, leaseForMs: 300_000 });
    assert.equal(job.id, paused.id);
    await store.releaseRun(job, retryAt);
    const row = (await store.listTasks()).find((t) => t.id === paused.id);
    assert.equal(row.enabled, false);
    if (attempt < 3) retryAt = new Date(Date.parse(row.runNowAt) + 1000);
    else assert.equal(row.runNowAt, null, "gives up after three attempts");
  }
  assert(!("runNowFailures" in rows[0]), "retry counters never leave the store");

  // Rescheduling a finished one-time task schedules it again; an overdue resume says what to do.
  const [fridayJob] = await store.claimDue({
    now: new Date("2026-09-25T07:00:10Z"),
    limit: 10,
    leaseForMs: 300_000,
  });
  await store.completeRun(fridayJob, {}, new Date("2026-09-25T07:00:20Z"));
  const afterFriday = new Date("2026-09-25T08:00:00Z");
  const again = await store.updateTask(
    friday.id,
    { runAt: "2026-10-02T09:00:00+02:00" },
    afterFriday,
  );
  assert.equal(again.enabled, true, "a finished task with a new time is active again");
  await store.updateTask(friday.id, { enabled: false }, afterFriday);
  await assert.rejects(
    store.updateTask(friday.id, { enabled: true }, new Date("2026-10-03T08:00:00Z")),
    /Edit the task to pick a new time/,
  );

  // The 15-minute floor holds for every upcoming run, and cron has exactly five fields.
  await assert.rejects(
    store.createTask(
      { title: "Sneaky", prompt: "x", cron: "0,10 9 * * 1" },
      new Date("2026-09-21T07:05:00Z"),
    ),
    /every 15 minutes/,
  );
  await assert.rejects(
    store.createTask({ title: "Seconds", prompt: "x", cron: "0 0 8 * * *" }, later),
    /5-field/,
  );
  const nickname = await store.createTask(
    { title: "Nickname", prompt: "x", cron: "@daily" },
    later,
  );
  for (const id of [paused.id, friday.id, nickname.id]) await store.deleteTask(id);

  // Spring forward: croner lists 01:00 UTC twice on 2027-03-28 in Stockholm. That
  // is one run, not a 0 ms gap, so frequent schedules still save before the change.
  const springCrons = ["0 * * * *", "@hourly", "30 * * * *", "*/15 * * * *", "*/20 * * * *"];
  for (const cron of springCrons) {
    const task = await store.createTask(
      { title: `Spring ${cron}`, prompt: "x", cron },
      new Date("2027-03-27T20:00:00Z"),
    );
    await store.deleteTask(task.id);
  }
  const twiceNightly = await store.createTask(
    { title: "Two at night", prompt: "x", cron: "0 2,3 * * *" },
    new Date("2027-03-01T00:00:00Z"),
  );
  await store.deleteTask(twiceNightly.id);
  const hourly = await store.createTask(
    { title: "Hourly", prompt: "x", cron: "0 * * * *" },
    new Date("2027-03-01T00:00:00Z"),
  );
  await store.updateTask(hourly.id, { enabled: false }, new Date("2027-03-02T00:00:00Z"));
  const springEve = new Date("2027-03-26T12:00:00Z");
  assert.equal((await store.updateTask(hourly.id, { enabled: true }, springEve)).enabled, true);
  await store.updateTask(hourly.id, { title: "Hourly check", cron: "0 * * * *" }, springEve);
  // The repeated instant still runs once: the next slot after it is an hour later.
  await store.updateTask(hourly.id, { cron: "0 * * * *" }, new Date("2027-03-28T00:30:00Z"));
  const [springJob] = await store.claimDue({
    now: new Date("2027-03-28T01:00:10Z"),
    limit: 10,
    leaseForMs: 300_000,
  });
  assert.equal(springJob.nextRunAt, "2027-03-28T01:00:00.000Z");
  await store.completeRun(springJob, {}, new Date("2027-03-28T01:00:20Z"));
  assert.equal(
    (await store.listTasks()).find((t) => t.id === hourly.id).nextRunAt,
    "2027-03-28T02:00:00.000Z",
  );
  await store.deleteTask(hourly.id);

  // Cron is stored trimmed, and an edit cannot leave a task with neither instructions nor skill.
  const spaced = await store.createTask(
    { title: "Spaced", prompt: "", skill: "daily-briefing", cron: "  0 8 * * *  " },
    later,
  );
  assert.equal(spaced.cron, "0 8 * * *");
  assert.equal(
    (await store.updateTask(spaced.id, { cron: " 0 9 * * * " }, later)).cron,
    "0 9 * * *",
  );
  await assert.rejects(
    store.updateTask(spaced.id, { skill: null, prompt: "" }, later),
    /instructions or a skill/,
  );
  assert.equal((await store.listTasks()).find((t) => t.id === spaced.id).skill, "daily-briefing");
  await store.deleteTask(spaced.id);

  // Run now pressed while a run is in flight is kept for another run.
  const inFlight = await store.createTask(
    { title: "In flight", prompt: "x", cron: "0 8 * * *" },
    new Date("2026-09-26T00:00:00Z"),
  );
  const [flightJob] = await store.claimDue({
    now: new Date("2026-09-26T06:00:30Z"),
    limit: 10,
    leaseForMs: 900_000,
  });
  await store.runTaskNow(inFlight.id, new Date("2026-09-26T06:03:00Z"));
  await store.completeRun(flightJob, { chatId: "c1" }, new Date("2026-09-26T06:05:00Z"));
  assert.equal(
    (await store.listTasks()).find((t) => t.id === inFlight.id).runNowAt,
    "2026-09-26T06:03:00.000Z",
  );
  const [extra] = await store.claimDue({
    now: new Date("2026-09-26T06:06:00Z"),
    limit: 10,
    leaseForMs: 900_000,
  });
  assert.equal(extra.id, inFlight.id, "the Run now pressed during the run runs next");
  await store.completeRun(extra, { chatId: "c2" }, new Date("2026-09-26T06:08:00Z"));
  const afterExtra = (await store.listTasks()).find((t) => t.id === inFlight.id);
  assert.equal(afterExtra.runNowAt, null);
  assert.equal(afterExtra.nextRunAt, "2026-09-27T06:00:00.000Z", "the schedule is unchanged");
  await store.deleteTask(inFlight.id);

  // A restart mid-run: the lease keeps the run's eve session, and once it expires the
  // same run is claimed again (due or not) so the runner attaches instead of re-running.
  const restart = await store.createTask(
    { title: "Restart", prompt: "x", cron: "0 9 * * *" },
    new Date("2026-09-26T00:00:00Z"),
  );
  const [beforeRestart] = await store.claimDue({
    now: new Date("2026-09-26T07:00:30Z"),
    limit: 10,
    leaseForMs: 900_000,
  });
  await store.recordRunSession(beforeRestart, "session-1");
  await store.recordRunSession({ ...beforeRestart, lease: { token: "stale", until: 0 } }, "other");
  await store.updateTask(restart.id, { enabled: false }, new Date("2026-09-26T07:05:00Z"));
  assert.deepEqual(
    await store.claimDue({ now: new Date("2026-09-26T07:10:00Z"), limit: 10, leaseForMs: 900_000 }),
    [],
    "a live lease is never claimed twice",
  );
  const [afterRestart] = await store.claimDue({
    now: new Date("2026-09-26T07:16:00Z"),
    limit: 10,
    leaseForMs: 900_000,
  });
  assert.equal(afterRestart.id, restart.id);
  assert.equal(afterRestart.lease.sessionId, "session-1");
  assert.notEqual(afterRestart.lease.token, beforeRestart.lease.token);
  assert.equal(afterRestart.lease.claimedAt, beforeRestart.lease.claimedAt);
  await store.completeRun(beforeRestart, { chatId: "stale" }, new Date("2026-09-26T07:17:00Z"));
  await store.completeRun(afterRestart, { chatId: "resumed" }, new Date("2026-09-26T07:17:00Z"));
  const restarted = (await store.listTasks()).find((t) => t.id === restart.id);
  assert.equal(restarted.lastChatId, "resumed");
  assert.equal(restarted.nextRunAt, "2026-09-27T07:00:00.000Z");
  assert.equal(restarted.enabled, false, "pausing during the run is kept");
  assert.deepEqual(
    await store.claimDue({ now: new Date("2026-09-26T08:00:00Z"), limit: 10, leaseForMs: 900_000 }),
    [],
  );
  await store.deleteTask(restart.id);

  // A one-time task given a new time during its own run keeps that time.
  const moved = await store.createTask(
    { title: "Moved", prompt: "x", runAt: "2026-09-27T08:00:00+02:00" },
    new Date("2026-09-26T00:00:00Z"),
  );
  const [movedJob] = await store.claimDue({
    now: new Date("2026-09-27T06:00:30Z"),
    limit: 10,
    leaseForMs: 900_000,
  });
  await store.updateTask(
    moved.id,
    { runAt: "2026-09-28T08:00:00+02:00" },
    new Date("2026-09-27T06:02:00Z"),
  );
  await store.completeRun(movedJob, { chatId: "c3" }, new Date("2026-09-27T06:05:00Z"));
  const movedRow = (await store.listTasks()).find((t) => t.id === moved.id);
  assert.equal(movedRow.enabled, true, "a rescheduled one-time task is not finished");
  assert.equal(movedRow.nextRunAt, "2026-09-28T06:00:00.000Z");
  assert.equal(movedRow.lastChatId, "c3");
  await store.deleteTask(moved.id);

  // Paused tasks count toward a stored cap, so the file never outgrows its read limit,
  // and a dispatcher tick with nothing due leaves the file untouched.
  const { stat } = await import("node:fs/promises");
  const bulk = [];
  for (let index = 0; index < 60; index++) {
    const task = await store.createTask(
      { title: `Bulk ${index}`, prompt: "x".repeat(3900), cron: "0 9 * * 1" },
      later,
    );
    await store.updateTask(task.id, { enabled: false }, later);
    bulk.push(task.id);
  }
  const file = join(directory, "schedules.enc");
  const before = (await stat(file)).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await store.claimDue({ now: later, limit: 5, leaseForMs: 60_000 }), []);
  assert.equal((await stat(file)).mtimeMs, before, "an idle tick does not rewrite the file");
  const listedCount = (await store.listTasks()).length;
  assert(listedCount >= 60);
  for (const id of bulk) await store.deleteTask(id);
  rows = await store.listTasks();
  assert(!rows.some((t) => [paused.id, friday.id].includes(t.id)));

  // --- Telegram connect: token format, getMe + setWebhook, encrypted storage.
  const token = "123456789:" + "A".repeat(35);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").at(-1);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? {});
    calls.push({ url: String(url), method, body });
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

  // --- The Telegram channel: eve's webhook route with the app's hooks. eve logs the
  // forged webhook and the dropped files below as warnings.
  process.env.EVE_LOG_LEVEL = "error";
  const { default: channel } = await import("../agent/channels/telegram.ts");
  const webhook = channel.routes.find((route) => route.path === "/eve/v1/telegram").handler;
  const { webhookSecret } = await telegram.readTelegram();
  const deliveries = [];
  const deliver = async (update, secret = webhookSecret) => {
    const pending = [];
    const response = await webhook(
      new Request("https://app.test/eve/v1/telegram", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
        body: JSON.stringify(update),
      }),
      {
        // Records what eve would hand to the session: respond() or a delivered message.
        from: (token) =>
          new Proxy({}, { get: (_, key) => async () => deliveries.push({ token, key }) }),
        resolveSession: async () => undefined,
        waitUntil: (work) => pending.push(work),
      },
    );
    await Promise.all(pending);
    return response.status;
  };
  const person = (id) => ({ id: Number(id), is_bot: false, first_name: "T" });
  const press = (userId) => ({
    update_id: 1,
    callback_query: {
      id: `cq-${userId}`,
      from: person(userId),
      data: "eve:1",
      message: { message_id: 10, chat: { id: Number(userId), type: "private" } },
    },
  });
  const say = (userId, fields) => ({
    update_id: 2,
    message: {
      message_id: 11,
      chat: { id: Number(userId), type: "private" },
      from: person(userId),
      ...fields,
    },
  });
  const sent = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.body.text);
  assert.equal(await deliver(press("42"), "0".repeat(64)), 401, "a forged webhook is rejected");
  // Approval and question buttons answer only for the linked account.
  deliveries.length = 0;
  assert.equal(await deliver(press("7")), 200);
  assert.deepEqual(deliveries, [], "an unlinked account's button press is ignored");
  assert.equal(await deliver(press("42")), 200);
  assert.deepEqual(
    deliveries.map((d) => d.key),
    ["respond"],
  );
  // Content the agent cannot read gets one plain notice instead of an empty turn.
  const unsupported = [
    { voice: { file_id: "voice" } },
    { sticker: { file_id: "sticker" } },
    { document: { file_id: "zip", file_name: "a.zip", mime_type: "application/zip" } },
    {
      document: {
        file_id: "big",
        file_name: "a.pdf",
        mime_type: "application/pdf",
        file_size: 11e6,
      },
    },
  ];
  for (const fields of unsupported) {
    deliveries.length = 0;
    calls.length = 0;
    await deliver(say("42", fields));
    assert.deepEqual(deliveries, [], JSON.stringify(fields));
    assert.equal(sent().length, 1);
    assert.match(sent()[0], /text, photos, PDFs and text files/);
  }
  for (const fields of [
    { text: "Hello" },
    { caption: "What is this?", voice: { file_id: "voice" } },
    { document: { file_id: "pdf", file_name: "a.pdf", mime_type: "application/pdf" } },
    { photo: [{ file_id: "photo", width: 10, height: 10 }] },
  ]) {
    deliveries.length = 0;
    calls.length = 0;
    await deliver(say("42", fields));
    assert.equal(deliveries.length, 1, JSON.stringify(fields));
    assert.deepEqual(sent(), []);
  }
  calls.length = 0;
  deliveries.length = 0;
  await deliver(say("7", { voice: { file_id: "voice" } }));
  assert.deepEqual([deliveries, sent()], [[], []], "strangers get no notice");

  // Pictures generate_image saved are uploaded to the chat as photos.
  assert.equal(typeof channel.adapter["action.result"], "function");
  const { saveMedia } = await import("../lib/media-store.ts");
  const { generatedImageUrls, sendTelegramPhotos } = await import("../lib/generated-images.ts");
  const picture = await saveMedia(Buffer.from("png-bytes"), "image/png");
  const imageResult = (toolName, status = "completed") => ({
    status,
    result: {
      kind: "tool-result",
      callId: "c",
      toolName,
      output: { images: [{ url: picture.url }] },
    },
  });
  assert.deepEqual(generatedImageUrls(imageResult("generate_image")), [picture.url]);
  assert.deepEqual(generatedImageUrls(imageResult("get_weather")), []);
  assert.deepEqual(generatedImageUrls(imageResult("generate_image", "failed")), []);
  calls.length = 0;
  await sendTelegramPhotos(token, "42", [picture.url]);
  const photo = calls.find((c) => c.method === "sendPhoto");
  assert.equal(photo.body.get("chat_id"), "42");
  assert.equal(photo.body.get("photo").type, "image/png");
  assert.equal(await photo.body.get("photo").text(), "png-bytes");

  // Disconnect removes the webhook and the stored token, after an update that
  // holds the settings lock, so that update cannot write the bot back.
  let finishUpdate;
  const update = withSettingsLock("telegram.enc", async () => {
    const current = await readEncrypted("telegram.enc");
    await new Promise((resolve) => (finishUpdate = resolve));
    await writeEncrypted("telegram.enc", { ...current, updatedAt: new Date().toISOString() });
  });
  while (!finishUpdate) await new Promise((resolve) => setTimeout(resolve, 5));
  const disconnecting = handleTelegramSettings(
    request("/api/settings/telegram", { action: "disconnect" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  finishUpdate();
  await update;
  assert.equal((await disconnecting).status, 200);
  assert(calls.some((c) => c.method === "deleteWebhook"));
  assert.equal((await telegram.telegramStatus()).connected, false);

  console.log(
    "PASS: shared operator identity and memory scope, task tools confirm creating, rewriting and deleting, schedule validation, Stockholm cron math and spring clock change, exclusive leases, completion/retry/give-up, restart re-claims the started session, Run now and new times during a run, Tasks API create/edit/run now/pause/resume/delete with auth and CSRF, Telegram connect/webhook/secret, pairing brute-force limit and single use, reconnect keeps link, test message, disconnect under the settings lock",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
