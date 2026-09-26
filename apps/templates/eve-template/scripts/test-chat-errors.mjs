// Chat requests fail in words a person can act on: an action's structured
// failure keeps its code and message, a network failure reads as offline, an
// expired sign-in is recognised (from an action or from eve), a deploy's
// unknown Server Action still reloads the page, and framework messages never
// reach the error toast.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { ClientError } from "eve/client";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const { ChatActionError, callChatAction, isSignInError, readableChatError } =
  await import("../lib/chat/errors.ts");

assert.equal(await callChatAction(async () => ({ ok: true, value: 7 })), 7);
await assert.rejects(
  callChatAction(async () => ({
    ok: false,
    code: "rate_limited",
    message: "Too many requests. Retry in 30s.",
    retryAfter: 30,
  })),
  (error) =>
    error instanceof ChatActionError &&
    error.code === "rate_limited" &&
    error.retryAfter === 30 &&
    error.message === "Too many requests. Retry in 30s.",
);
await assert.rejects(
  callChatAction(async () => {
    throw new TypeError("Failed to fetch");
  }),
  (error) => error instanceof ChatActionError && error.code === "offline",
  "an action that cannot reach the server reads as offline",
);
await assert.rejects(
  callChatAction(async () => {
    throw new Error("Minified React error #441; visit https://react.dev/errors/441");
  }),
  (error) =>
    error instanceof ChatActionError && error.code === "failed" && !/React/.test(error.message),
  "a framework failure never shows its internal message",
);
// After a deploy the page's Server Actions are gone: that error passes through
// untouched, so the error toast recognises it and reloads into the new version.
const skew = new Error('Server Action "7f00" was not found on the server.');
await assert.rejects(
  callChatAction(async () => {
    throw skew;
  }),
  (error) => error === skew,
  "a deploy's unknown Server Action is not turned into a generic failure",
);
assert.equal(readableChatError(skew, "fallback"), skew.message);

const expired = new ChatActionError("unauthorized", "Your sign-in has expired.");
assert(isSignInError(expired));
assert(isSignInError(new ClientError(401, '{"error":"Unauthorized"}')), "eve refused the request");
assert(!isSignInError(new ClientError(409, '{"code":"session_not_active"}')));
assert(!isSignInError(new Error("Chat not found.")));

assert.equal(readableChatError(expired, "fallback"), "Your sign-in has expired.");
assert.equal(
  readableChatError(new TypeError("Failed to fetch"), "fallback", "Offline, message kept."),
  "Offline, message kept.",
);
assert.equal(
  readableChatError(new ChatActionError("offline", "x"), "fallback", "Offline, message kept."),
  "Offline, message kept.",
);
assert.equal(readableChatError(new Error("Minified React error #441"), "fallback"), "fallback");
assert.equal(
  readableChatError(new Error("Chat is still getting ready."), "x"),
  "Chat is still getting ready.",
);
assert.equal(readableChatError("weird", "fallback"), "fallback");
assert.match(
  readableChatError(new ClientError(401, "{}"), "fallback"),
  /sign-in has expired/,
  "eve's 401 reads as an expired sign-in",
);
console.log(
  "PASS: chat action failures keep their code and message; offline, expired sign-in, deploy and framework errors read plainly",
);
