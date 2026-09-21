/**
 * The Slack Web API surface eve's Slack channel drives, as a typed
 * request/response map.
 *
 * This is the `instance_double` half of the rspec translation. A plain
 * double will happily answer a method that does not exist, or answer it
 * with a shape the real collaborator would never produce; rspec solves
 * that by verifying the double against the real class. Slack is not
 * in-process, so there is no class to verify against — this map is the
 * local contract we own and verify against instead.
 *
 * What it buys:
 *
 * - Only a real method name typechecks. `allow("chat.postMesage")` is a
 *   compile error, not a test that silently never matches.
 * - A stubbed response is shape-checked against what that method
 *   actually returns, so a stub cannot drift into fiction the way a
 *   hand-written simulation can.
 * - The double is a mapped type over these keys, so adding a method here
 *   without teaching the double about it is a compile error.
 *
 * What it explicitly does not buy: conformance. These types encode what
 * we *believe* Slack returns. Nothing here can check that belief against
 * Slack, and no local artifact can. The runtime parity check in
 * `slack-api-contract.test.ts` narrows the gap from the other side by
 * asserting the suite actually exercises every method listed here.
 *
 * `response` is always the success shape. Slack-level `{ ok: false }`
 * and HTTP-level failures are separate paths on the double (rspec's
 * `and_raise`), because in this codebase they genuinely are different:
 * one arrives as an envelope the caller inspects, the other as a thrown
 * `SlackApiError`.
 */

/** A Slack message as the Web API returns it inside a response. */
export type SlackRawMessage = Record<string, unknown>;

export interface SlackApiContract {
  "assistant.threads.setStatus": {
    request: {
      channel_id: string;
      thread_ts: string;
      status: string;
      loading_messages?: readonly string[];
    };
    response: { ok: true };
  };

  "auth.test": {
    request: Record<string, unknown>;
    response: {
      ok: true;
      app_id?: string;
      bot_id?: string;
      team?: string;
      team_id?: string;
      url?: string;
      user?: string;
      user_id?: string;
    };
  };

  "chat.appendStream": {
    request: { channel: string; ts: string; markdown_text?: string };
    response: { ok: true; ts?: string };
  };

  "chat.delete": {
    request: { channel: string; ts: string };
    response: { ok: true; channel?: string; ts?: string };
  };

  "chat.getPermalink": {
    request: { channel: string; message_ts: string };
    response: { ok: true; channel?: string; permalink: string };
  };

  "chat.postEphemeral": {
    request: {
      channel: string;
      user: string;
      text?: string;
      blocks?: unknown;
      markdown_text?: string;
      thread_ts?: string;
    };
    response: { ok: true; message_ts: string };
  };

  "chat.postMessage": {
    request: {
      channel: string;
      text?: string;
      blocks?: unknown;
      markdown_text?: string;
      thread_ts?: string;
      unfurl_links?: boolean;
      unfurl_media?: boolean;
    };
    response: { ok: true; channel?: string; ts: string; message?: SlackRawMessage };
  };

  "chat.startStream": {
    request: { channel: string; thread_ts?: string; markdown_text?: string };
    response: { ok: true; channel?: string; ts: string };
  };

  "chat.stopStream": {
    request: { channel: string; ts: string };
    response: { ok: true; ts?: string };
  };

  "chat.update": {
    request: {
      channel: string;
      ts: string;
      text?: string;
      blocks?: unknown;
      markdown_text?: string;
    };
    response: { ok: true; channel?: string; ts: string };
  };

  "conversations.info": {
    request: { channel: string };
    response: { ok: true; channel: Record<string, unknown> };
  };

  "conversations.open": {
    request: { users: string };
    response: { ok: true; channel: { id: string } };
  };

  "conversations.replies": {
    request: { channel: string; ts: string; limit?: number; cursor?: string };
    response: {
      ok: true;
      messages: readonly SlackRawMessage[];
      has_more?: boolean;
      response_metadata?: { next_cursor?: string };
    };
  };

  "files.completeUploadExternal": {
    request: {
      files: readonly { id: string; title?: string }[];
      channel_id?: string;
      initial_comment?: string;
      thread_ts?: string;
    };
    response: { ok: true; files: readonly { id: string; title?: string }[] };
  };

  "files.getUploadURLExternal": {
    request: { filename: string; length: number; alt_txt?: string; snippet_type?: string };
    response: { ok: true; upload_url: string; file_id: string };
  };

  "users.info": {
    request: { user: string };
    response: { ok: true; user: Record<string, unknown> };
  };

  "views.open": {
    request: { view: unknown; trigger_id?: string; interactivity_pointer?: string };
    response: { ok: true; view: Record<string, unknown> };
  };

  "views.update": {
    request: { view: unknown; view_id: string };
    response: { ok: true; view: Record<string, unknown> };
  };
}

/** Every Slack Web API method the channel drives. */
export type SlackApiMethod = keyof SlackApiContract;

export type SlackApiRequest<M extends SlackApiMethod> = SlackApiContract[M]["request"];
export type SlackApiResponseFor<M extends SlackApiMethod> = SlackApiContract[M]["response"];

/**
 * Runtime list of the contract's keys.
 *
 * Typed as a mapped record rather than an array so the compiler rejects
 * both a missing key and a key that is not in the contract — keeping this
 * list and {@link SlackApiContract} in step is not left to discipline.
 */
const SLACK_API_METHOD_SET: { readonly [M in SlackApiMethod]: true } = {
  "assistant.threads.setStatus": true,
  "auth.test": true,
  "chat.appendStream": true,
  "chat.delete": true,
  "chat.getPermalink": true,
  "chat.postEphemeral": true,
  "chat.postMessage": true,
  "chat.startStream": true,
  "chat.stopStream": true,
  "chat.update": true,
  "conversations.info": true,
  "conversations.open": true,
  "conversations.replies": true,
  "files.completeUploadExternal": true,
  "files.getUploadURLExternal": true,
  "users.info": true,
  "views.open": true,
  "views.update": true,
};

export const SLACK_API_METHODS: readonly SlackApiMethod[] = Object.keys(
  SLACK_API_METHOD_SET,
).sort() as SlackApiMethod[];

/**
 * The two legs of the file-upload handshake that are not Web API method
 * calls: the raw bytes POST to the URL `files.getUploadURLExternal`
 * hands out, and an authenticated `url_private` download. They are
 * recorded under these names so tests can assert on them, but they are
 * deliberately outside {@link SlackApiContract} — they have no method
 * name, no form-encoded body, and no JSON response, so folding them in
 * would distort the shape the contract exists to pin down.
 */
export const SLACK_TRANSPORT_LEGS = ["files.upload", "files.download"] as const;

export type SlackTransportLeg = (typeof SLACK_TRANSPORT_LEGS)[number];

/** Any name that can appear as a recorded call's `method`. */
export type SlackRecordedMethod = SlackApiMethod | SlackTransportLeg | (string & {});
