// Ægentica service worker: an offline fallback for page loads, the share
// target for files, and Web Push for scheduled task results. It never caches
// API calls or agent streams.
const CACHE = "aegentica-shell-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
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
  if (event.request.method === "POST" && new URL(event.request.url).pathname === "/share") {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    Promise.resolve(event.preloadResponse)
      .then((preloaded) => preloaded || fetch(event.request))
      .catch(() => caches.match(OFFLINE_URL)),
  );
});

// The composer accepts the same types; it validates size and count again before sending.
const SHAREABLE = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/[a-z0-9.+-]+)$/;

// Android's share sheet posts here. Files become attachments of the new-chat
// composer draft (lib/chat/composer-draft.ts); text travels as query parameters.
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
  return Response.redirect(new URL(query ? `/?${query}` : "/", self.location.origin).href, 303);
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
      self.registration.showNotification(data.title || "Ægentica", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((client) => (client || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
