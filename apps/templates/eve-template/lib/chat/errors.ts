import { ClientError } from "eve/client";
import { isVersionSkewError } from "../pwa/version-recovery";

/**
 * Why a chat request failed, in words a person can act on. Server actions
 * return these instead of throwing: production builds replace a thrown
 * action error with a generic React message ("Minified React error #441").
 */
export type ChatActionCode =
  | "failed"
  | "invalid"
  | "not_found"
  | "offline"
  | "rate_limited"
  | "unauthorized"
  | "unavailable";

export type ChatActionFailure = {
  readonly ok: false;
  readonly code: ChatActionCode;
  readonly message: string;
  readonly retryAfter?: number;
};

export type ChatActionResult<T> = { readonly ok: true; readonly value: T } | ChatActionFailure;

export class ChatActionError extends Error {
  readonly code: ChatActionCode;
  readonly retryAfter?: number;

  constructor(code: ChatActionCode, message: string, retryAfter?: number) {
    super(message);
    this.name = "ChatActionError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const OFFLINE_MESSAGE = "You're offline. Check the connection and try again.";

export function isOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // Chrome "Failed to fetch", Firefox "NetworkError when attempting…", Safari "Load failed".
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/** The sign-in expired: an action said so, or eve refused the request. */
export function isSignInError(error: unknown) {
  return (
    (error instanceof ChatActionError && error.code === "unauthorized") ||
    (error instanceof ClientError && error.status === 401)
  );
}

/** Text for an error toast: never a framework's internal message. */
export function readableChatError(
  error: unknown,
  fallback: string,
  offline: string = OFFLINE_MESSAGE,
) {
  if (error instanceof ChatActionError) return error.code === "offline" ? offline : error.message;
  // After a deploy: the toast recognises this text, says so and reloads.
  if (error instanceof Error && isVersionSkewError(error)) return error.message;
  if (isOfflineError(error)) return offline;
  if (isSignInError(error)) return "Your sign-in has expired. Sign in again to continue.";
  if (
    error instanceof Error &&
    error.message &&
    !/Minified React error|Server Components render|unexpected response/i.test(error.message)
  )
    return error.message;
  return fallback;
}

/** Unwraps an action result; a network failure of the action itself reads as offline. */
export async function callChatAction<T>(action: () => Promise<ChatActionResult<T>>): Promise<T> {
  let result: ChatActionResult<T>;
  try {
    result = await action();
  } catch (error) {
    // A deploy replaced this page's Server Actions: kept as is, so the page reloads.
    if (isVersionSkewError(error)) throw error;
    if (isOfflineError(error)) throw new ChatActionError("offline", OFFLINE_MESSAGE);
    throw new ChatActionError("failed", "Ægentica could not be reached. Try again in a moment.");
  }
  if (result.ok) return result.value;
  throw new ChatActionError(result.code, result.message, result.retryAfter);
}
