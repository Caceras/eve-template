/**
 * In-memory Slack workspace behind {@link mockSlackApi}: the messages,
 * files, modals and thread statuses a Slack app can create, and the Web
 * API method dispatch that reads and writes them.
 *
 * Kept separate from the transport so the method semantics can be read
 * without the URL routing, encoding checks and fault injection that wrap
 * them, and so neither half grows into the other.
 */

/**
 * Canned response for a raw Web API method: either a fixed Slack envelope
 * or a function of the decoded request body.
 */
export type MockSlackMethodHandler =
  | Readonly<Record<string, unknown>>
  | ((body: Record<string, unknown>) => Readonly<Record<string, unknown>>);

/** A message the fake holds for a channel. */
export interface MockSlackMessage {
  readonly channel: string;
  readonly ts: string;
  /** Thread root this message replies to, or `undefined` at channel level. */
  readonly threadTs: string | undefined;
  readonly text: string;
  /** Recipient of an ephemeral message; `undefined` for a visible one. */
  readonly user: string | undefined;
  /** Ephemerals are delivered but never appear in conversations history. */
  readonly ephemeral: boolean;
  /** The message as Slack would return it from `conversations.replies`. */
  readonly raw: Record<string, unknown>;
}

/** A file moving through the three-step external upload handshake. */
export interface MockSlackUploadedFile {
  readonly id: string;
  readonly filename: string;
  readonly title: string | undefined;
  /** Bytes received on the upload POST; empty until that leg runs. */
  readonly bytes: Uint8Array;
  /** Byte length Slack was told to expect by `files.getUploadURLExternal`. */
  readonly expectedLength: number;
  /** Set once `files.completeUploadExternal` accepts the file. */
  readonly completed: boolean;
  readonly channelId: string | undefined;
  readonly threadTs: string | undefined;
  readonly initialComment: string | undefined;
  /** Authenticated download URL, answered by {@link MockSlackApi.fetch}. */
  readonly urlPrivate: string;
}

/** A modal opened through `views.open` and possibly revised by `views.update`. */
export interface MockSlackView {
  readonly id: string;
  readonly triggerId: string | undefined;
  readonly interactivityPointer: string | undefined;
  readonly view: unknown;
}

/** The latest assistant-thread status written for one thread. */
export interface MockSlackThreadStatus {
  readonly channelId: string;
  readonly threadTs: string;
  readonly status: string;
  readonly loadingMessages: readonly string[] | undefined;
}

/** Declarative description of the workspace's starting identity and fixtures. */
export interface MockSlackWorkspaceInput {
  /** Normalized Slack Web API base the workspace is reachable on. */
  readonly url: string;
  readonly teamId: string;
  readonly botUserId: string;
  readonly botId: string;
  readonly appId: string;
  readonly users: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
  readonly conversations: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
  readonly repliesPageSize: number | undefined;
  readonly methods: Readonly<Record<string, MockSlackMethodHandler>> | undefined;
}

/** The workspace surface {@link mockSlackApi} drives and exposes. */
export interface MockSlackWorkspace {
  /** Answers one Slack Web API method out of workspace state. */
  call(method: string, body: Record<string, unknown>): Record<string, unknown>;
  /** Stores the bytes of an upload leg, or `false` for an unknown ticket. */
  receiveUpload(ticket: string, bytes: Uint8Array): boolean;
  /** The file a `url_private` URL resolves to, if the workspace holds one. */
  fileAt(url: string): MockSlackUploadedFile | undefined;
  readonly messages: readonly MockSlackMessage[];
  readonly files: readonly MockSlackUploadedFile[];
  readonly views: readonly MockSlackView[];
  readonly statuses: readonly MockSlackThreadStatus[];
  directMessageChannel(userId: string): string;
  seedMessage(channelId: string, raw: Readonly<Record<string, unknown>>): MockSlackMessage;
  respondWith(method: string, handler: MockSlackMethodHandler): void;
  /**
   * Makes `conversations.replies` hand back the same `next_cursor`
   * forever, the degenerate paging eve's recovery loop guards against.
   */
  loopRepliesCursor(cursor: string): void;
}

/** Builds the in-memory workspace. */
export function createMockSlackWorkspace(input: MockSlackWorkspaceInput): MockSlackWorkspace {
  const origin = new URL(input.url).origin;
  const { appId, botId, botUserId, teamId } = input;
  const messages: MockSlackMessage[] = [];
  const uploads = new Map<string, MockSlackUploadedFile>();
  const uploadTickets = new Map<string, string>();
  const views: MockSlackView[] = [];
  const statuses = new Map<string, MockSlackThreadStatus>();
  const directMessageChannels = new Map<string, string>();
  const handlers = new Map<string, MockSlackMethodHandler>(Object.entries(input.methods ?? {}));
  let loopedRepliesCursor: string | undefined;
  let sequence = 0;

  /**
   * Allocates a monotonic Slack `ts`. Slack's `ts` is an ordering key as
   * well as an identity, so the fake keeps it strictly increasing and
   * lexicographically sortable.
   */
  function nextTs(): string {
    sequence += 1;
    return `${1700000000 + sequence}.${String(sequence).padStart(6, "0")}`;
  }

  function record(message: MockSlackMessage): MockSlackMessage {
    messages.push(message);
    return message;
  }

  function findMessage(channel: string, ts: string): MockSlackMessage | undefined {
    return messages.find((message) => message.channel === channel && message.ts === ts);
  }

  function replaceMessage(previous: MockSlackMessage, next: MockSlackMessage): MockSlackMessage {
    messages.splice(messages.indexOf(previous), 1, next);
    return next;
  }

  function buildMessage(
    channel: string,
    body: Record<string, unknown>,
    overrides: { readonly ts?: string; readonly ephemeral?: boolean; readonly user?: string } = {},
  ): MockSlackMessage {
    const ts = overrides.ts ?? nextTs();
    const threadTs = stringOrUndefined(body.thread_ts);
    const text = resolveText(body);
    const raw: Record<string, unknown> = {
      app_id: appId,
      bot_id: botId,
      text,
      ts,
      user: botUserId,
    };
    if (threadTs !== undefined) raw.thread_ts = threadTs;
    for (const key of ["blocks", "markdown_text", "metadata", "attachments", "chunks"]) {
      if (body[key] !== undefined) raw[key] = body[key];
    }
    return {
      channel,
      ts,
      threadTs,
      text,
      user: overrides.user,
      ephemeral: overrides.ephemeral === true,
      raw,
    };
  }

  /**
   * Answers a Slack Web API method out of workspace state. Returning a
   * `{ ok: false }` envelope here is a normal Slack response; throwing is
   * reserved for protocol violations the transport must never produce.
   */
  function callMethod(method: string, body: Record<string, unknown>): Record<string, unknown> {
    switch (method) {
      case "auth.test":
        return {
          ok: true,
          app_id: appId,
          bot_id: botId,
          team: teamId,
          team_id: teamId,
          url: `${origin}/`,
          user: "eve",
          user_id: botUserId,
        };

      case "chat.postMessage": {
        const channel = stringOrUndefined(body.channel);
        if (channel === undefined) return { ok: false, error: "channel_not_found" };
        const message = record(buildMessage(channel, body));
        return { ok: true, channel, ts: message.ts, message: message.raw };
      }

      case "chat.postEphemeral": {
        const channel = stringOrUndefined(body.channel);
        if (channel === undefined) return { ok: false, error: "channel_not_found" };
        const user = stringOrUndefined(body.user);
        if (user === undefined) return { ok: false, error: "user_not_found" };
        const message = record(buildMessage(channel, body, { ephemeral: true, user }));
        return { ok: true, channel, message_ts: message.ts };
      }

      case "chat.update": {
        const channel = stringOrUndefined(body.channel);
        const ts = stringOrUndefined(body.ts);
        if (channel === undefined || ts === undefined) {
          return { ok: false, error: "message_not_found" };
        }
        const previous = findMessage(channel, ts);
        if (previous === undefined) return { ok: false, error: "message_not_found" };
        const next = replaceMessage(previous, {
          ...previous,
          text: resolveText(body),
          raw: { ...previous.raw, ...updatableFields(body), text: resolveText(body) },
        });
        return { ok: true, channel, ts, text: next.text, message: next.raw };
      }

      case "chat.delete": {
        const channel = stringOrUndefined(body.channel);
        const ts = stringOrUndefined(body.ts);
        if (channel === undefined || ts === undefined) {
          return { ok: false, error: "message_not_found" };
        }
        const previous = findMessage(channel, ts);
        if (previous === undefined) return { ok: false, error: "message_not_found" };
        messages.splice(messages.indexOf(previous), 1);
        return { ok: true, channel, ts };
      }

      case "chat.getPermalink": {
        const channel = stringOrUndefined(body.channel);
        const ts = stringOrUndefined(body.message_ts);
        if (channel === undefined || ts === undefined) {
          return { ok: false, error: "message_not_found" };
        }
        if (findMessage(channel, ts) === undefined) {
          return { ok: false, error: "message_not_found" };
        }
        return {
          ok: true,
          channel,
          permalink: `${origin}/archives/${channel}/p${ts.replace(".", "")}`,
        };
      }

      case "chat.startStream": {
        const channel = stringOrUndefined(body.channel);
        if (channel === undefined) return { ok: false, error: "channel_not_found" };
        const message = record(buildMessage(channel, body));
        return { ok: true, channel, ts: message.ts };
      }

      case "chat.appendStream":
      case "chat.stopStream": {
        const channel = stringOrUndefined(body.channel);
        const ts = stringOrUndefined(body.ts);
        if (channel === undefined || ts === undefined) {
          return { ok: false, error: "message_not_found" };
        }
        const previous = findMessage(channel, ts);
        if (previous === undefined) return { ok: false, error: "message_not_found" };
        if (method === "chat.appendStream") {
          const chunks = [...asArray(previous.raw.chunks), ...asArray(body.chunks)];
          replaceMessage(previous, { ...previous, raw: { ...previous.raw, chunks } });
        } else {
          replaceMessage(previous, { ...previous, raw: { ...previous.raw, streaming: false } });
        }
        return { ok: true, channel, ts };
      }

      case "conversations.open": {
        const users = stringOrUndefined(body.users);
        if (users === undefined) return { ok: false, error: "user_not_found" };
        return { ok: true, channel: { id: directMessageChannel(users) } };
      }

      case "conversations.info": {
        const channel = stringOrUndefined(body.channel);
        const known = channel === undefined ? undefined : input.conversations?.[channel];
        if (channel === undefined || known === undefined) {
          return { ok: false, error: "channel_not_found" };
        }
        return { ok: true, channel: { id: channel, ...known } };
      }

      case "conversations.replies":
        return replies(body);

      case "conversations.history": {
        const channel = stringOrUndefined(body.channel);
        if (channel === undefined) return { ok: false, error: "channel_not_found" };
        const history = messages
          .filter((message) => message.channel === channel && !message.ephemeral)
          .map((message) => message.raw);
        return { ok: true, has_more: false, messages: [...history].reverse() };
      }

      case "assistant.threads.setStatus": {
        const channelId = stringOrUndefined(body.channel_id);
        const threadTs = stringOrUndefined(body.thread_ts);
        if (channelId === undefined || threadTs === undefined) {
          return { ok: false, error: "invalid_arguments" };
        }
        statuses.set(`${channelId}:${threadTs}`, {
          channelId,
          threadTs,
          status: typeof body.status === "string" ? body.status : "",
          loadingMessages: Array.isArray(body.loading_messages)
            ? body.loading_messages.map(String)
            : undefined,
        });
        return { ok: true };
      }

      case "views.open": {
        const triggerId = stringOrUndefined(body.trigger_id);
        const interactivityPointer = stringOrUndefined(body.interactivity_pointer);
        if (triggerId === undefined && interactivityPointer === undefined) {
          return { ok: false, error: "invalid_arguments" };
        }
        const id = `V${String(views.length + 1).padStart(6, "0")}`;
        const view = { ...asRecord(body.view), id, state: { values: {} } };
        views.push({ id, triggerId, interactivityPointer, view });
        return { ok: true, view };
      }

      case "views.update": {
        const viewId = stringOrUndefined(body.view_id);
        const index = views.findIndex((candidate) => candidate.id === viewId);
        if (index === -1) return { ok: false, error: "not_found" };
        const view = { ...asRecord(body.view), id: viewId, state: { values: {} } };
        views.splice(index, 1, { ...views[index]!, view });
        return { ok: true, view };
      }

      case "files.getUploadURLExternal":
        return getUploadUrl(body);

      case "files.completeUploadExternal":
        return completeUpload(body);

      case "users.info": {
        const user = stringOrUndefined(body.user);
        const known = user === undefined ? undefined : input.users?.[user];
        if (user === undefined || known === undefined) {
          return { ok: false, error: "user_not_found" };
        }
        return { ok: true, user: { id: user, ...known } };
      }

      default: {
        const handler = handlers.get(method);
        if (handler === undefined) {
          // Fail closed: an unhandled method is a gap in the fake or an
          // unintended call, and a blanket `ok: true` would hide both.
          return { ok: false, error: "unknown_method" };
        }
        return { ...(typeof handler === "function" ? handler(body) : handler) };
      }
    }
  }

  function replies(body: Record<string, unknown>): Record<string, unknown> {
    const channel = stringOrUndefined(body.channel);
    const rootTs = stringOrUndefined(body.ts);
    if (channel === undefined || rootTs === undefined) {
      return { ok: false, error: "invalid_arguments" };
    }
    const thread = messages.filter(
      (message) =>
        message.channel === channel &&
        !message.ephemeral &&
        (message.ts === rootTs || message.threadTs === rootTs),
    );
    if (thread.length === 0) return { ok: false, error: "thread_not_found" };

    const requested = typeof body.limit === "number" ? body.limit : Number(body.limit ?? 100);
    const pageSize = Math.max(
      1,
      Math.min(Number.isFinite(requested) ? requested : 100, input.repliesPageSize ?? Infinity),
    );
    const offset = decodeCursor(stringOrUndefined(body.cursor));
    const page = thread.slice(offset, offset + pageSize);
    const nextOffset = offset + page.length;
    const nextCursor =
      loopedRepliesCursor ?? (nextOffset < thread.length ? encodeCursor(nextOffset) : "");
    return {
      ok: true,
      has_more: nextCursor !== "",
      messages: page.map((message) => message.raw),
      response_metadata: { next_cursor: nextCursor },
    };
  }

  function getUploadUrl(body: Record<string, unknown>): Record<string, unknown> {
    const filename = stringOrUndefined(body.filename) ?? "upload.bin";
    const id = `F${uploads.size + 1}`;
    const ticket = `u${uploads.size + 1}`;
    uploadTickets.set(ticket, id);
    uploads.set(id, {
      id,
      filename,
      title: undefined,
      bytes: new Uint8Array(),
      expectedLength: Number(body.length ?? 0),
      completed: false,
      channelId: undefined,
      threadTs: undefined,
      initialComment: undefined,
      urlPrivate: `${origin}/files/${id}/${filename}`,
    });
    return { ok: true, file_id: id, upload_url: `${origin}/files/upload/${ticket}` };
  }

  function completeUpload(body: Record<string, unknown>): Record<string, unknown> {
    const requested = asArray(body.files).map((entry) => asRecord(entry));
    if (requested.length === 0) return { ok: false, error: "invalid_arguments" };

    const channelId = stringOrUndefined(body.channel_id);
    const threadTs = stringOrUndefined(body.thread_ts);
    const initialComment = stringOrUndefined(body.initial_comment);
    const completed: MockSlackUploadedFile[] = [];
    for (const entry of requested) {
      const id = stringOrUndefined(entry.id);
      const staged = id === undefined ? undefined : uploads.get(id);
      // Slack cannot complete an upload whose bytes never landed, and a
      // channel that skipped the POST leg has a real bug.
      if (staged === undefined || staged.bytes.byteLength === 0) {
        return { ok: false, error: "file_not_found" };
      }
      const file: MockSlackUploadedFile = {
        ...staged,
        title: stringOrUndefined(entry.title) ?? staged.filename,
        completed: true,
        channelId,
        threadTs,
        initialComment,
      };
      uploads.set(file.id, file);
      completed.push(file);
    }

    // Slack shares completed files as a message in the target thread, which
    // is what makes a `{ text, files }` post a single visible message.
    if (channelId !== undefined) {
      const message = buildMessage(channelId, { text: initialComment ?? "", thread_ts: threadTs });
      message.raw.files = completed.map((file) => fileRecord(file));
      record(message);
    }

    return { ok: true, files: completed.map((file) => ({ id: file.id, title: file.title })) };
  }

  function fileRecord(file: MockSlackUploadedFile): Record<string, unknown> {
    return {
      id: file.id,
      name: file.filename,
      size: file.bytes.byteLength,
      title: file.title,
      url_private: file.urlPrivate,
    };
  }

  function directMessageChannel(userId: string): string {
    const existing = directMessageChannels.get(userId);
    if (existing !== undefined) return existing;
    const id = `D${String(directMessageChannels.size + 1).padStart(6, "0")}`;
    directMessageChannels.set(userId, id);
    return id;
  }

  return {
    call: callMethod,
    messages,
    views,
    get files() {
      return [...uploads.values()];
    },
    get statuses() {
      return [...statuses.values()];
    },
    directMessageChannel,
    receiveUpload(ticket, bytes) {
      const fileId = uploadTickets.get(ticket);
      const staged = fileId === undefined ? undefined : uploads.get(fileId);
      if (staged === undefined) return false;
      uploads.set(staged.id, { ...staged, bytes });
      return true;
    },
    fileAt(url) {
      return [...uploads.values()].find((candidate) => candidate.urlPrivate === url);
    },
    seedMessage(channelId, raw) {
      const ts = stringOrUndefined(raw.ts) ?? nextTs();
      const message: MockSlackMessage = {
        channel: channelId,
        ts,
        threadTs: stringOrUndefined(raw.thread_ts),
        text: typeof raw.text === "string" ? raw.text : "",
        user: undefined,
        ephemeral: false,
        raw: { ...raw, ts },
      };
      messages.push(message);
      return message;
    },
    respondWith(method, handler) {
      handlers.set(method, handler);
    },
    loopRepliesCursor(cursor) {
      loopedRepliesCursor = cursor;
    },
  };
}

/**
 * Slack renders `markdown_text` into `text`, so the fake resolves one
 * stored text per message and tests can assert on it whichever surface
 * produced it.
 */
function resolveText(body: Record<string, unknown>): string {
  for (const key of ["text", "markdown_text"]) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function updatableFields(body: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of ["blocks", "markdown_text", "metadata", "attachments"]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
}

function encodeCursor(offset: number): string {
  return `cursor:${offset}`;
}

function decodeCursor(cursor: string | undefined): number {
  const offset = cursor === undefined ? 0 : Number(cursor.replace("cursor:", ""));
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
