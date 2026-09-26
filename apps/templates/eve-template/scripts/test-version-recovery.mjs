// After a deploy an open tab runs the old build: its Server Actions and lazy
// chunks are gone from the new server. lib/pwa/version-recovery.ts reloads
// once into the new build; this checks what it recognises, when it waits,
// that it never loops, and that its release and busy signals stay in sync with
// the files they read.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => readFileSync(join(root, file), "utf8");

class MemoryStorage {
  #items = new Map();
  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }
  setItem(key, value) {
    this.#items.set(key, String(value));
  }
}
class FakeDocument extends EventTarget {
  visibilityState = "visible";
  activeElement = null;
  busy = false;
  querySelector() {
    return this.busy ? {} : null;
  }
}
const document = new FakeDocument();
const window = new EventTarget();
let reloads = 0;
window.location = { reload: () => reloads++ };
window.sessionStorage = new MemoryStorage();
let serverRelease = "release-a";
let healthRequests = 0;
globalThis.document = document;
globalThis.window = window;
globalThis.fetch = async (url) => {
  assert.equal(url, "/api/health");
  healthRequests++;
  return { json: async () => ({ ok: true, release: serverRelease }) };
};
let now = 1_000_000;
Date.now = () => now;

const recovery = await import("../lib/pwa/version-recovery.ts");
const {
  isChunkLoadError,
  isUnrecognizedActionError,
  isVersionSkewError,
  isBusy,
  hasUnsentText,
  mayReload,
  markReload,
  watchForNewVersion,
} = recovery;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const textarea = (value, composer = false) => ({
  tagName: "TEXTAREA",
  value,
  matches: (selector) => composer && selector === "[data-chat-composer-input]",
});

// What counts as "this page is older than the server".
const turbopack = Object.assign(
  new Error("Failed to load chunk /_next/static/chunks/0abc.js from module 123"),
  { name: "ChunkLoadError" },
);
assert(isChunkLoadError(turbopack));
assert(isChunkLoadError(new Error("Loading chunk 482 failed.\n(error: https://x/482.js)")));
assert(isChunkLoadError(new Error("Loading CSS chunk 7 failed.")));
assert(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /a.js")));
assert(isChunkLoadError(new TypeError("Importing a module script failed.")));
assert(!isChunkLoadError(new Error("Failed to load chat history.")));
const unrecognized = Object.assign(
  new Error(
    'Server Action "7f00000000000000000000000000000000000000" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  ),
  { name: "UnrecognizedActionError" },
);
assert(isUnrecognizedActionError(unrecognized));
assert(isVersionSkewError(unrecognized.message), "a toast's message is recognised too");
assert(!isVersionSkewError("Failed to send message."));
assert(!isVersionSkewError(null));
assert(!isVersionSkewError({ message: 42 }));

// What a reload must not interrupt.
assert.equal(isBusy(document), false);
document.busy = true;
assert.equal(isBusy(document), true);
document.busy = false;
const doc = (activeElement) => ({ activeElement, querySelector: () => null });
assert.equal(hasUnsentText(doc(textarea("half a thought", true)), { exceptComposer: true }), false);
assert.equal(hasUnsentText(doc(textarea("half a thought", true)), { exceptComposer: false }), true);
assert.equal(hasUnsentText(doc(textarea("   ")), { exceptComposer: false }), false);
assert.equal(hasUnsentText(doc(textarea("a memory")), { exceptComposer: true }), true);
assert.equal(
  hasUnsentText(doc({ tagName: "INPUT", type: "search", value: "claude" }), {
    exceptComposer: true,
  }),
  true,
);
assert.equal(
  hasUnsentText(doc({ tagName: "INPUT", type: "checkbox", value: "on" }), {
    exceptComposer: false,
  }),
  false,
);
assert.equal(
  hasUnsentText(doc({ tagName: "DIV", isContentEditable: true, textContent: "notes" }), {
    exceptComposer: false,
  }),
  true,
);
assert.equal(hasUnsentText(doc({ tagName: "BUTTON" }), { exceptComposer: false }), false);
assert.equal(hasUnsentText(doc(null), { exceptComposer: false }), false);

// Never a loop: once per release, and errors not twice within two minutes.
const storage = new MemoryStorage();
assert(mayReload(storage, "release", "r2", 0));
assert(markReload(storage, "release", "r2", 0));
assert(!mayReload(storage, "release", "r2", 10 * 60_000), "a release reloads only once");
assert(mayReload(storage, "release", "r3", 0), "the next release may reload again");
assert(markReload(storage, "error", "error", 0));
assert(!mayReload(storage, "error", "error", 60_000));
assert(mayReload(storage, "error", "error", 2 * 60_000));
assert(!mayReload(null, "error", "error"), "without session storage nothing reloads by itself");
const refusing = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};
assert(!mayReload(refusing, "error", "error"));
assert(!markReload(refusing, "error", "error"));

// The watcher: a newer release after time away reloads once, not mid-reply.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stop = watchForNewVersion("release-a");
const away = async (ms) => {
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  now += ms;
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  await flush();
};
await away(60_000);
assert.equal(healthRequests, 1);
assert.equal(reloads, 0, "same release: nothing to do");
await away(5_000);
assert.equal(healthRequests, 1, "a quick trip away does not ask the server");
serverRelease = "release-b";
await away(60_000);
await sleep(700);
assert.equal(reloads, 1, "a newer release reloads at once when nothing is in progress");
await away(60_000);
await sleep(700);
assert.equal(reloads, 1, "one reload per release, even if the page still reports the old one");
serverRelease = "release-c";
document.busy = true;
await away(60_000);
await sleep(700);
assert.equal(reloads, 1, "never while a reply streams");
document.busy = false;
document.activeElement = textarea("typing", true);
window.dispatchEvent(new Event("focus"));
await sleep(700);
assert.equal(reloads, 1, "a newer release waits while someone types in the visible app");
document.visibilityState = "hidden";
document.dispatchEvent(new Event("visibilitychange"));
assert.equal(reloads, 2, "it reloads when the app goes to the background; the draft is kept");
document.visibilityState = "visible";
document.activeElement = null;
// A desktop window behind another app stays visible; coming back to it counts.
serverRelease = "release-d";
window.dispatchEvent(new Event("blur"));
now += 60_000;
window.dispatchEvent(new Event("focus"));
await flush();
await sleep(700);
assert.equal(reloads, 3);

// Errors from the old build reload once, when nothing is in progress.
window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: unrecognized }));
await sleep(700);
assert.equal(reloads, 4);
window.dispatchEvent(Object.assign(new Event("error"), { error: turbopack }));
await sleep(700);
assert.equal(reloads, 4, "a second failure soon after means reloading did not help");
now += 3 * 60_000;
window.dispatchEvent(Object.assign(new Event("error"), { error: new Error("Something else") }));
await sleep(700);
assert.equal(reloads, 4, "unrelated errors never reload");
document.busy = true;
window.dispatchEvent(Object.assign(new Event("error"), { message: `Uncaught ${turbopack}` }));
await sleep(700);
assert.equal(reloads, 4, "an error reload waits for the reply to finish");
document.busy = false;
document.activeElement = textarea("an unsaved memory");
await sleep(2_700);
assert.equal(reloads, 4, "and for text that is not a message draft");
document.activeElement = textarea("a message draft", true);
await sleep(2_700);
assert.equal(reloads, 5, "a message draft survives the reload");
stop();

// The release this bundle knows is the one /api/health reports.
const bundled = source("lib/release.ts").match(/export const RELEASE = "([^"]+)"/)?.[1];
assert(bundled, "lib/release.ts exports RELEASE");
assert.match(
  source("app/api/health/route.ts"),
  /import \{ RELEASE \} from "@\/lib\/release"/,
  "the health route reports the release from lib/release.ts",
);

// The busy signals are real controls.
const composer = source("components/chat/composer.tsx");
for (const label of ["Stop response", "Preparing chat", "Stop dictation", "End voice conversation"])
  assert(composer.includes(`"${label}"`), `composer still labels "${label}"`);
assert.match(source("components/ai-elements/prompt-input.tsx"), /isGenerating \? "Stop"/);
assert.match(composer, /data-chat-composer-input/);

console.log(
  "PASS: version skew recovery: chunk and Server Action errors recognised, never mid-reply or over typed text, once per release, no reload loops, release in sync with /api/health",
);
