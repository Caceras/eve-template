// The Activity page's low-level session actions report what happened in a
// sentence, not as the raw JSON the eve client returns.

export type SessionAction = "cancel" | "compact" | "clear" | "reset";

const NO_SESSION = "This session is no longer active, so there was nothing to change.";

const DONE: Record<SessionAction, { readonly status: string; readonly text: string }> = {
  cancel: { status: "accepted", text: "Stop requested. The reply in progress ends shortly." },
  compact: {
    status: "accepted",
    text: "Compaction queued. Earlier turns will be summarized to free up context.",
  },
  clear: {
    status: "accepted",
    text: "Context clear queued. Ægentica forgets this conversation so far; the chat history stays visible.",
  },
  reset: { status: "reset", text: "Conversation reset. Its next message starts a new session." },
};

const VERBS: Record<SessionAction, string> = {
  cancel: "stop the reply",
  compact: "compact this session",
  clear: "clear this session's context",
  reset: "reset this conversation",
};

/** A sentence for what an eve session action returned. */
export function describeSessionResult(action: SessionAction, result: unknown) {
  const status = (result as { readonly status?: unknown } | null)?.status;
  if (status === DONE[action].status) return DONE[action].text;
  if (status === "no_active_turn") return "Nothing to stop: no reply is in progress.";
  if (status === "no_active_session") return NO_SESSION;
  return "Done.";
}

/** A sentence for an eve session action that failed, with the server's reason when it is one. */
export function describeSessionError(action: SessionAction, error: unknown) {
  return `Couldn't ${VERBS[action]}.${errorDetail(error)}`;
}

/** The error's own words, unless they are a raw response body (JSON, HTML) or a wall of text. */
export function errorDetail(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || message.length > 160 || /^[{[<]/.test(message)) return "";
  return ` ${/[.!?]$/.test(message) ? message : `${message}.`}`;
}
