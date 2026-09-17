import { describe, expect, it } from "vitest";

import {
  readGatewayCostUsd,
  readGatewayEffectiveCostUsd,
  readGatewayUpstreamCostUsd,
} from "#shared/gateway-cost.js";

const byokMetadata = {
  gateway: {
    cost: "0",
    marketCost: "0.0123",
    routing: {
      modelAttempts: [
        {
          providerAttempts: [{ credentialType: "byok", success: true }],
        },
      ],
    },
  },
};

describe("gateway cost metadata", () => {
  it("reads the gateway debit for system-credential calls", () => {
    const providerMetadata = { gateway: { cost: "0.0042" } };

    expect(readGatewayCostUsd(providerMetadata)).toBe(0.0042);
    expect(readGatewayUpstreamCostUsd(providerMetadata)).toBeUndefined();
    expect(readGatewayEffectiveCostUsd(providerMetadata)).toBe(0.0042);
  });

  it("uses market cost as effective spend for successful BYOK calls", () => {
    expect(readGatewayCostUsd(byokMetadata)).toBe(0);
    expect(readGatewayUpstreamCostUsd(byokMetadata)).toBe(0.0123);
    expect(readGatewayEffectiveCostUsd(byokMetadata)).toBe(0.0123);
  });

  it("does not treat a BYOK fallback attempt as successful BYOK spend", () => {
    const providerMetadata = {
      gateway: {
        cost: "0.0042",
        marketCost: "0.0123",
        routing: {
          modelAttempts: [
            {
              providerAttempts: [
                { credentialType: "byok", success: false },
                { credentialType: "system", success: true },
              ],
            },
          ],
        },
      },
    };

    expect(readGatewayUpstreamCostUsd(providerMetadata)).toBeUndefined();
    expect(readGatewayEffectiveCostUsd(providerMetadata)).toBe(0.0042);
  });
});
