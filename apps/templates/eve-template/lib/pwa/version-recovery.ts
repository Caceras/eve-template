// After a deploy, an open tab or installed app still runs the previous build.
// Its Server Action IDs and lazily loaded chunks no longer exist on the new
// server: the next send fails with `Server Action "…" was not found on the
// server`, and a reply that needs a chunk it has not loaded yet (math, a
// diagram) crashes the page. This module recognises those errors, and a newer
// release reported by /api/health when the app comes back to the foreground,
// and reloads the page once so it runs the new build.
//
// A reload never interrupts a streaming reply, a chat being prepared or the
// microphone. After an error it also waits while a text field other than the
// message box holds text (message drafts survive a reload, see
// lib/chat/draft-text.ts); a newer release alone never reloads under someone's
// fingers: it reloads at once when nothing is in progress, or else the next
// time the app goes to the background. Each automatic reload is recorded in
// session storage, so a page that still fails afterwards shows its error and
// a Reload button instead of looping; without session storage nothing reloads
// on its own.

export type ReloadReason = "release" | "error";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type DocumentLike = Pick<Document, "querySelector" | "activeElement">;

const MARK = "aegentica:reloaded:";
// Another error this soon after an error reload means reloading did not help.
const ERROR_RELOAD_WINDOW_MS = 2 * 60_000;
// A shorter trip away (a notification, a quick app switch) does not ask the server.
const MIN_AWAY_MS = 15_000;
const RETRY_MS = 2_000;
const SETTLE_MS = 600;

const CHUNK_ERROR =
  /ChunkLoadError|Loading (?:CSS )?chunk \S+ failed|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const ACTION_ERROR =
  /UnrecognizedActionError|Server Action "[^"]*" was not found on the server|Failed to find Server Action/i;

// Controls that exist only while a reply streams, a chat is being prepared or
// the microphone listens: the chat composer (components/chat/composer.tsx) and
// the Live session's submit button (components/ai-elements/prompt-input.tsx).
// scripts/test-version-recovery.mjs fails if these labels change there.
export const BUSY_CONTROLS = [
  '[aria-label="Stop response"]',
  '[aria-label="Preparing chat"]',
  '[aria-label="Stop dictation"]',
  '[aria-label="End voice conversation"]',
  'button[aria-label="Stop"]',
].join(",");
const TEXT_INPUT = /^(?:text|search|email|url|tel|password|number)$/;

function describe(error: unknown) {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const { name, message } = error as { name?: unknown; message?: unknown };
  return [name, message].filter((part) => typeof part === "string").join(": ");
}

/** A script or stylesheet chunk of this build could not be loaded. */
export function isChunkLoadError(error: unknown) {
  return CHUNK_ERROR.test(describe(error));
}

/** The server no longer knows a Server Action this page was built with. */
export function isUnrecognizedActionError(error: unknown) {
  return ACTION_ERROR.test(describe(error));
}

/** The page runs an older build than the server: an error, or a toast's message. */
export function isVersionSkewError(error: unknown) {
  return isChunkLoadError(error) || isUnrecognizedActionError(error);
}

export function isBusy(doc: DocumentLike) {
  return doc.querySelector(BUSY_CONTROLS) !== null;
}

/** The focused field holds text a reload would lose (the message box keeps its draft). */
export function hasUnsentText(doc: DocumentLike, { exceptComposer }: { exceptComposer: boolean }) {
  const field = doc.activeElement as (HTMLElement & { value?: unknown; type?: unknown }) | null;
  if (!field?.tagName) return false;
  if (exceptComposer && field.matches?.("[data-chat-composer-input]")) return false;
  const isTextField =
    field.tagName === "TEXTAREA" ||
    (field.tagName === "INPUT" && TEXT_INPUT.test(String(field.type || "text")));
  if (isTextField) return typeof field.value === "string" && field.value.trim().length > 0;
  return Boolean(field.isContentEditable && field.textContent?.trim());
}

/** Whether an automatic reload for this may happen: at most once per release, and not twice in a row after errors. */
export function mayReload(
  storage: StorageLike | null,
  reason: ReloadReason,
  key: string,
  now = Date.now(),
) {
  if (!storage) return false;
  try {
    const previous = JSON.parse(storage.getItem(MARK + reason) ?? "null") as {
      key?: unknown;
      at?: unknown;
    } | null;
    if (!previous || previous.key !== key) return true;
    return reason === "error" && now - Number(previous.at) >= ERROR_RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Records the reload about to happen; false when storage refuses, and then nothing reloads. */
export function markReload(
  storage: StorageLike | null,
  reason: ReloadReason,
  key: string,
  now = Date.now(),
) {
  if (!storage) return false;
  try {
    storage.setItem(MARK + reason, JSON.stringify({ key, at: now }));
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

let pending: { reason: ReloadReason; key: string } | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

/**
 * Reloads the page into the new build as soon as that interrupts nothing.
 * Returns false when this reload was already tried (or cannot be recorded), so
 * the caller keeps showing its own Reload button.
 */
export function requestReload(reason: ReloadReason, key: string = reason) {
  if (!mayReload(sessionStore(), reason, key)) return false;
  // A failing page matters more than a newer release.
  if (!pending || reason === "error") pending = { reason, key };
  attemptReload();
  return true;
}

function attemptReload(settled = false) {
  clearTimeout(retry);
  if (!pending) return;
  const hidden = document.visibilityState === "hidden";
  const waiting =
    isBusy(document) ||
    hasUnsentText(document, { exceptComposer: pending.reason === "error" || hidden });
  if (waiting) {
    // A broken page retries until it is free; a newer release waits for the
    // app to go to the background (watchForNewVersion) or for an error.
    if (pending.reason === "error") retry = setTimeout(attemptReload, RETRY_MS);
    return;
  }
  if (!hidden && !settled) {
    // In view, a navigation or draft save under way finishes first (a failed
    // new chat returns to the home page with its message), and the notice
    // can be read.
    retry = setTimeout(() => attemptReload(true), SETTLE_MS);
    return;
  }
  const { reason, key } = pending;
  pending = null;
  if (markReload(sessionStore(), reason, key)) window.location.reload();
}

/**
 * Reloads once into the new build when this page meets one (see above).
 * `release` is the release this bundle was built from (lib/release.ts).
 */
export function watchForNewVersion(release: string) {
  let awaySince = document.visibilityState === "hidden" ? Date.now() : 0;
  let checking = false;

  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const live = ((await response.json()) as { release?: unknown }).release;
      if (typeof live === "string" && live && live !== release) requestReload("release", live);
    } catch {
      // Offline or restarting (the proxy answers without JSON): ask next time.
    } finally {
      checking = false;
    }
  };
  const leave = () => {
    awaySince ||= Date.now();
  };
  const comeBack = () => {
    const away = awaySince ? Date.now() - awaySince : 0;
    awaySince = 0;
    if (away >= MIN_AWAY_MS) void check();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      leave();
      // Out of sight is the best moment for a reload that was waiting.
      attemptReload();
    } else comeBack();
  };
  const onError = (event: ErrorEvent) => {
    if (isVersionSkewError(event.error ?? event.message)) requestReload("error");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isVersionSkewError(event.reason)) requestReload("error");
  };

  document.addEventListener("visibilitychange", onVisibility);
  // A desktop window stays visible behind other apps; focus says it is back.
  window.addEventListener("blur", leave);
  window.addEventListener("focus", comeBack);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", leave);
    window.removeEventListener("focus", comeBack);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    clearTimeout(retry);
  };
}
