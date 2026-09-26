/**
 * Plain-language text for a failed turn (`turn.failed`): what went wrong and
 * where to fix it. Shared by the web chat, the Telegram channel and scheduled
 * task notifications. Provider errors arrive as raw API text ("Insufficient
 * credits…"); eve keeps the HTTP status in `details`.
 */
export type TurnFailure = {
  readonly message: string;
  readonly code?: string;
  readonly details?: { readonly [key: string]: unknown };
};

const PROVIDER_NAMES: readonly (readonly [RegExp, string])[] = [
  [/openrouter/i, "OpenRouter"],
  [/ai-gateway|ai gateway|vercel/i, "AI Gateway"],
];

export function describeTurnFailure(failure: TurnFailure) {
  const details = failure.details ?? {};
  const status = Number(details.statusCode ?? details.upstreamStatusCode);
  const text = [
    failure.message,
    details.apiErrorMessage,
    details.upstreamMessage,
    details.responseBodySnippet,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const provider =
    PROVIDER_NAMES.find(([pattern]) => pattern.test(text))?.[1] ?? "The model provider";
  if (status === 402 || /insufficient (credits|funds|balance)|payment required/i.test(text))
    return `${provider} is out of credits. Add credits to that account, or switch provider in Settings.`;
  if (status === 401) return `${provider} rejected the API key. Update the key in Settings.`;
  if (status === 403)
    return `${provider} refused the request: the key may lack access to this model, or the account needs billing details. Check the account, or switch provider in Settings.`;
  if (status === 429)
    return `${provider} is limiting requests right now. Wait a moment and retry, or pick another model in Settings.`;
  return failure.message;
}
