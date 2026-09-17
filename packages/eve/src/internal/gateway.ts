import { appendPackageUserAgent, withPackageUserAgent } from "#internal/user-agent.js";

const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

/** AI Gateway model listing endpoint (OpenAI-compatible `/v1/models`). */
export const AI_GATEWAY_MODELS_URL = `${GATEWAY_BASE_URL}/v1/models`;

/** AI Gateway model catalog endpoint, the richer variant of {@link AI_GATEWAY_MODELS_URL}. */
export const AI_GATEWAY_MODELS_CATALOG_URL = `${GATEWAY_BASE_URL}/v1/models/catalog`;

/**
 * A `fetch` for direct AI Gateway requests that identifies eve via its
 * User-Agent product token — call sites get a decorated transport, not header
 * plumbing. Unlike the Sandbox binding's `getVercelSandboxFetch`, nothing is
 * constructed per call site, so this is a value rather than a factory.
 */
export const vercelGatewayFetch: typeof globalThis.fetch = withPackageUserAgent();

/** Framework-owned attribution applied to one AI Gateway request. */
export interface GatewayRequestAttribution {
  readonly evaluation?: true;
  readonly referer?: string;
  readonly title?: string;
}

export const EVE_EVAL_GATEWAY_TAG = "eve-eval";

/**
 * Request headers eve attaches to a Gateway-routed model call. Direct-provider
 * models get no extra headers.
 */
export function resolveGatewayRequestHeaders(
  model: GatewayModel,
  attribution: GatewayRequestAttribution = {},
): Record<string, string> | undefined {
  if (!isGatewayModel(model)) return undefined;
  const headers: Record<string, string> = Object.fromEntries(appendPackageUserAgent(new Headers()));
  if (attribution.title) headers["x-title"] = attribution.title;
  if (attribution.referer) headers["http-referer"] = attribution.referer;
  return headers;
}

export function withGatewayEvaluationTag(
  model: GatewayModel,
  providerOptions: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!isGatewayModel(model)) return providerOptions;
  const gateway =
    providerOptions?.gateway !== undefined &&
    typeof providerOptions.gateway === "object" &&
    providerOptions.gateway !== null
      ? (providerOptions.gateway as Record<string, unknown>)
      : {};
  const tags = Array.isArray(gateway.tags) ? gateway.tags : [];

  return {
    ...providerOptions,
    gateway: {
      ...gateway,
      tags: tags.includes(EVE_EVAL_GATEWAY_TAG) ? tags : [...tags, EVE_EVAL_GATEWAY_TAG],
    },
  };
}

type GatewayModel = string | { readonly provider?: string };

export function isGatewayModel(model: GatewayModel): boolean {
  return typeof model === "string" || model.provider?.split(".")[0] === "gateway";
}
