import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionAuthContext } from "#channel/types.js";
import { bindRemoteCallbackToCaller, parseCreateBody } from "#eve-channel/request.js";

function principal(principalType: string): SessionAuthContext {
  return { attributes: {}, authenticator: "test", principalId: "p-1", principalType };
}

describe("bindRemoteCallbackToCaller", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores requests without remote callback work and does not consult the policy", async () => {
    const trustedForwarders = vi.fn(() => true);
    await expect(
      bindRemoteCallbackToCaller({}, principal("anonymous"), undefined),
    ).resolves.toBeNull();
    await expect(
      bindRemoteCallbackToCaller({}, principal("anonymous"), trustedForwarders),
    ).resolves.toBeNull();
    expect(trustedForwarders).not.toHaveBeenCalled();
  });

  describe("without a trustedForwarders policy", () => {
    it.each(["service", "runtime"])(
      "accepts callbacks and observers from a %s principal",
      async (type) => {
        await expect(
          bindRemoteCallbackToCaller({ callback: {} }, principal(type), undefined),
        ).resolves.toBeNull();
        await expect(
          bindRemoteCallbackToCaller({ activityObserver: {} }, principal(type), undefined),
        ).resolves.toBeNull();
      },
    );

    it.each(["anonymous", "user"])(
      "rejects callbacks and observers from a %s principal with 400",
      async (type) => {
        const callback = await bindRemoteCallbackToCaller(
          { callback: {} },
          principal(type),
          undefined,
        );
        expect(callback?.status).toBe(400);
        await expect(callback?.json()).resolves.toEqual({
          error:
            "Remote callbacks require a caller authenticated as a service or runtime principal.",
          ok: false,
        });
        const observer = await bindRemoteCallbackToCaller(
          { activityObserver: {} },
          principal(type),
          undefined,
        );
        expect(observer?.status).toBe(400);
      },
    );
  });

  describe("with a trustedForwarders policy", () => {
    it("accepts a caller the policy trusts, whatever its principal type", async () => {
      const trustedForwarders = vi.fn(() => true);
      await expect(
        bindRemoteCallbackToCaller({ callback: {} }, principal("user"), trustedForwarders),
      ).resolves.toBeNull();
      expect(trustedForwarders).toHaveBeenCalledWith(principal("user"));
    });

    it("rejects a caller the policy refuses with 403, even a service principal", async () => {
      const response = await bindRemoteCallbackToCaller(
        { callback: {} },
        principal("service"),
        () => false,
      );
      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toEqual({
        error: "Caller is not authorized to nominate a callback destination.",
        ok: false,
      });
    });

    it("returns 500 when the policy throws", async () => {
      const response = await bindRemoteCallbackToCaller(
        { activityObserver: {} },
        principal("service"),
        () => {
          throw new Error("boom");
        },
      );
      expect(response?.status).toBe(500);
      await expect(response?.json()).resolves.toEqual({
        error: "trustedForwarders handler failed.",
        errorId: expect.any(String),
        ok: false,
      });
    });
  });

  it("exempts local eve dev but not eve dev on Vercel", async () => {
    vi.stubEnv("EVE_DEV", "1");
    const denyAll = vi.fn(() => false);
    await expect(
      bindRemoteCallbackToCaller({ callback: {} }, principal("user"), undefined),
    ).resolves.toBeNull();
    await expect(
      bindRemoteCallbackToCaller({ callback: {} }, principal("user"), denyAll),
    ).resolves.toBeNull();
    expect(denyAll).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL", "1");
    const rejected = await bindRemoteCallbackToCaller(
      { callback: {} },
      principal("user"),
      undefined,
    );
    expect(rejected?.status).toBe(400);
    const denied = await bindRemoteCallbackToCaller({ callback: {} }, principal("user"), denyAll);
    expect(denied?.status).toBe(403);
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
