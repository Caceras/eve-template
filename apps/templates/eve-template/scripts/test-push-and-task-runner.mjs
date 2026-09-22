import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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

const { handleNotificationSettings } = await import("../lib/notification-settings-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { INTERNAL_HEADER, internalToken, isInternalRequest } =
  await import("../lib/internal-auth.ts");
const { finalAnswer } = await import("../lib/task-runner.ts");

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
  const event = (type, data) => ({ type, data, meta: {} });
  assert.equal(
    finalAnswer([
      event("message.completed", { message: "draft" }),
      event("message.completed", { message: "## Weather\n**Sunny**, 18°C" }),
      event("session.waiting", {}),
    ]),
    "Weather Sunny, 18°C",
  );
  assert.equal(finalAnswer([event("session.failed", {})]), null);
  console.log(
    "PASS: notification settings auth and CSRF, stable encrypted VAPID key, subscription validation/dedupe/removal, internal scheduler token, result preview",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
