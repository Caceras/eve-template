import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionAuthContext } from "#channel/types.js";
import { checkRemoteCallbackPrincipal } from "#eve-channel/remote-callback-policy.js";

function principal(principalType: string): SessionAuthContext {
  return { attributes: {}, authenticator: "test", principalId: "p-1", principalType };
}

describe("checkRemoteCallbackPrincipal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores requests without remote callback work", () => {
    expect(checkRemoteCallbackPrincipal({}, principal("anonymous"))).toBeNull();
    expect(
      checkRemoteCallbackPrincipal({ activityObserver: undefined }, principal("user")),
    ).toBeNull();
  });

  it.each(["service", "runtime"])("accepts callbacks and observers from a %s principal", (type) => {
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal(type))).toBeNull();
    expect(checkRemoteCallbackPrincipal({ activityObserver: {} }, principal(type))).toBeNull();
  });

  it.each(["anonymous", "user"])(
    "rejects callbacks and observers from a %s principal with 400",
    async (type) => {
      const callback = checkRemoteCallbackPrincipal({ callback: {} }, principal(type));
      expect(callback?.status).toBe(400);
      await expect(callback?.json()).resolves.toEqual({
        error: "Remote callbacks require a caller authenticated as a service or runtime principal.",
        ok: false,
      });
      const observer = checkRemoteCallbackPrincipal({ activityObserver: {} }, principal(type));
      expect(observer?.status).toBe(400);
    },
  );

  it("exempts local eve dev but not eve dev on Vercel", () => {
    vi.stubEnv("EVE_DEV", "1");
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal("user"))).toBeNull();
    expect(
      checkRemoteCallbackPrincipal({ activityObserver: {} }, principal("anonymous")),
    ).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(checkRemoteCallbackPrincipal({ callback: {} }, principal("user"))?.status).toBe(400);
  });
});
