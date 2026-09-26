// public/sw.js serves the branded offline page for a page load that fails,
// including the proxy's bare 502/503/504 while a deploy restarts the server,
// and public/offline.html carries on by itself once the server answers again.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");

// The worker, in a sandbox with a network and cache that the test controls.
const handlers = {};
const offlinePage = new Response("offline page", { status: 200 });
let cached = true;
let network = async () => new Response("page");
const worker = {
  addEventListener: (type, handler) => (handlers[type] = handler),
  location: { origin: "https://app.test" },
};
vm.runInNewContext(read("public/sw.js"), {
  self: worker,
  caches: { match: async (path) => (cached && path === "/offline.html" ? offlinePage : undefined) },
  fetch: (request) => network(request),
  Response,
  URL,
  URLSearchParams,
  Promise,
});
const load = async (path, { mode = "navigate", preload } = {}) => {
  let answer;
  handlers.fetch({
    request: { url: `https://app.test${path}`, method: "GET", mode },
    preloadResponse: preload,
    respondWith: (promise) => (answer = promise),
  });
  return answer && (await answer);
};
const text = async (response) => (response ? await response.clone().text() : undefined);

for (const status of [502, 503, 504]) {
  network = async () => new Response("Bad Gateway", { status });
  assert.equal(await text(await load("/tasks")), "offline page", `${status} while restarting`);
}
network = async () => new Response("page");
assert.equal(
  await text(await load("/tasks", { preload: Promise.resolve(new Response("", { status: 503 })) })),
  "offline page",
  "a navigation preload that meets the restart too",
);
assert.equal(await text(await load("/tasks")), "page");
network = async () => new Response("app error", { status: 500 });
assert.equal(await text(await load("/tasks")), "app error", "the app's own errors stay visible");
network = async () => new Response('{"ok":false}', { status: 503 });
assert.equal(await text(await load("/api/health")), '{"ok":false}', "API answers stay as they are");
network = async () => {
  throw new TypeError("Failed to fetch");
};
assert.equal(await text(await load("/memory")), "offline page", "no connection");
assert.equal(await load("/api/chats", { mode: "cors" }), undefined, "only page loads");
cached = false;
network = async () => new Response("Bad Gateway", { status: 502 });
assert.equal(await text(await load("/tasks")), "Bad Gateway", "no cached page: the real answer");

// The offline page: online, it says the server is not answering and asks again.
const html = read("public/offline.html");
const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
const elements = { title: { textContent: "" }, reason: { textContent: "" } };
const page = { title: "Offline · Ægentica", visibilityState: "visible" };
let poll;
let reloads = 0;
let answers = [];
vm.runInNewContext(script, {
  addEventListener() {},
  navigator: { onLine: true },
  document: Object.assign(page, { getElementById: (id) => elements[id] }),
  location: { href: "https://app.test/tasks", reload: () => reloads++ },
  fetch: async () => answers.shift(),
  setInterval: (callback, ms) => {
    assert(ms <= 10_000, "asks again within seconds");
    poll = callback;
  },
  Promise,
});
assert.equal(page.title, "Reconnecting · Ægentica");
assert.equal(elements.title.textContent, "Ægentica is not answering");
answers = [new Response("", { status: 502 })];
await poll();
assert.equal(reloads, 0, "still restarting");
page.visibilityState = "hidden";
answers = [new Response("page")];
await poll();
assert.equal(reloads, 0, "not while out of sight");
page.visibilityState = "visible";
await poll();
assert.equal(reloads, 1, "back: the page loads again by itself");

console.log(
  "PASS: service worker: offline page for failed loads and the proxy's 502/503/504 during a restart (not for API or app errors), and it reloads by itself once the server answers",
);
