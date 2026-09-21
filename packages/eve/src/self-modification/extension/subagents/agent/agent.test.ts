import type { DynamicResolveContext } from "#dynamic/definition.js";
import {
  installLocalDevCapabilityEnvironment,
  withLocalDevRequestScope,
} from "#runtime/local-dev-capability.js";
import { stampDevelopmentClientAddress } from "#internal/nitro/dev-client-address.js";
import { DEVELOPMENT_WORKFLOW_SECRET_ENV } from "#internal/workflow/development-world-protocol.js";
import { afterEach, describe, expect, it } from "vitest";

import { defineSelfModificationAgent } from "./agent.js";

const serverUrl = "http://127.0.0.1:3000";
const context: DynamicResolveContext = {
  channel: {},
  messages: [],
  model: null,
  session: { auth: { current: null, initiator: null }, id: "session" },
};

const savedEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnvironment };
});

async function withDevRequest<T>(
  address: string,
  callback: () => Promise<T>,
  trusted = true,
): Promise<T> {
  const secret = "test-secret";
  const headers = new Headers();
  if (trusted) {
    stampDevelopmentClientAddress(headers, address, secret);
  } else {
    headers.set("x-eve-dev-client-address", address);
    headers.set("x-eve-dev-client-address-signature", "forged");
  }
  process.env.EVE_DEV = "1";
  process.env[DEVELOPMENT_WORKFLOW_SECRET_ENV] = secret;
  const restore = installLocalDevCapabilityEnvironment({ appRoot: "/workspace/app", serverUrl });
  try {
    return await withLocalDevRequestScope(new Request(serverUrl, { headers }), callback);
  } finally {
    restore();
  }
}

describe("self-modification local agent", () => {
  it("is available to a verified same-machine request", async () => {
    await withDevRequest("127.0.0.1", async () => {
      const agent = defineSelfModificationAgent({ config: { local: { enabled: true } } });

      await expect(agent.events["turn.started"]?.({}, context)).resolves.not.toBeNull();
    });
  });

  it("does not expose the editor to remote requests", async () => {
    await withDevRequest("203.0.113.7", async () => {
      const agent = defineSelfModificationAgent({ config: { local: { enabled: true } } });

      await expect(agent.events["turn.started"]?.({}, context)).resolves.toBeNull();
    });
  });

  it("does not trust client-supplied provenance headers", async () => {
    await withDevRequest(
      "127.0.0.1",
      async () => {
        const agent = defineSelfModificationAgent({ config: { local: { enabled: true } } });

        await expect(agent.events["turn.started"]?.({}, context)).resolves.toBeNull();
      },
      false,
    );
  });
});
