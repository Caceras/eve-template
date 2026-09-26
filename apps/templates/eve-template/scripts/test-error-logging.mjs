// Unexpected failures reach the server log, without request bodies or device credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-errors-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const { handleOperatorSettings } = await import("../lib/settings-api.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const push = await import("../lib/push-notifications.ts");
const { default: webpush } = await import("web-push");

const logged = [];
const originalError = console.error;
const originalSend = webpush.sendNotification;
console.error = (...parts) => logged.push(parts.join(" "));
try {
  const secret = "sk-fixture-" + randomBytes(8).toString("hex");
  const response = await handleOperatorSettings(
    new Request("https://app.test/api/settings/fixture", {
      method: "POST",
      headers: {
        host: "app.test",
        origin: "https://app.test",
        "content-type": "application/json",
        cookie: `eve_chat_session=${createPasswordSessionToken()}`,
      },
      body: JSON.stringify({ apiKey: secret }),
    }),
    {
      read: async () => Response.json({}),
      write: async () => {
        throw new Error("fixture storage failure");
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(logged.length, 1);
  assert.match(
    logged[0],
    /\[settings\] POST \/api\/settings\/fixture failed:.*fixture storage failure/s,
  );
  assert.equal(logged[0].includes(secret), false, "the request body is never logged");

  // A push service error is logged by host; a gone device is removed quietly.
  const capability = randomBytes(16).toString("hex");
  const subscription = (path) => ({
    endpoint: `https://push.fixture.test/${path}`,
    keys: { p256dh: "fixture-p256dh", auth: "fixture-auth" },
  });
  await push.addDevice(subscription(capability), "Failing phone");
  await push.addDevice(subscription("gone"), "Old phone");
  webpush.sendNotification = async (device) => {
    throw Object.assign(new Error("Received unexpected response code"), {
      statusCode: device.endpoint.endsWith("gone") ? 410 : 500,
      body: "fixture push service outage",
    });
  };
  logged.length = 0;
  assert.deepEqual(await push.sendPush({ title: "T", body: "B", url: "/" }), { sent: 0 });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /\[push\] Delivery through push\.fixture\.test failed \(HTTP 500\)/);
  assert.match(logged[0], /fixture push service outage/);
  assert.equal(logged[0].includes(capability), false, "the endpoint path is never logged");
  assert.equal(await push.deviceCount(), 1);
  console.log("PASS: settings and push failures are logged without bodies or device endpoints");
} finally {
  console.error = originalError;
  webpush.sendNotification = originalSend;
  await rm(directory, { recursive: true, force: true });
}
