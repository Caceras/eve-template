// A notification only ever opens a page of this app: the server sends, and
// the service worker keeps, same-origin paths only ("//host" and "/\host" are
// another site's address), falling back to the home page.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
const root = fileURLToPath(new URL("..", import.meta.url));
// The push service is not contacted: web-push records what would be sent.
const webPush = `export default {
  generateVAPIDKeys: () => ({ publicKey: "public", privateKey: "private" }),
  sendNotification: async (device, payload) => globalThis.pushed.push(JSON.parse(payload)),
};`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "web-push")
      return { url: "data:text/javascript," + encodeURIComponent(webPush), shortCircuit: true };
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-push-urls-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
globalThis.pushed = [];
const { addDevice, sendPush } = await import("../lib/push-notifications.ts");

// The service worker, run with just enough of a browser around it.
const listeners = {};
const shown = [];
const opened = [];
const self = {
  addEventListener: (type, listener) => (listeners[type] = listener),
  location: { origin: "https://aegentica.se" },
  navigator: {},
  registration: { showNotification: async (title, options) => shown.push(options) },
  clients: {
    matchAll: async () => [],
    openWindow: async (href) => opened.push(href),
  },
};
vm.runInNewContext(readFileSync(join(root, "public/sw.js"), "utf8"), { self, URL });
const receive = async (url) => {
  let pending;
  listeners.push({
    data: { json: () => ({ title: "Task", url }) },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  return shown.at(-1).data.url;
};
const tap = async (url) => {
  let pending;
  listeners.notificationclick({
    notification: { close() {}, data: { url } },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  return opened.at(-1);
};

try {
  await addDevice({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }, "t");
  const cases = [
    ["/chat/abc?x=1#end", "/chat/abc?x=1#end"],
    ["//evil.example/phish", "/"],
    ["/\\evil.example/phish", "/"],
    ["https://evil.example/", "/"],
    ["javascript:alert(1)", "/"],
  ];
  for (const [url, expected] of cases) {
    await sendPush({ title: "Task", body: "Done", url });
    assert.equal(globalThis.pushed.at(-1).url, expected, `server sends ${url} as ${expected}`);
    assert.equal(await receive(url), expected, `the worker keeps ${url} as ${expected}`);
    assert.equal(await tap(await receive(url)), new URL(expected, "https://aegentica.se").href);
  }
  console.log(
    "PASS: push notifications open same-origin paths only, on the server and in the worker",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
