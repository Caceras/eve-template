type GatewayMetadata = Record<string, unknown>;
type ProviderMetadataLike = Readonly<Record<string, unknown>>;

/** Reads AI Gateway's reported call cost, excluding surcharges. */
export function readGatewayCostUsd(
  providerMetadata: ProviderMetadataLike | undefined,
): number | undefined {
  return readUsd(readGatewayMetadata(providerMetadata)?.cost);
}

/**
 * Reads the market-price cost reported for successful BYOK calls.
 *
 * AI Gateway reports its own BYOK debit as zero for inference. `marketCost` is
 * the Gateway's estimate of what the caller paid the upstream provider.
 */
export function readGatewayUpstreamCostUsd(
  providerMetadata: ProviderMetadataLike | undefined,
): number | undefined {
  const gateway = readGatewayMetadata(providerMetadata);
  if (gateway === undefined || !usedSuccessfulByokCredential(gateway)) return undefined;
  return readUsd(gateway.marketCost);
}

/** Reads the cost that most directly represents the caller's model spend. */
export function readGatewayEffectiveCostUsd(
  providerMetadata: ProviderMetadataLike | undefined,
): number | undefined {
  return readGatewayUpstreamCostUsd(providerMetadata) ?? readGatewayCostUsd(providerMetadata);
}

function readGatewayMetadata(
  providerMetadata: ProviderMetadataLike | undefined,
): GatewayMetadata | undefined {
  const gateway = providerMetadata?.gateway;
  return isRecord(gateway) ? gateway : undefined;
}

function usedSuccessfulByokCredential(gateway: GatewayMetadata): boolean {
  const routing = gateway.routing;
  if (!isRecord(routing) || !Array.isArray(routing.modelAttempts)) return false;

  for (const modelAttempt of routing.modelAttempts) {
    if (!isRecord(modelAttempt) || !Array.isArray(modelAttempt.providerAttempts)) continue;
    for (const providerAttempt of modelAttempt.providerAttempts) {
      if (
        isRecord(providerAttempt) &&
        providerAttempt.success === true &&
        providerAttempt.credentialType === "byok"
      ) {
        return true;
      }
    }
  }
  return false;
}

function readUsd(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
