export const EVE_EVAL_HEADER = "x-eve-eval";
export const EVE_EVAL_HEADER_VALUE = "1";

/** Parses an untrusted transport marker; callers must authorize it before persisting it. */
export function isEveEvalRequest(headers: Headers): boolean {
  return headers.get(EVE_EVAL_HEADER) === EVE_EVAL_HEADER_VALUE;
}
