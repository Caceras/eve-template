import {
  createMockSlackWorkspace,
  type MockSlackMessage,
  type MockSlackMethodHandler,
  type MockSlackThreadStatus,
  type MockSlackUploadedFile,
  type MockSlackView,
} from "#internal/testing/mocks/mock-slack-workspace.js";
import { decodeSlackApiBody } from "#public/channels/slack/api-encoding.js";

export type {
  MockSlackMessage,
  MockSlackMethodHandler,
  MockSlackThreadStatus,
  MockSlackUploadedFile,
  MockSlackView,
};

/**
 * Declarative description of an in-memory Slack workspace.
 *
 * The fake answers Slack Web API calls out of its own state: posting a
 * message allocates a real `ts` and stores it, updating mutates the stored
 * copy, deleting removes it, and `conversations.replies` returns exactly
 * what was posted into that thread. Tests assert against the resulting
 * workspace instead of against a canned `{ ok: true }`, so a sequence that
 * does not cohere (updating a ts nobody posted, completing an upload whose
 * bytes never arrived) fails where production would fail.
 *
 * Pass {@link MockSlackApi.fetch} as the channel's `api.fetch`; no global
 * mutation is required.
 */
export interface MockSlackApiInput {
  /**
   * Slack Web API base the fake answers on. Defaults to Slack's own host
   * so a test can stub the global `fetch` when it needs to cover the
   * default-transport path. Normalized to a trailing slash, matching
   * `resolveSlackApiUrl`.
   */
  readonly url?: string;
  /** Workspace id reported by `auth.test`. */
  readonly teamId?: string;
  /** Bot user id reported by `auth.test`. */
  readonly botUserId?: string;
  /** Bot id stamped on every message the fake stores. */
  readonly botId?: string;
  /** App id stamped on every message the fake stores. */
  readonly appId?: string;
  /**
   * Users resolvable through `users.info`, keyed by user id. Unknown ids
   * come back as Slack's `user_not_found`.
   */
  readonly users?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * Conversations resolvable through `conversations.info`, keyed by
   * channel id. Unknown ids come back as Slack's `channel_not_found`.
   */
  readonly conversations?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * Caps `conversations.replies` pages below the `limit` the caller asks
   * for, so cursor pagination is exercised with a handful of messages
   * instead of the hundred eve requests.
   */
  readonly repliesPageSize?: number;
  /**
   * Canned responses keyed by method name, taking precedence over the
   * workspace's own behavior. The raw `ctx.slack.request(...)` escape
   * hatch can reach any Slack method; registering one here is the
   * deliberate opt-in that keeps every other method failing closed.
   */
  readonly methods?: Readonly<Record<string, MockSlackMethodHandler>>;
}

/**
 * One request observed by the fake, in call order.
 *
 * `method` is the Slack method name for a Web API call, and one of the
 * synthetic names `files.upload` (the bytes POST of the external upload
 * handshake) or `files.download` (an authenticated `url_private` fetch)
 * for the two non-Web-API legs the channel also drives.
 */
export interface MockSlackApiCall {
  readonly method: string;
  readonly url: string;
  /** Request body decoded exactly as production encodes it. */
  readonly body: unknown;
  readonly contentType: string | null;
}

/** HTTP-level failure to inject, as distinct from a Slack `{ ok: false }`. */
export interface MockSlackHttpFailure {
  readonly status: number;
  /** Emitted as a `Retry-After` header, for the 429 back-off paths. */
  readonly retryAfter?: number | string;
  /** Slack envelope carried in the failing body. Defaults to `{ ok: false }`. */
  readonly body?: Readonly<Record<string, unknown>>;
}

/**
 * A materialized in-memory Slack workspace returned from
 * {@link mockSlackApi}.
 */
export interface MockSlackApi {
  /** Drop-in fetch suitable for the channel's `api: { fetch }`. */
  readonly fetch: typeof globalThis.fetch;
  /** Normalized base URL the fake answers on. */
  readonly url: string;
  /** Ordered log of every request the fake received. */
  readonly calls: readonly MockSlackApiCall[];
  /** The subset of {@link calls} for one method, in call order. */
  callsTo(method: string): readonly MockSlackApiCall[];
  /**
   * Stored messages, oldest first. Ephemerals are included so tests can
   * assert on them; filter with `{ ephemeral: false }` for what a channel
   * member would actually see.
   */
  messages(filter?: {
    readonly channelId?: string;
    readonly threadTs?: string;
    readonly ephemeral?: boolean;
  }): readonly MockSlackMessage[];
  /** One stored message by `ts`, or `undefined` once it is deleted. */
  message(ts: string): MockSlackMessage | undefined;
  /** Files staged or completed through the external upload handshake. */
  files(): readonly MockSlackUploadedFile[];
  /** Modals opened through `views.open`, oldest first. */
  views(): readonly MockSlackView[];
  /** Latest assistant-thread status per thread. */
  statuses(): readonly MockSlackThreadStatus[];
  /** The stable DM channel id `conversations.open` hands out for a user. */
  directMessageChannel(userId: string): string;
  /**
   * Inserts a message that was already in the workspace before the test
   * ran — a thread root to reply to, or a raw Slack payload whose exact
   * shape (blocks, attachments, `app_id`) the parser under test cares
   * about. Fields the caller omits are filled in with an allocated `ts`
   * and the workspace identity.
   */
  seedMessage(channelId: string, raw?: Readonly<Record<string, unknown>>): MockSlackMessage;
  /**
   * Registers a canned response for one Web API method, overriding
   * whatever the workspace would answer — for an unmodelled method, or
   * for a degenerate response a real Slack could still return.
   */
  respondWith(method: string, handler: MockSlackMethodHandler): void;
  /**
   * Queues a Slack-level `{ ok: false, error }` for the next call to one
   * method. Queued failures are consumed in the order they were added.
   */
  failNext(method: string, error: string): void;
  /**
   * Queues an HTTP-level failure for the next call to one method — a 429
   * with `Retry-After`, or a 500 — which production surfaces as a thrown
   * `SlackApiError` rather than an `{ ok: false }` envelope. An HTTP
   * failure is served before any {@link failNext} queued for the same
   * method, because the request never reaches Slack's method dispatch.
   */
  failNextHttp(method: string, failure: MockSlackHttpFailure): void;
  /**
   * Makes `conversations.replies` hand back the same `next_cursor`
   * forever, the degenerate paging eve's recovery loop guards against.
   */
  loopRepliesCursor(cursor?: string): void;
  /**
   * Protocol violations the fake rejected: a call that was not
   * form-encoded on a form-only method, or one that carried no bearer
   * token. Each one also rejects the `fetch`, but callers that swallow
   * transport errors (thread refresh, typing indicators) would hide that,
   * so assert with {@link assertNoViolations}.
   */
  readonly violations: readonly string[];
  /** Throws when the fake rejected any request as a protocol violation. */
  assertNoViolations(): void;
}

/** Slack's own Web API base, used when the input does not override it. */
const DEFAULT_URL = "https://slack.com/api/";

/**
 * Methods eve deliberately sends as JSON because Slack accepts nothing
 * else for them. Every other method must arrive form-encoded: Slack's JSON
 * support is partial, and form encoding is the invariant `callSlackApi`
 * exists to hold.
 */
const JSON_METHODS = new Set(["views.open", "chat.update"]);

/**
 * Builds an in-memory Slack workspace from a declarative descriptor.
 */
export function mockSlackApi(input: MockSlackApiInput = {}): MockSlackApi {
  const base = normalizeUrl(input.url ?? DEFAULT_URL);
  const origin = new URL(base).origin;
  const workspace = createMockSlackWorkspace({
    url: base,
    teamId: input.teamId ?? "T_MOCK",
    botUserId: input.botUserId ?? "U_MOCK_BOT",
    botId: input.botId ?? "B_MOCK_BOT",
    appId: input.appId ?? "A_MOCK_APP",
    users: input.users,
    conversations: input.conversations,
    repliesPageSize: input.repliesPageSize,
    methods: input.methods,
  });

  const calls: MockSlackApiCall[] = [];
  const violations: string[] = [];
  const slackFailures = new Map<string, string[]>();
  const httpFailures = new Map<string, MockSlackHttpFailure[]>();

  function takeFailure<T>(queue: Map<string, T[]>, method: string): T | undefined {
    const pending = queue.get(method);
    if (pending === undefined || pending.length === 0) return undefined;
    return pending.shift();
  }

  function reject(message: string): never {
    violations.push(message);
    throw new Error(`mockSlackApi: ${message}`);
  }

  const fetchImpl: typeof globalThis.fetch = async (target, init) => {
    const request = target instanceof Request ? target : undefined;
    const url = request?.url ?? String(target);
    const headers = new Headers(request?.headers ?? init?.headers ?? {});
    const contentType = headers.get("content-type");
    const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
    const rawBody = request === undefined ? init?.body : await request.clone().text();

    const uploadTicket = matchPath(url, `${origin}/files/upload/`);
    if (uploadTicket !== undefined) {
      calls.push({ method: "files.upload", url, body: undefined, contentType });
      requireBearer(url, headers);
      const failure = takeFailure(httpFailures, "files.upload");
      if (failure !== undefined) return httpFailureResponse(failure);
      if (!workspace.receiveUpload(uploadTicket, await toBytes(rawBody))) {
        return jsonResponse({ ok: false, error: "file_not_found" }, 404);
      }
      return new Response("OK", { status: 200 });
    }

    const downloadPath = matchPath(url, `${origin}/files/`);
    if (downloadPath !== undefined) {
      calls.push({ method: "files.download", url, body: undefined, contentType });
      requireBearer(url, headers);
      const failure = takeFailure(httpFailures, "files.download");
      if (failure !== undefined) return httpFailureResponse(failure);
      const file = workspace.fileAt(url);
      if (file === undefined) return new Response("not_found", { status: 404 });
      return new Response(file.bytes, { status: 200 });
    }

    if (!url.startsWith(base)) {
      reject(`request to ${url} does not target the configured base ${base}`);
    }
    const operation = url.slice(base.length);
    const body = decodeSlackApiBody(rawBody, contentType);
    calls.push({ method: operation, url, body, contentType });

    if (method !== "POST") reject(`${operation} was sent as ${method}, Slack requires POST`);
    requireBearer(operation, headers);
    requireEncoding(operation, contentType);

    const httpFailure = takeFailure(httpFailures, operation);
    if (httpFailure !== undefined) return httpFailureResponse(httpFailure);
    const slackFailure = takeFailure(slackFailures, operation);
    if (slackFailure !== undefined) return jsonResponse({ ok: false, error: slackFailure });

    return jsonResponse(workspace.call(operation, asRecord(body)));
  };

  function requireBearer(operation: string, headers: Headers): void {
    const authorization = headers.get("authorization") ?? "";
    if (!/^Bearer \S/.test(authorization)) {
      reject(
        `${operation} carried no bearer token (authorization: ${JSON.stringify(authorization)})`,
      );
    }
  }

  function requireEncoding(operation: string, contentType: string | null): void {
    const expected = JSON_METHODS.has(operation)
      ? ["application/x-www-form-urlencoded", "application/json"]
      : ["application/x-www-form-urlencoded"];
    if (expected.some((candidate) => contentType?.includes(candidate) === true)) return;
    reject(
      `${operation} was sent as ${JSON.stringify(contentType)}; Slack's JSON support is partial, ` +
        `so eve form-encodes everything except ${[...JSON_METHODS].join(", ")}`,
    );
  }

  return {
    fetch: fetchImpl,
    url: base,
    calls,
    violations,
    callsTo(method) {
      return calls.filter((call) => call.method === method);
    },
    messages(filter) {
      return workspace.messages.filter(
        (message) =>
          (filter?.channelId === undefined || message.channel === filter.channelId) &&
          (filter?.threadTs === undefined || message.threadTs === filter.threadTs) &&
          (filter?.ephemeral === undefined || message.ephemeral === filter.ephemeral),
      );
    },
    message(ts) {
      return workspace.messages.find((message) => message.ts === ts);
    },
    files() {
      return workspace.files;
    },
    views() {
      return [...workspace.views];
    },
    statuses() {
      return workspace.statuses;
    },
    directMessageChannel(userId) {
      return workspace.directMessageChannel(userId);
    },
    seedMessage(channelId, raw = {}) {
      return workspace.seedMessage(channelId, raw);
    },
    respondWith(method, handler) {
      workspace.respondWith(method, handler);
    },
    failNext(method, error) {
      slackFailures.set(method, [...(slackFailures.get(method) ?? []), error]);
    },
    failNextHttp(method, failure) {
      httpFailures.set(method, [...(httpFailures.get(method) ?? []), failure]);
    },
    loopRepliesCursor(cursor = "looped-cursor") {
      workspace.loopRepliesCursor(cursor);
    },
    assertNoViolations() {
      if (violations.length === 0) return;
      throw new Error(`mockSlackApi observed protocol violations:\n- ${violations.join("\n- ")}`);
    },
  };
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  return parsed.toString();
}

function matchPath(url: string, prefix: string): string | undefined {
  return url.startsWith(prefix) ? url.slice(prefix.length) : undefined;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function httpFailureResponse(failure: MockSlackHttpFailure): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (failure.retryAfter !== undefined) headers["retry-after"] = String(failure.retryAfter);
  return new Response(JSON.stringify(failure.body ?? { ok: false }), {
    status: failure.status,
    headers,
  });
}

async function toBytes(body: unknown): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }
  return new TextEncoder().encode(String(body));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}
