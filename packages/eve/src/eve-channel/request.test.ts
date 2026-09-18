import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionAuthContext } from "#channel/types.js";
import { checkRemoteCallbackPrincipal, parseCreateBody } from "#eve-channel/request.js";

function principal(principalType: string): SessionAuthContext {
  return { attributes: {}, authenticator: "test", principalId: "p-1", principalType };
}

describe("checkRemoteCallbackPrincipal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores requests without remote callback work", () => {
    expect(checkRemoteCallbackPrincipal({}, principal("anonymous"))).toBeNull();
  });

  it.each(["service", "runtime"])("accepts callbacks and observers from a %s principal", (type) => {
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal(type))).toBeNull();
    expect(checkRemoteCallbackPrincipal({ activityObserver: {} }, principal(type))).toBeNull();
  });

  it.each(["anonymous", "user"])("rejects callbacks and observers from a %s principal", (type) => {
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal(type))?.status).toBe(400);
    expect(checkRemoteCallbackPrincipal({ activityObserver: {} }, principal(type))?.status).toBe(
      400,
    );
  });

  it("exempts local eve dev but not eve dev on Vercel", () => {
    vi.stubEnv("EVE_DEV", "1");
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal("user"))).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal("user"))?.status).toBe(400);
  });
});

describe("parseCreateBody", () => {
  it("accepts a conversation session without a message", () => {
    expect(parseCreateBody({})).toEqual({
      activityObserver: undefined,
      callback: undefined,
      capabilities: undefined,
      context: undefined,
      mode: undefined,
      outputSchema: undefined,
    });
  });

  it("rejects an explicitly empty message", async () => {
    const response = parseCreateBody({ message: "" });
    expect(response).toBeInstanceOf(Response);
    await expect((response as Response).json()).resolves.toMatchObject({
      error: "Expected 'message' to be non-empty when provided.",
    });
  });

  it("rejects turn-only fields without a message", async () => {
    const response = parseCreateBody({ clientContext: "page context" });
    expect(response).toBeInstanceOf(Response);
    await expect((response as Response).json()).resolves.toMatchObject({
      error: expect.stringContaining("does not accept"),
    });
  });

  it("requires a message for task mode", async () => {
    const response = parseCreateBody({ mode: "task" });
    expect(response).toBeInstanceOf(Response);
    await expect((response as Response).json()).resolves.toMatchObject({
      error: "Task sessions require a non-empty 'message'.",
    });
  });
});
