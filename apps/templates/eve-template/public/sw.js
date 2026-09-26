// Ægentica service worker: an offline fallback for page loads, the share
// target for text and files, and Web Push for scheduled task results. It never
// caches API calls or agent streams.
const CACHE = "aegentica-shell-v5";
const OFFLINE_URL = "/offline.html";
// The offline page and the mark it shows; nothing else is cached.
const PRECACHED = [OFFLINE_URL, "/icons/icon-192.png"];
// While a deploy restarts the server, the proxy in front of it answers with its
// own bare 502, 503 or 504 page. For a page load that is as good as offline, so
// the offline page shows instead and carries on once the server is back.
const UNAVAILABLE = [502, 503, 504];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHED))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      // Start page requests while the worker boots instead of after it.
      .then(() => self.registration.navigationPreload?.enable())
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share") {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (
    event.request.method === "GET" &&
    event.request.mode !== "navigate" &&
    url.origin === self.location.origin &&
    PRECACHED.includes(url.pathname)
  ) {
    // The offline page's mark: from the network while there is one, else the cached copy.
    event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    Promise.resolve(event.preloadResponse)
      .then((preloaded) => preloaded || fetch(event.request))
      .then((response) =>
        UNAVAILABLE.includes(response.status) && !url.pathname.startsWith("/api/")
          ? caches.match(OFFLINE_URL).then((offline) => offline || response)
          : response,
      )
      .catch(() => caches.match(OFFLINE_URL)),
  );
});

// The composer accepts the same types; it validates size and count again before sending.
const SHAREABLE = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/[a-z0-9.+-]+)$/;

// A longer address risks the server's header limit (HTTP 431), which would lose the share.
const MAX_SHARE_QUERY = 2000;

// Android's share sheet posts here. Files become attachments of the new-chat
// composer draft (lib/chat/composer-draft.ts); text travels as query parameters,
// or through this tab's session storage when it is too long for an address.
async function receiveShare(request) {
  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((file) => file instanceof File && file.size > 0 && SHAREABLE.test(file.type))
    .slice(0, 4);
  if (files.length) await attachToNewChat(files).catch(() => undefined);
  const params = new URLSearchParams();
  for (const key of ["title", "text", "url"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  const query = params.toString();
  if (query.length > MAX_SHARE_QUERY) return handOverShare(params);
  return Response.redirect(new URL(query ? `/?${query}` : "/", self.location.origin).href, 303);
}

// Same as app/share/route.ts: a page that leaves the shared text where the home
// page restores drafts from (eve-chat-draft), joined as the home page joins it.
function handOverShare(params) {
  const text = [...new Set(["title", "text", "url"].map((key) => params.get(key)?.trim()))]
    .filter(Boolean)
    .join("\n\n");
  // An escaped "<" cannot close the script element.
  const value = JSON.stringify(text).replaceAll("<", "\\u003c");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Ægentica</title><script>try{sessionStorage.setItem("eve-chat-draft",${value})}catch{}location.replace("/")</script>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function attachToNewChat(files) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("aegentica-composer", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const read = store.get("new");
      read.onsuccess = () => {
        const draft = read.result || { id: "new", profileId: "", profileName: "", mode: "chat" };
        store.put({
          ...draft,
          files: [...(draft.files || []), ...files].slice(-4),
          updatedAt: Date.now(),
        });
      };
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        open.result.close();
        reject(tx.error);
      };
    };
  });
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      // The app clears the badge when it comes to the foreground.
      self.navigator.setAppBadge?.().catch(() => undefined),
      // An open app window adds the new result to its chat list right away.
      self.clients
        .matchAll({ type: "window" })
        .then((windows) =>
          windows.forEach((client) => client.postMessage({ type: "aegentica:chats-changed" })),
        ),
      self.registration.showNotification(data.title || "Ægentica", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        // Same-origin paths only: "//host" (or "/\host") would open another site.
        data: {
          url:
            typeof data.url === "string" && data.url.startsWith("/") && !/^\/[/\\]/.test(data.url)
              ? data.url
              : "/",
        },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(openFromNotification(target));
});

async function openFromNotification(target) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((client) => client.url.startsWith(self.location.origin));
  if (!open) return self.clients.openWindow(target.href);
  // Focus first, while the tap still allows it; a navigation takes longer.
  await open.focus().catch(() => undefined);
  if (open.url === target.href) return;
  // navigate() works only in a window this worker controls (not, for example,
  // after a hard reload); in any other, the app opens the chat itself.
  const controlled = await self.clients.matchAll({ type: "window" });
  if (controlled.some((client) => client.id === open.id))
    return open.navigate(target.href).catch(() => self.clients.openWindow(target.href));
  open.postMessage({ type: "aegentica:open", url: target.pathname + target.search + target.hash });
}
