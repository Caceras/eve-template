import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Card, CardText } from "#compiled/chat/index.js";
import { mockSlackApi, type MockSlackApi } from "#internal/testing/mocks/mock-slack-api.js";
import { buildSlackBinding, buildSlackWorkspaceHandle } from "#public/channels/slack/api.js";
import {
  callSlackApi,
  callSlackApiJson,
  resolveSlackApiUrl,
  resolveSlackBotToken,
  SlackApiError,
  type SlackBotTokenContext,
} from "#public/channels/slack/api-transport.js";

/** Thread root every refresh test hangs its replies off. */
const THREAD_TS = "1700000000.000001";

describe("callSlackApi encoding", () => {
  // Slack accepts form encoding on every endpoint but JSON on only a
  // subset (conversations.replies rejects JSON). Lock in form so the
  // partial-JSON endpoints don't silently break again.
  it("sends every Slack API call as application/x-www-form-urlencoded", async () => {
    const slack = mockSlackApi();

    for (const operation of [
      "conversations.replies",
      "conversations.history",
      "chat.postMessage",
      "chat.postEphemeral",
      "files.getUploadURLExternal",
      "files.completeUploadExternal",
      "assistant.threads.setStatus",
    ]) {
      await callSlackApi({
        botToken: "xoxb-test",
        operation,
        body: { channel: "C01", ts: THREAD_TS },
        fetch: slack.fetch,
      });
    }

    expect(slack.calls).toHaveLength(7);
    for (const call of slack.calls) {
      expect(call.contentType).toBe("application/x-www-form-urlencoded");
    }
    // The fake rejects an unencoded or unsigned call outright, so a
    // regression surfaces here even for a method added later.
    slack.assertNoViolations();
  });
});

describe("SlackHandle.uploadFiles", () => {
  let slack: MockSlackApi;

  beforeEach(() => {
    slack = mockSlackApi();
  });

  it("runs the 3-step Slack upload flow per file", async () => {
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: "T01",
    });

    const bytes = new TextEncoder().encode("hello,world\n1,2\n").buffer as ArrayBuffer;

    const result = await binding.slack.uploadFiles(
      [{ data: bytes, filename: "report.csv", mimeType: "text/csv" }],
      { initialComment: "*Report*" },
    );

    expect(result.fileIds).toEqual(["F1"]);

    expect(slack.calls.map((call) => call.method)).toEqual([
      "files.getUploadURLExternal",
      "files.upload",
      "files.completeUploadExternal",
    ]);

    const getUrlBody = slack.calls[0]!.body as { filename: string; length: string };
    expect(getUrlBody.filename).toBe("report.csv");
    expect(getUrlBody.length).toBe(String(bytes.byteLength));

    expect(slack.calls[1]!.contentType).toBe("application/octet-stream");

    const completeBody = slack.calls[2]!.body as {
      channel_id: string;
      thread_ts: string;
      initial_comment: string;
      files: { id: string; title: string }[];
    };
    expect(completeBody.channel_id).toBe("C01");
    expect(completeBody.thread_ts).toBe("1.0");
    expect(completeBody.initial_comment).toBe("*Report*");
    expect(completeBody.files).toEqual([{ id: "F1", title: "report.csv" }]);

    // The handshake only coheres if the bytes Slack was promised are the
    // bytes it received and the file ended up attached to the thread.
    expect(slack.files()).toEqual([
      expect.objectContaining({
        id: "F1",
        filename: "report.csv",
        bytes: new Uint8Array(bytes),
        completed: true,
        channelId: "C01",
        threadTs: "1.0",
        initialComment: "*Report*",
      }),
    ]);
  });

  it("returns an empty result for zero files", async () => {
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    const result = await binding.slack.uploadFiles([]);
    expect(result.fileIds).toEqual([]);
    expect(slack.calls).toEqual([]);
  });

  it("accepts options.channelId and options.threadTs overrides", async () => {
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await binding.slack.uploadFiles([{ data: Buffer.from([1, 2, 3]), filename: "x.bin" }], {
      channelId: "CXYZ",
      threadTs: "9.9",
    });

    const completeBody = slack.calls.at(-1)!.body as {
      channel_id: string;
      thread_ts: string;
    };
    expect(completeBody.channel_id).toBe("CXYZ");
    expect(completeBody.thread_ts).toBe("9.9");
    expect(slack.files()[0]).toMatchObject({ channelId: "CXYZ", threadTs: "9.9" });
    expect(slack.messages({ channelId: "CXYZ", threadTs: "9.9" })).toHaveLength(1);
  });

  it("propagates errors from files.getUploadURLExternal", async () => {
    slack.failNext("files.getUploadURLExternal", "rate_limited");
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await expect(
      binding.slack.uploadFiles([{ data: Buffer.from([1]), filename: "x.bin" }]),
    ).rejects.toThrow("rate_limited");
    expect(slack.files()).toEqual([]);
  });

  it("propagates an HTTP rate limit as a SlackApiError carrying the status", async () => {
    slack.failNextHttp("files.getUploadURLExternal", { status: 429, retryAfter: 30 });
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    const rejection = binding.slack.uploadFiles([{ data: Buffer.from([1]), filename: "x.bin" }]);

    await expect(rejection).rejects.toThrow(SlackApiError);
    await expect(rejection).rejects.toMatchObject({
      method: "files.getUploadURLExternal",
      status: 429,
    });
  });
});

describe("SlackThread.post with files", () => {
  let slack: MockSlackApi;

  beforeEach(() => {
    slack = mockSlackApi();
  });

  it("{ markdown, files } posts markdown before uploading files", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    const posted = await thread.post({
      markdown: [
        "**Report attached**",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        "| Net | +488 |",
      ].join("\n"),
      files: [{ data: Buffer.from([1, 2]), filename: "report.csv", mimeType: "text/csv" }],
    });

    const post = slack.callsTo("chat.postMessage")[0];
    expect(post).toBeDefined();
    expect((post!.body as { markdown_text: string; thread_ts: string }).markdown_text).toContain(
      "| Metric | Value |",
    );
    expect((post!.body as { markdown_text: string; thread_ts: string }).thread_ts).toBe("1.0");

    // The returned id has to name the message Slack actually stored.
    expect(slack.message(posted.id)?.raw.markdown_text).toContain("| Metric | Value |");

    const complete = slack.callsTo("files.completeUploadExternal")[0]!;
    expect((complete.body as { initial_comment?: string }).initial_comment).toBeUndefined();
    expect((complete.body as { channel_id: string; thread_ts: string }).channel_id).toBe("C01");
    expect((complete.body as { channel_id: string; thread_ts: string }).thread_ts).toBe("1.0");
  });

  it("{ text, files } keeps a single Slack upload comment", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.post({
      text: "*Report attached*",
      files: [{ data: Buffer.from([1, 2]), filename: "report.csv", mimeType: "text/csv" }],
    });

    expect(slack.callsTo("chat.postMessage")).toEqual([]);

    const complete = slack.callsTo("files.completeUploadExternal")[0]!;
    expect((complete.body as { initial_comment: string }).initial_comment).toBe(
      "*Report attached*",
    );

    // One visible thread message, carrying both the comment and the file.
    expect(slack.messages({ channelId: "C01" })).toEqual([
      expect.objectContaining({ text: "*Report attached*", threadTs: "1.0" }),
    ]);
  });

  it("{ card, files } posts the card via chat.postMessage and uploads files separately", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.post({
      card: Card({ children: [CardText("Here's the data:")] }),
      files: [{ data: Buffer.from([1]), filename: "report.csv", mimeType: "text/csv" }],
    });

    const post = slack.callsTo("chat.postMessage")[0];
    expect(post).toBeDefined();
    expect((post!.body as { blocks: unknown[] }).blocks).toBeDefined();

    const complete = slack.callsTo("files.completeUploadExternal")[0];
    expect(complete).toBeDefined();
    expect((complete!.body as { initial_comment?: string }).initial_comment).toBeUndefined();
    expect((complete!.body as { channel_id: string; thread_ts: string }).channel_id).toBe("C01");
    expect((complete!.body as { channel_id: string; thread_ts: string }).thread_ts).toBe("1.0");
  });
});

describe("Slack outbound text", () => {
  let slack: MockSlackApi;

  beforeEach(() => {
    slack = mockSlackApi();
  });

  it("preserves literal at-prefixed tokens in markdown and text posts", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });
    const mention = thread.mentionUser("U012ABC456");

    expect(mention).toBe("<@U012ABC456>");
    await thread.post({ markdown: `bump @scope/package and ping ${mention}` });
    await thread.post({ text: "email @support or ping <@U012ABC456>" });

    const posts = slack.callsTo("chat.postMessage");
    expect(posts).toHaveLength(2);
    expect(posts[0]!.body).toMatchObject({
      markdown_text: "bump @scope/package and ping <@U012ABC456>",
    });
    expect(posts[1]!.body).toMatchObject({
      text: "email @support or ping <@U012ABC456>",
    });
    expect(slack.messages({ channelId: "C01" }).map((message) => message.text)).toEqual([
      "bump @scope/package and ping <@U012ABC456>",
      "email @support or ping <@U012ABC456>",
    ]);
  });

  it("preserves literal at-prefixed tokens in file upload comments", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.post({
      text: "report for @scope/package and <@U012ABC456>",
      files: [{ data: Buffer.from([1]), filename: "report.csv", mimeType: "text/csv" }],
    });

    expect(slack.callsTo("files.completeUploadExternal")[0]?.body).toMatchObject({
      initial_comment: "report for @scope/package and <@U012ABC456>",
    });
  });
});

describe("SlackThread.refresh", () => {
  let slack: MockSlackApi;

  /** Seeds the two-message thread most refresh assertions read back. */
  function seedDefaultThread(api: MockSlackApi): void {
    api.seedMessage("C01", {
      text: "Hello from user",
      ts: "1700000000.123456",
      thread_ts: THREAD_TS,
      user: "U01",
      files: [
        {
          id: "F1",
          name: "report.csv",
          mimetype: "text/csv",
          url_private: "https://files.slack.com/a/b/report.csv",
          size: 128,
        },
      ],
    });
    api.seedMessage("C01", {
      text: "Hello from bot",
      ts: "1700000001.000000",
      thread_ts: THREAD_TS,
      bot_id: "B01",
    });
  }

  beforeEach(() => {
    slack = mockSlackApi();
  });

  it("hydrates recent messages with the eve-owned Slack thread shape", async () => {
    seedDefaultThread(slack);
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: undefined,
    });

    await thread.refresh();

    // conversations.replies rejects JSON; lock in the form encoding at
    // the public refresh surface so replies never get silently dropped.
    expect(slack.callsTo("conversations.replies")[0]?.contentType).toBe(
      "application/x-www-form-urlencoded",
    );

    expect(thread.recentMessages).toHaveLength(2);
    expect(thread.recentMessages[0]).toMatchObject({
      text: "Hello from user",
      markdown: "Hello from user",
      user: "U01",
      botId: undefined,
      ts: "1700000000.123456",
      threadTs: THREAD_TS,
      isMe: false,
      raw: { files: [{ id: "F1" }] },
    });
    expect(thread.recentMessages[1]).toMatchObject({
      text: "Hello from bot",
      botId: "B01",
      ts: "1700000001.000000",
      threadTs: THREAD_TS,
      isMe: false,
    });

    const firstMessage = thread.recentMessages[0]!;
    expect("id" in firstMessage).toBe(false);
    expect("attachments" in firstMessage).toBe(false);
    expect("author" in firstMessage).toBe(false);
    expect("metadata" in firstMessage).toBe(false);
  });

  it("extracts Block Kit and legacy attachment content for text-less replies", async () => {
    slack.seedMessage("C01", {
      text: "",
      ts: "1700000000.123456",
      thread_ts: THREAD_TS,
      bot_id: "B01",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "*Alert:* Service latency is high" } },
        { type: "section", fields: [{ type: "mrkdwn", text: "Region: us-east-1" }] },
      ],
      attachments: [{ title: "Runbook", text: "Restart the pods." }],
    });

    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: undefined,
    });

    await thread.refresh();

    const message = thread.recentMessages[0]!;
    expect(message.markdown).toContain("Service latency is high");
    expect(message.markdown).toContain("Region: us-east-1");
    expect(message.markdown).toContain("Runbook");
    expect(message.markdown).toContain("Restart the pods.");
  });

  it("survives rich_text links whose URLs contain Slack control characters", async () => {
    slack.seedMessage("C01", {
      text: "plain reply",
      ts: "1700000000.123456",
      thread_ts: THREAD_TS,
      user: "U01",
    });
    slack.seedMessage("C01", {
      text: "",
      ts: "1700000000.123457",
      thread_ts: THREAD_TS,
      bot_id: "B01",
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "link", url: "https://example.com/?q=a|b", text: "incident link" },
              ],
            },
          ],
        },
      ],
    });

    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: undefined,
    });

    await thread.refresh();

    expect(thread.recentMessages).toHaveLength(2);
    expect(thread.recentMessages[0]?.markdown).toBe("plain reply");
    expect(thread.recentMessages[1]?.markdown).toContain("incident link");
    expect(thread.recentMessages[1]?.markdown).toContain("https://example.com/?q=a|b");
  });

  it("shares one conversations.replies request across overlapping refreshes", async () => {
    slack.seedMessage("C01", { text: "loaded once", ts: "1.0", user: "U01" });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Holding the reply in flight is what makes the overlap observable;
    // the workspace behind it stays the real one.
    const gatedFetch: typeof globalThis.fetch = async (target, init) => {
      if (String(target).endsWith("conversations.replies")) await gate;
      return slack.fetch(target, init);
    };
    const { thread } = buildSlackBinding({
      api: { fetch: gatedFetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    const first = thread.refresh();
    const second = thread.refresh();

    expect(second).toBe(first);
    expect(slack.calls).toEqual([]);

    release();
    await Promise.all([first, second]);

    expect(slack.callsTo("conversations.replies")).toHaveLength(1);
    expect(thread.recentMessages).toHaveLength(1);
  });

  it("starts a new request after the previous refresh completes", async () => {
    slack.seedMessage("C01", { text: "root", ts: "1.0", user: "U01" });
    slack.seedMessage("C01", { text: "reply", ts: "1.1", thread_ts: "1.0", user: "U02" });
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.refresh();
    const firstSnapshot = thread.recentMessages;
    await thread.refresh();

    expect(slack.callsTo("conversations.replies")).toHaveLength(2);
    expect(thread.recentMessages).not.toBe(firstSnapshot);
    expect(firstSnapshot).toHaveLength(2);
  });

  it("preserves loaded messages when a later refresh fails", async () => {
    slack.seedMessage("C01", { text: "root", ts: "1.0", user: "U01" });
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });
    await thread.refresh();
    const loadedMessages = [...thread.recentMessages];
    slack.failNextHttp("conversations.replies", { status: 500 });

    await thread.refresh();

    expect(thread.recentMessages).toEqual(loadedMessages);
  });

  it("marks only replies from the bound Slack app as mine", async () => {
    slack.seedMessage("C01", {
      app_id: "A_SELF",
      bot_id: "B_SELF",
      text: "own user-attributed reply",
      thread_ts: "1.0",
      ts: "1.1",
      user: "U_SELF",
    });
    slack.seedMessage("C01", {
      app_id: "A_OTHER",
      bot_id: "B_OTHER",
      text: "other bot reply",
      thread_ts: "1.0",
      ts: "1.2",
      user: "U_OTHER",
    });
    slack.seedMessage("C01", {
      app_id: "A_SELF",
      bot_id: "B_SELF",
      text: "own app-attributed reply",
      thread_ts: "1.0",
      ts: "1.3",
    });
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      appId: "A_SELF",
      botToken: "xoxb-test",
      botUserId: "U_SELF",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.refresh();

    expect(thread.recentMessages.map((message) => message.isMe)).toEqual([true, false, true]);
  });
});

describe("SlackThread.listParticipants", () => {
  it("returns unique human user ids in first-appearance order", async () => {
    const slack = mockSlackApi();
    slack.seedMessage("C01", { text: "root", ts: "1.0", user: "U01" });
    slack.seedMessage("C01", {
      text: "bot reply",
      ts: "1.1",
      thread_ts: "1.0",
      user: "UAPP",
      bot_id: "B01",
    });
    slack.seedMessage("C01", { text: "second person", ts: "1.2", thread_ts: "1.0", user: "U02" });
    slack.seedMessage("C01", { text: "starter again", ts: "1.3", thread_ts: "1.0", user: "U01" });
    slack.seedMessage("C01", { text: "system message", ts: "1.4", thread_ts: "1.0" });
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await expect(thread.listParticipants()).resolves.toEqual(["U01", "U02"]);

    expect(thread.recentMessages).toHaveLength(5);
    expect(slack.callsTo("conversations.replies")).toHaveLength(1);
  });
});

describe("SlackThread.postEphemeral", () => {
  it("posts via chat.postEphemeral with user / channel / thread_ts", async () => {
    const slack = mockSlackApi();
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.postEphemeral("U99", { text: "psst" });

    const call = slack.callsTo("chat.postEphemeral")[0];
    expect(call).toBeDefined();
    const body = call!.body as { user: string; channel: string; thread_ts: string; text: string };
    expect(body.user).toBe("U99");
    expect(body.channel).toBe("C01");
    expect(body.thread_ts).toBe("1.0");
    expect(body.text).toBe("psst");

    // Ephemerals are delivered to one user and never enter the thread.
    expect(slack.messages({ ephemeral: true })).toEqual([
      expect.objectContaining({ channel: "C01", text: "psst", user: "U99" }),
    ]);
    expect(slack.messages({ ephemeral: false })).toEqual([]);
  });
});

describe("SlackThread.postDirectMessage", () => {
  it("opens the IM conversation and posts to it without a thread_ts", async () => {
    const slack = mockSlackApi();
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    const posted = await thread.postDirectMessage("U99", { text: "for your eyes only" });

    const open = slack.callsTo("conversations.open")[0];
    expect(open).toBeDefined();
    expect((open!.body as { users: string }).users).toBe("U99");

    const imChannelId = slack.directMessageChannel("U99");
    const post = slack.callsTo("chat.postMessage")[0];
    expect(post).toBeDefined();
    const body = post!.body as { channel: string; thread_ts?: string; text: string };
    expect(body.channel).toBe(imChannelId);
    expect(body.thread_ts).toBeUndefined();
    expect(body.text).toBe("for your eyes only");
    expect(slack.message(posted.id)).toMatchObject({
      channel: imChannelId,
      text: "for your eyes only",
      threadTs: undefined,
    });
  });
});

describe("auto-anchor on first post", () => {
  let slack: MockSlackApi;

  beforeEach(() => {
    slack = mockSlackApi();
  });

  it("first chat.postMessage on an unanchored binding adopts its own ts as the thread root", async () => {
    const anchors: string[] = [];
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    expect(binding.slack.threadTs).toBe("");

    const first = await binding.thread.post("first reply");

    expect(first.id).toBe(slack.messages()[0]!.ts);
    expect(anchors).toEqual([first.id]);
    expect(binding.slack.threadTs).toBe(first.id);

    // The first post itself lands at the channel root (no thread_ts in body)
    // because the anchor is set AFTER Slack assigns the ts.
    const firstCall = slack.callsTo("chat.postMessage")[0]!;
    expect((firstCall.body as { thread_ts?: string }).thread_ts).toBeUndefined();
    expect(slack.message(first.id)?.threadTs).toBeUndefined();
  });

  it("subsequent posts thread under the anchored ts", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
    });

    const first = await thread.post("first");
    await thread.post("second");
    await thread.post("third");

    const postCalls = slack.callsTo("chat.postMessage");
    expect(postCalls).toHaveLength(3);
    expect((postCalls[0]!.body as { thread_ts?: string }).thread_ts).toBeUndefined();
    expect((postCalls[1]!.body as { thread_ts: string }).thread_ts).toBe(first.id);
    expect((postCalls[2]!.body as { thread_ts: string }).thread_ts).toBe(first.id);
    expect(slack.messages({ threadTs: first.id })).toHaveLength(2);
  });

  it("does not anchor when the binding already has a threadTs", async () => {
    const anchors: string[] = [];
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1700000000.000999",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    await binding.thread.post("hello");

    expect(anchors).toEqual([]);
    expect(binding.slack.threadTs).toBe("1700000000.000999");
  });

  it("does not anchor on postEphemeral", async () => {
    const anchors: string[] = [];
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    await binding.thread.postEphemeral("U99", { text: "psst" });

    expect(anchors).toEqual([]);
    expect(binding.slack.threadTs).toBe("");
  });

  it("anchors before uploading files for a markdown post", async () => {
    const anchors: string[] = [];
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    const posted = await binding.thread.post({
      markdown: "**Report attached**",
      files: [{ data: Buffer.from([1]), filename: "report.csv", mimeType: "text/csv" }],
    });

    expect(anchors).toEqual([posted.id]);
    expect(binding.slack.threadTs).toBe(posted.id);

    const post = slack.callsTo("chat.postMessage")[0]!;
    expect((post.body as { thread_ts?: string }).thread_ts).toBeUndefined();

    const complete = slack.callsTo("files.completeUploadExternal")[0]!;
    expect((complete.body as { thread_ts: string }).thread_ts).toBe(posted.id);
    expect(slack.files()[0]?.threadTs).toBe(posted.id);
  });

  it("does not anchor on an upload-only text/file post", async () => {
    const anchors: string[] = [];
    const binding = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    await binding.thread.post({
      text: "*Report attached*",
      files: [{ data: Buffer.from([1]), filename: "report.csv", mimeType: "text/csv" }],
    });

    expect(anchors).toEqual([]);
    expect(binding.slack.threadTs).toBe("");
  });

  it("enables startTyping after a post anchors the thread", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
    });

    await thread.startTyping("Pre-anchor");
    expect(slack.callsTo("assistant.threads.setStatus")).toEqual([]);

    const anchor = await thread.post("anchor");
    await thread.startTyping("Post-anchor");

    expect(slack.statuses()).toEqual([
      {
        channelId: "C01",
        threadTs: anchor.id,
        status: "Post-anchor",
        loadingMessages: ["Post-anchor"],
      },
    ]);
  });

  it("sends assistant status as plain text", async () => {
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "1.0",
      teamId: undefined,
    });

    await thread.startTyping("**Considering turbo tasks**");

    expect(slack.callsTo("assistant.threads.setStatus")[0]?.body).toMatchObject({
      status: "Considering turbo tasks",
      loading_messages: ["Considering turbo tasks"],
    });
    expect(slack.statuses()[0]).toMatchObject({ status: "Considering turbo tasks" });
  });

  it("invokes onThreadTsChanged exactly once even on concurrent first-posts", async () => {
    const anchors: string[] = [];
    const { thread } = buildSlackBinding({
      api: { fetch: slack.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: "",
      teamId: undefined,
      onThreadTsChanged(ts) {
        anchors.push(ts);
      },
    });

    await Promise.all([thread.post("a"), thread.post("b"), thread.post("c")]);

    expect(anchors).toHaveLength(1);
  });
});

describe("Slack bot token context", () => {
  it("passes explicit identity to a context-aware token provider", async () => {
    const slack = mockSlackApi();
    const botToken = vi.fn((context: SlackBotTokenContext) => {
      expect(context).toEqual({ teamId: "T01" });
      return "xoxb-team-one";
    });

    await callSlackApi({
      botToken,
      context: { teamId: "T01" },
      operation: "auth.test",
      body: {},
      fetch: slack.fetch,
    });

    expect(botToken).toHaveBeenCalledTimes(1);
  });

  it("keeps zero-argument token providers supported", async () => {
    const botToken = vi.fn(() => "xoxb-legacy");

    const token = await resolveSlackBotToken(botToken, { teamId: "T01" });

    expect(token).toBe("xoxb-legacy");
    expect(botToken).toHaveBeenCalledTimes(1);
  });
});

describe("Slack Web API base URL", () => {
  const ORIGINAL_SLACK_API_URL = process.env.SLACK_API_URL;
  /** Workspace on Slack's own host, reached through the global `fetch`. */
  let slackHost: MockSlackApi;

  beforeEach(() => {
    delete process.env.SLACK_API_URL;
    slackHost = mockSlackApi();
    vi.stubGlobal("fetch", slackHost.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_SLACK_API_URL === undefined) delete process.env.SLACK_API_URL;
    else process.env.SLACK_API_URL = ORIGINAL_SLACK_API_URL;
  });

  it("defaults to Slack's own host", () => {
    expect(resolveSlackApiUrl()).toBe("https://slack.com/api/");
    expect(resolveSlackApiUrl({})).toBe("https://slack.com/api/");
  });

  it("normalizes a configured base to a trailing slash so the method is appended", async () => {
    expect(resolveSlackApiUrl({ url: "https://sim.example/api" })).toBe("https://sim.example/api/");
    const simulator = mockSlackApi({ url: "https://sim.example/api" });

    for (const url of ["https://sim.example/api", "https://sim.example/api/"]) {
      await callSlackApiJson({
        api: { url, fetch: simulator.fetch },
        body: {},
        method: "chat.update",
        token: "xoxb",
      });
    }

    expect(simulator.calls.map((call) => call.url)).toEqual([
      "https://sim.example/api/chat.update",
      "https://sim.example/api/chat.update",
    ]);
  });

  it("encodes the JSON-only surfaces as JSON and signs them with the bot token", async () => {
    // Asserts the exact transport headers rather than Slack semantics, so
    // it reads the raw `init` instead of the workspace fake.
    const apiFetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ ok: true }),
    );

    const response = await callSlackApiJson({
      api: { url: "https://sim.example/api", fetch: apiFetch },
      body: { channel: "C01", ts: THREAD_TS, dropped: undefined },
      method: "chat.update",
      token: "xoxb-json",
    });

    expect(response).toEqual({ ok: true });
    expect(slackHost.calls).toEqual([]);
    const [url, init] = apiFetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://sim.example/api/chat.update");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer xoxb-json",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ channel: "C01", ts: THREAD_TS });
  });

  it("raises SlackApiError carrying the method and status on a non-2xx JSON call", async () => {
    const simulator = mockSlackApi({ url: "https://sim.example/api" });
    simulator.failNextHttp("views.open", {
      status: 500,
      body: { ok: false, error: "expired_trigger_id" },
    });

    const rejection = callSlackApiJson({
      api: { url: "https://sim.example/api", fetch: simulator.fetch },
      body: { trigger_id: "T1", view: {} },
      method: "views.open",
      token: "xoxb-json",
    });

    await expect(rejection).rejects.toThrow(SlackApiError);
    await expect(rejection).rejects.toMatchObject({ method: "views.open", status: 500 });
  });

  it("normalizes the parsed pathname rather than the raw string", () => {
    expect(resolveSlackApiUrl({ url: "https://sim.example" })).toBe("https://sim.example/");
    expect(resolveSlackApiUrl({ url: "https://sim.example:8443/nested/api" })).toBe(
      "https://sim.example:8443/nested/api/",
    );
  });

  it("rejects a base URL carrying a query string or fragment", async () => {
    for (const url of ["https://sim.example/api?fixture=demo", "https://sim.example/api#frag"]) {
      expect(() => resolveSlackApiUrl({ url })).toThrow(/query string or fragment/);
      await expect(
        callSlackApiJson({ api: { url }, body: {}, method: "chat.update", token: "xoxb" }),
      ).rejects.toThrow(/query string or fragment/);
      const { thread } = buildSlackBinding({
        api: { url },
        botToken: "xoxb-test",
        channelId: "C01",
        threadTs: THREAD_TS,
        teamId: "T01",
      });
      await expect(thread.post({ text: "hi" })).rejects.toThrow(/query string or fragment/);
    }

    expect(slackHost.calls).toEqual([]);
  });

  it("rejects a relative base URL", () => {
    expect(() => resolveSlackApiUrl({ url: "sim.example/api" })).toThrow(/must be absolute/);
  });

  it("falls back to SLACK_API_URL when no url is configured", () => {
    process.env.SLACK_API_URL = "http://localhost:3000/api/slack";

    expect(resolveSlackApiUrl()).toBe("http://localhost:3000/api/slack/");
    expect(resolveSlackApiUrl({ url: "https://sim.example/api/" })).toBe(
      "https://sim.example/api/",
    );
  });

  it("rejects an invalid SLACK_API_URL the same way", () => {
    process.env.SLACK_API_URL = "https://env.example/api?fixture=demo";

    expect(() => resolveSlackApiUrl()).toThrow(/query string or fragment/);
  });

  it("keeps the default host for every binding call when nothing is configured", async () => {
    const binding = buildSlackBinding({
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: "T01",
    });

    await binding.thread.post({ text: "hi" });
    await binding.thread.startTyping("Thinking...");
    await binding.slack.request("auth.test", {});

    // The fake answers only on its own base, so landing these calls at all
    // is itself the assertion that they went to Slack's host.
    expect(slackHost.calls.map((call) => call.url)).toEqual([
      "https://slack.com/api/chat.postMessage",
      "https://slack.com/api/assistant.threads.setStatus",
      "https://slack.com/api/auth.test",
    ]);
  });

  it("routes every binding call through a configured api.url and api.fetch", async () => {
    const simulator = mockSlackApi({ url: "https://sim.example/api" });
    simulator.seedMessage("C01", { text: "root", ts: THREAD_TS, user: "U01" });
    const binding = buildSlackBinding({
      api: { url: "https://sim.example/api", fetch: simulator.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: "T01",
    });

    await binding.thread.post({ text: "hi" });
    await binding.thread.postEphemeral("U01", { text: "psst" });
    await binding.thread.startTyping("Thinking...");
    await binding.thread.refresh();
    await binding.slack.request("auth.test", {});

    expect(slackHost.calls).toEqual([]);
    expect(simulator.calls.map((call) => call.url)).toEqual([
      "https://sim.example/api/chat.postMessage",
      "https://sim.example/api/chat.postEphemeral",
      "https://sim.example/api/assistant.threads.setStatus",
      "https://sim.example/api/conversations.replies",
      "https://sim.example/api/auth.test",
    ]);
    expect(binding.thread.recentMessages.map((message) => message.text)).toEqual(["root", "hi"]);
  });

  it("routes the whole upload handshake through a configured api.url and api.fetch", async () => {
    const simulator = mockSlackApi({ url: "https://sim.example/api" });
    const binding = buildSlackBinding({
      api: { url: "https://sim.example/api", fetch: simulator.fetch },
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: "T01",
    });

    const result = await binding.slack.uploadFiles([
      {
        data: new TextEncoder().encode("a,b\n1,2\n").buffer as ArrayBuffer,
        filename: "report.csv",
        mimeType: "text/csv",
      },
    ]);

    expect(result.fileIds).toEqual(["F1"]);
    expect(slackHost.calls).toEqual([]);
    expect(simulator.calls.map((call) => call.method)).toEqual([
      "files.getUploadURLExternal",
      "files.upload",
      "files.completeUploadExternal",
    ]);
    // Slack hands back an upload URL off the Web API path; it must still be
    // fetched with the configured fetch rather than the global one.
    expect(simulator.calls[1]!.url.startsWith("https://sim.example/files/upload/")).toBe(true);
  });

  it("routes binding calls through SLACK_API_URL with no explicit config", async () => {
    process.env.SLACK_API_URL = "https://env.example/api";
    const environment = mockSlackApi({ url: "https://env.example/api" });
    vi.stubGlobal("fetch", environment.fetch);
    const { slack } = buildSlackBinding({
      botToken: "xoxb-test",
      channelId: "C01",
      threadTs: THREAD_TS,
      teamId: "T01",
    });

    await slack.request("auth.test", {});

    expect(environment.calls.map((call) => call.url)).toEqual([
      "https://env.example/api/auth.test",
    ]);
  });

  it("accepts apiUrl and fetch on the exported callSlackApi", async () => {
    const simulator = mockSlackApi({ url: "https://sim.example/api" });
    simulator.respondWith("views.update", { ok: true });
    slackHost.respondWith("views.open", { ok: true });

    await callSlackApi({
      botToken: "xoxb-test",
      operation: "views.update",
      body: {},
      apiUrl: "https://sim.example/api",
      fetch: simulator.fetch,
    });
    await callSlackApi({ botToken: "xoxb-test", operation: "views.open", body: {} });

    expect(simulator.calls.map((call) => call.url)).toEqual([
      "https://sim.example/api/views.update",
    ]);
    expect(slackHost.calls.map((call) => call.url)).toEqual(["https://slack.com/api/views.open"]);
  });

  it("routes the workspace handle through the configured base", async () => {
    const simulator = mockSlackApi({ url: "https://sim.example/api/" });
    simulator.respondWith("usergroups.list", { ok: true, usergroups: [] });
    const handle = buildSlackWorkspaceHandle({
      api: { url: "https://sim.example/api/", fetch: simulator.fetch },
      botToken: "xoxb-test",
      teamId: "T01",
    });

    await handle.request("usergroups.list", {});

    expect(slackHost.calls).toEqual([]);
    expect(simulator.calls.map((call) => call.url)).toEqual([
      "https://sim.example/api/usergroups.list",
    ]);
  });
});
