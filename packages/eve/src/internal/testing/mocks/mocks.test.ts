import { describe, expect, it, vi } from "vitest";

import { mockChannelContext } from "#internal/testing/mocks/mock-channel-operations.js";
import { mockSandbox } from "#internal/testing/mocks/mock-sandbox.js";
import { mockSlackApi } from "#internal/testing/mocks/mock-slack-api.js";
import { mockTool } from "#internal/testing/mocks/mock-tool.js";

describe("mockChannelContext", () => {
  it("rejects producer metadata outside the input response contract", async () => {
    const observeDelivery = vi.fn();
    const source = mockChannelContext(observeDelivery).from("thread-1");

    await expect(
      source.respond(
        [{ kind: "tool-approval", optionId: "approve", requestId: "approval-1" }] as never,
        { auth: null },
      ),
    ).rejects.toThrow(/unrecognized_keys/);
    expect(observeDelivery).not.toHaveBeenCalled();
  });
});

describe("mockTool", () => {
  it("assigns deterministic defaults from the tool name", () => {
    const tool = mockTool({ name: "get_weather", execute: () => 42 });

    expect(tool.name).toBe("get_weather");
    expect(tool.logicalPath).toBe("tools/get_weather.ts");
    expect(tool.sourceId).toBe("tools/get_weather.ts");
    expect(tool.description).toBe("get_weather mock tool.");
    expect(tool.inputSchema).toBeNull();
    expect(tool.sourceKind).toBe("module");
  });

  it("omits execute when the descriptor does not define one", () => {
    const tool = mockTool({ name: "get_weather" });

    expect(tool.execute).toBeUndefined();
  });

  it("sanitizes characters that are not valid in a logical path", () => {
    const tool = mockTool({ name: "weird name!" });

    expect(tool.logicalPath).toBe("tools/weird-name-.ts");
  });

  it("honours explicit logical path overrides", () => {
    const tool = mockTool({ name: "hello", logicalPath: "custom/tools/hello.ts" });

    expect(tool.logicalPath).toBe("custom/tools/hello.ts");
    expect(tool.sourceId).toBe("custom/tools/hello.ts");
  });
});

describe("mockSandbox", () => {
  it("seeds initial files anchored under /workspace", async () => {
    const sandbox = mockSandbox({
      initialFiles: {
        "note.txt": "seeded",
        "/workspace/absolute.txt": "absolute",
      },
    });

    expect(sandbox.files.get("/workspace/note.txt")).toBe("seeded");
    expect(sandbox.files.get("/workspace/absolute.txt")).toBe("absolute");
    await expect(sandbox.session.readTextFile({ path: "note.txt" })).resolves.toBe("seeded");
  });

  it("records command invocations in order", async () => {
    const sandbox = mockSandbox();

    await sandbox.session.run({ command: "echo first" });
    await sandbox.session.run({ command: "echo second" });

    expect(sandbox.commandLog).toEqual(["echo first", "echo second"]);
  });

  it("prefers the commands map over the run fallback", async () => {
    const sandbox = mockSandbox({
      commands: {
        "ls -1": { exitCode: 0, stderr: "", stdout: "README.md\n" },
      },
      run: async () => ({ exitCode: 9, stderr: "fallback", stdout: "" }),
    });

    const matched = await sandbox.session.run({ command: "ls -1" });
    const fallback = await sandbox.session.run({ command: "cat README.md" });

    expect(matched.stdout).toBe("README.md\n");
    expect(fallback.stderr).toBe("fallback");
  });

  it("writes UTF-8 payloads and reads them back through the session", async () => {
    const sandbox = mockSandbox();

    await sandbox.session.writeTextFile({ content: "hello", path: "note.txt" });
    await expect(sandbox.session.readTextFile({ path: "note.txt" })).resolves.toBe("hello");
  });

  it("supports line-range reads on stored files", async () => {
    const sandbox = mockSandbox({
      initialFiles: { "multiline.txt": "one\ntwo\nthree\nfour" },
    });

    await expect(
      sandbox.session.readTextFile({ endLine: 3, path: "multiline.txt", startLine: 2 }),
    ).resolves.toBe("two\nthree");
  });

  it("returns null for missing files", async () => {
    const sandbox = mockSandbox();

    await expect(sandbox.session.readTextFile({ path: "missing.txt" })).resolves.toBeNull();
  });

  it("resolves relative paths against /workspace and preserves absolute paths", () => {
    const sandbox = mockSandbox();

    expect(sandbox.session.resolvePath("a/b.txt")).toBe("/workspace/a/b.txt");
    expect(sandbox.session.resolvePath("/tmp/x")).toBe("/tmp/x");
  });
});

describe("mockSlackApi", () => {
  /** Form-encoded, signed POST, as the Slack transport always sends. */
  async function post(
    slack: ReturnType<typeof mockSlackApi>,
    method: string,
    body: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const response = await slack.fetch(`${slack.url}${method}`, {
      method: "POST",
      headers: {
        authorization: "Bearer xoxb-test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
    return (await response.json()) as Record<string, unknown>;
  }

  it("fails closed on a method it does not model", async () => {
    const slack = mockSlackApi();

    await expect(post(slack, "emoji.list")).resolves.toEqual({
      ok: false,
      error: "unknown_method",
    });
  });

  it("answers a registered raw method instead of failing closed", async () => {
    const slack = mockSlackApi();
    slack.respondWith("emoji.list", { ok: true, emoji: {} });

    await expect(post(slack, "emoji.list")).resolves.toEqual({ ok: true, emoji: {} });
  });

  it("lets a registered handler override a method it does model", async () => {
    const slack = mockSlackApi();
    // Slack's own chat.postMessage always answers with a ts; overriding
    // is how a test pins what eve does when a response is degenerate.
    slack.respondWith("chat.postMessage", { ok: true });

    await expect(post(slack, "chat.postMessage", { channel: "C01", text: "hi" })).resolves.toEqual({
      ok: true,
    });
    expect(slack.messages()).toEqual([]);
  });

  it("rejects a call that is not form-encoded", async () => {
    const slack = mockSlackApi();

    await expect(
      slack.fetch(`${slack.url}chat.postMessage`, {
        method: "POST",
        headers: { authorization: "Bearer xoxb-test", "content-type": "application/json" },
        body: JSON.stringify({ channel: "C01" }),
      }),
    ).rejects.toThrow(/form-encodes/);
    expect(() => slack.assertNoViolations()).toThrow(/protocol violations/);
  });

  it("rejects a call carrying no bearer token", async () => {
    const slack = mockSlackApi();

    await expect(
      slack.fetch(`${slack.url}chat.postMessage`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "channel=C01",
      }),
    ).rejects.toThrow(/no bearer token/);
  });

  it("allocates monotonic timestamps and keeps post, update and delete coherent", async () => {
    const slack = mockSlackApi();

    const first = await post(slack, "chat.postMessage", { channel: "C01", text: "one" });
    const second = await post(slack, "chat.postMessage", { channel: "C01", text: "two" });
    expect(String(first.ts) < String(second.ts)).toBe(true);

    await expect(
      post(slack, "chat.update", { channel: "C01", ts: String(first.ts), text: "revised" }),
    ).resolves.toMatchObject({ ok: true });
    expect(slack.message(String(first.ts))?.text).toBe("revised");

    await expect(
      post(slack, "chat.update", { channel: "C01", ts: "9.9", text: "nope" }),
    ).resolves.toEqual({ ok: false, error: "message_not_found" });

    await post(slack, "chat.delete", { channel: "C01", ts: String(first.ts) });
    expect(slack.message(String(first.ts))).toBeUndefined();
  });

  it("returns a stable DM channel per user", async () => {
    const slack = mockSlackApi();

    const first = await post(slack, "conversations.open", { users: "U01" });
    const again = await post(slack, "conversations.open", { users: "U01" });
    const other = await post(slack, "conversations.open", { users: "U02" });

    expect(first.channel).toEqual({ id: slack.directMessageChannel("U01") });
    expect(again.channel).toEqual(first.channel);
    expect(other.channel).not.toEqual(first.channel);
  });

  it("distinguishes a Slack-level error from an HTTP-level failure", async () => {
    const slack = mockSlackApi();
    slack.failNextHttp("chat.postMessage", { status: 429, retryAfter: 12 });
    slack.failNext("chat.postMessage", "ratelimited");

    const throttled = await slack.fetch(`${slack.url}chat.postMessage`, {
      method: "POST",
      headers: {
        authorization: "Bearer xoxb-test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "channel=C01",
    });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("12");

    // The Slack-level failure is still queued and answers the next call
    // with a 200 the caller has to inspect rather than a thrown transport
    // error.
    await expect(post(slack, "chat.postMessage", { channel: "C01" })).resolves.toEqual({
      ok: false,
      error: "ratelimited",
    });
  });

  it("refuses to complete an upload whose bytes never arrived", async () => {
    const slack = mockSlackApi();

    const ticket = await post(slack, "files.getUploadURLExternal", {
      filename: "report.csv",
      length: "3",
    });

    await expect(
      post(slack, "files.completeUploadExternal", {
        channel_id: "C01",
        files: JSON.stringify([{ id: ticket.file_id, title: "report.csv" }]),
      }),
    ).resolves.toEqual({ ok: false, error: "file_not_found" });
  });
});
