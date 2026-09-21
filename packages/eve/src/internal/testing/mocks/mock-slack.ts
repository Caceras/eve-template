/**
 * A strict test double over the Slack Web API, in the shape rspec-mocks
 * would build it.
 *
 * The double owns the `api.fetch` seam and nothing else. It holds no
 * workspace, allocates no timestamps, and models no Slack behavior. Each
 * test declares the collaboration it expects — which methods are called
 * and what they return — and asserts afterwards against the recorded
 * calls.
 *
 * ## Strict by default
 *
 * A method nobody stubbed is a test failure naming the method, never a
 * friendly `{ ok: true }`. This is the property the whole double exists
 * for. When someone adds a Slack call to the channel next quarter, their
 * test fails immediately and tells them what to declare, instead of
 * passing having verified nothing. A permissive default is how a fake
 * quietly stops describing reality.
 *
 * Failures are also recorded as {@link MockSlack.violations}, because
 * several production paths (thread refresh, typing indicators) swallow
 * transport errors and would otherwise hide the very failure that is
 * supposed to be loud. Assert with {@link MockSlack.assertNoViolations}.
 *
 * ## What it cannot tell you
 *
 * Stub shapes are checked against {@link SlackApiContract}, which is our
 * belief about Slack, not Slack. If Slack changes a response shape, this
 * double keeps answering the old one and every test keeps passing — no
 * local artifact can catch that, and none here pretends to. What the
 * contract does catch is *our* drift: a typo'd method, a stub returning
 * the wrong shape, or a new production call with no contract entry.
 *
 * There is deliberately no `and_call_original` and no partial double:
 * Slack is not in-process, so there is no original to call.
 *
 * ```ts
 * const slack = mockSlack();
 * slack.allow("chat.postMessage").andReturn({ ok: true, channel: "C01", ts: "1700.1" });
 *
 * await thread.post("hi");
 *
 * expect(slack.bodyOf("chat.postMessage")).toMatchObject({ markdown_text: "hi" });
 * ```
 */

import {
  SLACK_TRANSPORT_LEGS,
  type SlackApiMethod,
  type SlackApiRequest,
  type SlackApiResponseFor,
} from "#internal/testing/mocks/slack-api-contract.js";
import { decodeSlackApiBody } from "#public/channels/slack/api-encoding.js";

/** Slack's own Web API base, used when the test does not override it. */
const DEFAULT_URL = "https://slack.com/api/";

/**
 * Methods eve deliberately sends as JSON because Slack accepts nothing
 * else for them. Every other method must arrive form-encoded: Slack's
 * JSON support is partial, and form encoding is the invariant
 * `callSlackApi` exists to hold.
 */
const JSON_METHODS = new Set<string>(["views.open", "chat.update"]);

/** One request observed by the double, in call order. */
export interface MockSlackCall {
  /**
   * The Slack method name, or one of the synthetic transport-leg names
   * in `SLACK_TRANSPORT_LEGS`.
   */
  readonly method: string;
  readonly url: string;
  /** Request body decoded exactly as production encoded it. */
  readonly body: unknown;
  readonly contentType: string | null;
}

/** HTTP-level failure, as distinct from a Slack `{ ok: false }` envelope. */
export interface MockSlackHttpFailure {
  readonly status: number;
  /** Emitted as a `Retry-After` header, for the 429 back-off paths. */
  readonly retryAfter?: number | string;
  /** Slack envelope carried in the failing body. Defaults to `{ ok: false }`. */
  readonly body?: Readonly<Record<string, unknown>>;
}

/**
 * Fluent stub for one method — rspec's
 * `allow(x).to receive(:m).with(...).and_return(...)`.
 */
export interface MockSlackStub<M extends SlackApiMethod> {
  /** Answer every matching call with this response. */
  andReturn(response: SlackApiResponseFor<M>): MockSlackStub<M>;
  /**
   * Answer successive calls with successive responses. Running past the
   * end is a failure rather than a silent repeat of the last one, so a
   * loop that calls more times than the test declared is caught.
   */
  andReturnEach(responses: readonly SlackApiResponseFor<M>[]): MockSlackStub<M>;
  /** Compute the response from the decoded request body. */
  andRespond(respond: (body: SlackApiRequest<M>) => SlackApiResponseFor<M>): MockSlackStub<M>;
  /**
   * Constrain which calls this stub answers. A call to the method that
   * does not satisfy the constraint fails loudly rather than falling
   * through, so a wrong-argument call is caught at the call, not by an
   * assertion someone remembered to write.
   */
  with(expected: Partial<SlackApiRequest<M>>): MockSlackStub<M>;
  /** Answer with a Slack-level `{ ok: false, error }` envelope. */
  andFail(error: string): MockSlackStub<M>;
  /** Fail the transport, which production surfaces as a thrown `SlackApiError`. */
  andFailHttp(failure: MockSlackHttpFailure): MockSlackStub<M>;
}

export interface MockSlack {
  /** Drop-in fetch for the channel's `api: { fetch }`. */
  readonly fetch: typeof globalThis.fetch;
  /** Normalized base URL the double answers on. */
  readonly url: string;
  /** Ordered log of every request observed. */
  readonly calls: readonly MockSlackCall[];
  /** The subset of {@link calls} for one method, in call order. */
  callsTo(method: string): readonly MockSlackCall[];
  /**
   * Decoded body of one call to a method — the nth, defaulting to the
   * first. Fails naming the method when there was no such call, which
   * reads better at the assertion site than indexing into `callsTo`.
   */
  bodyOf(method: string, index?: number): Record<string, unknown>;
  /** Methods actually called, in first-call order. */
  observedMethods(): readonly string[];
  /** Declare what one method does. Unstubbed methods fail loudly. */
  allow<M extends SlackApiMethod>(method: M): MockSlackStub<M>;
  /**
   * Declare a method that is deliberately outside
   * {@link SlackApiContract}.
   *
   * `ctx.slack.request(...)` is a documented escape hatch that can reach
   * any Slack method, including ones the channel itself never drives, so
   * the contract cannot cover them without growing entries for the whole
   * Web API. This is the unverified door for exactly that case: nothing
   * checks the method name or the response shape.
   *
   * Named to be conspicuous at the call site, and excluded from the
   * contract parity check. Reach for {@link allow} unless the method
   * under test is genuinely ad hoc.
   */
  allowUncheckedMethod(method: string, response: Readonly<Record<string, unknown>>): void;
  /**
   * Queues a one-shot Slack-level `{ ok: false, error }` ahead of
   * whatever the method is stubbed to return.
   */
  failNext(method: SlackApiMethod, error: string): void;
  /**
   * Queues a one-shot HTTP failure, served before any {@link failNext}
   * for the same method because the request never reaches Slack's
   * method dispatch.
   */
  failNextHttp(method: SlackApiMethod, failure: MockSlackHttpFailure): void;
  /** The URL `files.getUploadURLExternal` should hand out for a file id. */
  uploadUrl(fileId: string): string;
  /** A `url_private` on this double's origin, for the download leg. */
  downloadUrl(path: string): string;
  /** Bytes received by the upload leg, in upload order. */
  uploadedBytes(): readonly Uint8Array[];
  /** Serve one authenticated `url_private` download with these bytes. */
  allowDownload(bytes: Uint8Array): void;
  /**
   * Protocol violations: an unstubbed method, an unsatisfied `with`
   * constraint, a call that was not form-encoded on a form-only method,
   * or one carrying no bearer token. Each also rejects the `fetch`.
   */
  readonly violations: readonly string[];
  /** Throws when the double rejected any request. */
  assertNoViolations(): void;
}

export interface MockSlackOptions {
  /**
   * Base the double answers on. Defaults to Slack's own host so a test
   * can stub the global `fetch` when covering the default-transport
   * path. Normalized to a trailing slash, matching `resolveSlackApiUrl`.
   */
  readonly url?: string;
}

interface StubState {
  responses: unknown[];
  sequence: boolean;
  respond?: (body: Record<string, unknown>) => unknown;
  constraint?: Record<string, unknown>;
  failure?: string;
  httpFailure?: MockSlackHttpFailure;
}

export function mockSlack(options: MockSlackOptions = {}): MockSlack {
  const base = normalizeUrl(options.url ?? DEFAULT_URL);
  const origin = new URL(base).origin;

  const calls: MockSlackCall[] = [];
  const violations: string[] = [];
  const stubs = new Map<string, StubState>();
  const failNextQueue = new Map<string, string[]>();
  const failNextHttpQueue = new Map<string, MockSlackHttpFailure[]>();
  const uploads: Uint8Array[] = [];
  const downloads: Uint8Array[] = [];

  function reject(message: string): never {
    violations.push(message);
    throw new Error(`mockSlack: ${message}`);
  }

  function takeQueued<T>(queue: Map<string, T[]>, method: string): T | undefined {
    const pending = queue.get(method);
    if (pending === undefined || pending.length === 0) return undefined;
    return pending.shift();
  }

  function describeStubbed(): string {
    const declared = [...stubs.keys()].sort();
    return declared.length === 0
      ? "no methods are stubbed on this double"
      : `stubbed methods: ${declared.join(", ")}`;
  }

  function answer(method: string, body: Record<string, unknown>): Record<string, unknown> {
    const stub = stubs.get(method);
    if (stub === undefined) {
      reject(
        `${method} was called but never stubbed. ` +
          `Declare it with slack.allow("${method}").andReturn(...) — ${describeStubbed()}.`,
      );
    }

    if (stub.constraint !== undefined && !matchesConstraint(body, stub.constraint)) {
      reject(
        `${method} was called with arguments the stub does not accept.\n` +
          `  expected to include: ${JSON.stringify(stub.constraint)}\n` +
          `  actual body:         ${JSON.stringify(body)}`,
      );
    }

    if (stub.httpFailure !== undefined) throw new HttpFailureSignal(stub.httpFailure);
    if (stub.failure !== undefined) return { ok: false, error: stub.failure };
    if (stub.respond !== undefined) return asRecord(stub.respond(body));

    if (stub.sequence) {
      const next = stub.responses.shift();
      if (next === undefined) {
        reject(`${method} was called more times than andReturnEach declared responses for.`);
      }
      return asRecord(next);
    }

    const only = stub.responses[0];
    if (only === undefined) {
      reject(`${method} is stubbed but no response was declared for it.`);
    }
    return asRecord(only);
  }

  const fetchImpl: typeof globalThis.fetch = async (target, init) => {
    const request = target instanceof Request ? target : undefined;
    const url = request?.url ?? String(target);
    const headers = new Headers(request?.headers ?? init?.headers ?? {});
    const contentType = headers.get("content-type");
    const httpMethod = (request?.method ?? init?.method ?? "GET").toUpperCase();
    const rawBody = request === undefined ? init?.body : await request.clone().text();

    const uploadTicket = matchPath(url, `${origin}/files/upload/`);
    if (uploadTicket !== undefined) {
      calls.push({ method: "files.upload", url, body: undefined, contentType });
      requireBearer("files.upload", headers);
      const failure = takeQueued(failNextHttpQueue, "files.upload");
      if (failure !== undefined) return httpFailureResponse(failure);
      uploads.push(await toBytes(request === undefined ? init?.body : request.clone().body));
      return new Response("OK", { status: 200 });
    }

    const downloadPath = matchPath(url, `${origin}/files/`);
    if (downloadPath !== undefined) {
      calls.push({ method: "files.download", url, body: undefined, contentType });
      requireBearer("files.download", headers);
      const failure = takeQueued(failNextHttpQueue, "files.download");
      if (failure !== undefined) return httpFailureResponse(failure);
      const bytes = downloads.shift();
      if (bytes === undefined) {
        reject(
          `a url_private download of ${url} was attempted but no bytes were declared. ` +
            `Declare them with slack.allowDownload(bytes).`,
        );
      }
      return new Response(bytes, { status: 200 });
    }

    if (!url.startsWith(base)) {
      reject(`request to ${url} does not target the configured base ${base}`);
    }
    const method = url.slice(base.length);
    const body = decodeSlackApiBody(rawBody, contentType);
    calls.push({ method, url, body, contentType });

    if (httpMethod !== "POST") reject(`${method} was sent as ${httpMethod}, Slack requires POST`);
    requireBearer(method, headers);
    requireEncoding(method, contentType);

    const queuedHttp = takeQueued(failNextHttpQueue, method);
    if (queuedHttp !== undefined) return httpFailureResponse(queuedHttp);
    const queuedFailure = takeQueued(failNextQueue, method);
    if (queuedFailure !== undefined) {
      return jsonResponse({ ok: false, error: queuedFailure });
    }

    try {
      return jsonResponse(answer(method, asRecord(body)));
    } catch (error) {
      if (error instanceof HttpFailureSignal) return httpFailureResponse(error.failure);
      throw error;
    }
  };

  function requireBearer(method: string, headers: Headers): void {
    const authorization = headers.get("authorization") ?? "";
    if (!/^Bearer \S/.test(authorization)) {
      reject(`${method} carried no bearer token (authorization: ${JSON.stringify(authorization)})`);
    }
  }

  function requireEncoding(method: string, contentType: string | null): void {
    const expected = JSON_METHODS.has(method)
      ? ["application/x-www-form-urlencoded", "application/json"]
      : ["application/x-www-form-urlencoded"];
    if (expected.some((candidate) => contentType?.includes(candidate) === true)) return;
    reject(
      `${method} was sent as ${JSON.stringify(contentType)}; Slack's JSON support is partial, ` +
        `so eve form-encodes everything except ${[...JSON_METHODS].join(", ")}`,
    );
  }

  function stubFor(method: string): StubState {
    const existing = stubs.get(method);
    if (existing !== undefined) return existing;
    const created: StubState = { responses: [], sequence: false };
    stubs.set(method, created);
    return created;
  }

  return {
    fetch: fetchImpl,
    url: base,
    calls,
    violations,
    callsTo(method) {
      return calls.filter((call) => call.method === method);
    },
    bodyOf(method, index = 0) {
      const matching = calls.filter((call) => call.method === method);
      const call = matching[index];
      if (call === undefined) {
        throw new Error(
          `mockSlack: expected at least ${index + 1} call(s) to ${method}, saw ${matching.length}. ` +
            `Observed methods: ${[...new Set(calls.map((entry) => entry.method))].join(", ") || "none"}.`,
        );
      }
      return asRecord(call.body);
    },
    observedMethods() {
      return [...new Set(calls.map((call) => call.method))];
    },
    allow(method) {
      const state = stubFor(method);
      const stub: MockSlackStub<typeof method> = {
        // Each of these three replaces the others: the last declaration
        // for a method wins, rather than an earlier one shadowing it.
        andReturn(response) {
          state.responses = [response];
          state.sequence = false;
          state.respond = undefined;
          return stub;
        },
        andReturnEach(responses) {
          state.responses = [...responses];
          state.sequence = true;
          state.respond = undefined;
          return stub;
        },
        andRespond(respond) {
          state.respond = respond as (body: Record<string, unknown>) => unknown;
          state.responses = [];
          state.sequence = false;
          return stub;
        },
        with(expected) {
          state.constraint = expected as Record<string, unknown>;
          return stub;
        },
        andFail(error) {
          state.failure = error;
          return stub;
        },
        andFailHttp(failure) {
          state.httpFailure = failure;
          return stub;
        },
      };
      return stub;
    },
    allowUncheckedMethod(method, response) {
      const state = stubFor(method);
      state.responses = [response];
      state.sequence = false;
    },
    failNext(method, error) {
      failNextQueue.set(method, [...(failNextQueue.get(method) ?? []), error]);
    },
    failNextHttp(method, failure) {
      failNextHttpQueue.set(method, [...(failNextHttpQueue.get(method) ?? []), failure]);
    },
    uploadUrl(fileId) {
      return `${origin}/files/upload/${fileId}`;
    },
    downloadUrl(path) {
      return `${origin}/files/${path}`;
    },
    uploadedBytes() {
      return uploads;
    },
    allowDownload(bytes) {
      downloads.push(bytes);
    },
    assertNoViolations() {
      if (violations.length === 0) return;
      throw new Error(`mockSlack observed protocol violations:\n- ${violations.join("\n- ")}`);
    },
  };
}

/** Thrown inside `answer` so `.andFailHttp` reaches the transport layer. */
class HttpFailureSignal extends Error {
  readonly failure: MockSlackHttpFailure;

  constructor(failure: MockSlackHttpFailure) {
    super("mockSlack http failure");
    this.failure = failure;
  }
}

function matchesConstraint(
  body: Record<string, unknown>,
  constraint: Record<string, unknown>,
): boolean {
  return Object.entries(constraint).every(
    ([key, value]) => JSON.stringify(body[key]) === JSON.stringify(value),
  );
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
  const headers = new Headers({ "content-type": "application/json" });
  if (failure.retryAfter !== undefined) {
    headers.set("retry-after", String(failure.retryAfter));
  }
  return new Response(JSON.stringify(failure.body ?? { ok: false }), {
    status: failure.status,
    headers,
  });
}

async function toBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) {
    return new Uint8Array(await new Response(body).arrayBuffer());
  }
  if (typeof body === "string") return new TextEncoder().encode(body);
  return new Uint8Array();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export { SLACK_TRANSPORT_LEGS };
