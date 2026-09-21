import { describe, expect, it } from "vitest";

import { mockSlack } from "#internal/testing/mocks/mock-slack.js";
import { callSlackApi } from "#public/channels/slack/api-transport.js";

function call(slack: ReturnType<typeof mockSlack>, operation: string, body: unknown = {}) {
  return callSlackApi({ botToken: "xoxb-test", operation, body, fetch: slack.fetch });
}

describe("mockSlack strictness", () => {
  it("fails an unstubbed method, naming it and what is stubbed", async () => {
    const slack = mockSlack();
    slack.allow("auth.test").andReturn({ ok: true });

    // The whole point of the double: a method nobody declared must not
    // quietly succeed. The message has to be diagnosable without reading
    // the double's source.
    await expect(call(slack, "chat.postMessage", { channel: "C01" })).rejects.toThrow(
      /chat\.postMessage was called but never stubbed.*slack\.allow\("chat\.postMessage"\).*stubbed methods: auth\.test/s,
    );
    expect(slack.violations).toHaveLength(1);
    expect(() => slack.assertNoViolations()).toThrow(/chat\.postMessage/);
  });

  it("records the call even when it rejects it, so swallowed failures still surface", async () => {
    const slack = mockSlack();
    await expect(call(slack, "chat.postMessage", { channel: "C01" })).rejects.toThrow();
    expect(slack.callsTo("chat.postMessage")).toHaveLength(1);
  });

  it("fails a call whose arguments the stub's constraint rejects", async () => {
    const slack = mockSlack();
    slack.allow("chat.postMessage").with({ channel: "C01" }).andReturn({ ok: true, ts: "1700.1" });

    await expect(call(slack, "chat.postMessage", { channel: "C_OTHER" })).rejects.toThrow(
      /arguments the stub does not accept/,
    );
  });

  it("fails when a sequence stub runs out of declared responses", async () => {
    const slack = mockSlack();
    slack.allow("conversations.replies").andReturnEach([{ ok: true, messages: [] }]);

    await call(slack, "conversations.replies", { channel: "C01", ts: "1.0" });
    await expect(
      call(slack, "conversations.replies", { channel: "C01", ts: "1.0" }),
    ).rejects.toThrow(/more times than andReturnEach declared/);
  });
});

describe("mockSlack responses", () => {
  it("answers successive calls from andReturnEach in order", async () => {
    const slack = mockSlack();
    slack.allow("conversations.replies").andReturnEach([
      { ok: true, messages: [{ ts: "1" }], response_metadata: { next_cursor: "c1" } },
      { ok: true, messages: [{ ts: "2" }] },
    ]);

    const first = await call(slack, "conversations.replies", { channel: "C01", ts: "1.0" });
    const second = await call(slack, "conversations.replies", { channel: "C01", ts: "1.0" });

    expect(first.messages).toEqual([{ ts: "1" }]);
    expect(second.messages).toEqual([{ ts: "2" }]);
  });

  it("computes a response from the request body with andRespond", async () => {
    const slack = mockSlack();
    slack.allow("chat.postMessage").andRespond((body) => ({ ok: true, ts: `ts-${body.channel}` }));

    expect(await call(slack, "chat.postMessage", { channel: "C01" })).toMatchObject({
      ts: "ts-C01",
    });
  });

  it("keeps Slack-level and HTTP-level failure as separate paths", async () => {
    const envelope = mockSlack();
    envelope.allow("chat.postMessage").andFail("channel_not_found");
    // A Slack `{ ok: false }` comes back for the caller to inspect...
    expect(await call(envelope, "chat.postMessage", { channel: "C01" })).toEqual({
      ok: false,
      error: "channel_not_found",
    });

    const transport = mockSlack();
    transport.allow("chat.postMessage").andFailHttp({ status: 429, retryAfter: 30 });
    // ...whereas an HTTP failure throws before any envelope exists.
    await expect(call(transport, "chat.postMessage", { channel: "C01" })).rejects.toThrow(
      /HTTP 429/,
    );
  });

  it("serves a one-shot failNext ahead of the standing stub", async () => {
    const slack = mockSlack();
    slack.allow("chat.postMessage").andReturn({ ok: true, ts: "1700.1" });
    slack.failNext("chat.postMessage", "ratelimited");

    expect(await call(slack, "chat.postMessage", { channel: "C01" })).toMatchObject({
      error: "ratelimited",
    });
    expect(await call(slack, "chat.postMessage", { channel: "C01" })).toMatchObject({
      ts: "1700.1",
    });
  });
});

describe("mockSlack protocol checks", () => {
  it("rejects a call carrying no bearer token", async () => {
    const slack = mockSlack();
    slack.allow("auth.test").andReturn({ ok: true });

    await expect(
      slack.fetch(`${slack.url}auth.test`, {
        method: "POST",
        body: "",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    ).rejects.toThrow(/carried no bearer token/);
  });

  it("rejects a form-only method sent as JSON", async () => {
    const slack = mockSlack();
    slack.allow("chat.postMessage").andReturn({ ok: true, ts: "1700.1" });

    await expect(
      slack.fetch(`${slack.url}chat.postMessage`, {
        method: "POST",
        body: "{}",
        headers: { authorization: "Bearer x", "content-type": "application/json" },
      }),
    ).rejects.toThrow(/Slack's JSON support is partial/);
  });
});

describe("mockSlack call recording", () => {
  it("reports a missing call with the methods it did see", async () => {
    const slack = mockSlack();
    slack.allow("auth.test").andReturn({ ok: true });
    await call(slack, "auth.test");

    expect(() => slack.bodyOf("chat.update")).toThrow(
      /expected at least 1 call\(s\) to chat\.update, saw 0.*auth\.test/s,
    );
    expect(slack.observedMethods()).toEqual(["auth.test"]);
  });
});
