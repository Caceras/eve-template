import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionHistoryObserver } from "../lib/session-history-observer.ts";
import { createSessionStore } from "../lib/session-store.ts";
import { eveChannel } from "eve/channels/eve";

test("the HTTP eve channel projects root messages without joining turn completion", async () => {
  const writes: unknown[][] = [],
    pending: Promise<void>[] = [],
    errors: unknown[] = [];
  let fail = false;
  const store = createSessionStore(async (_sql, values) => {
    writes.push(values);
    if (fail) throw new Error("offline");
    return [{ session_id: "root" }];
  }, "app");
  const observe = createSessionHistoryObserver(
    () => store,
    (work) => pending.push(work),
    (error) => errors.push(error),
  );
  const channel = eveChannel({ auth: [] });
  const ctx = {
    channel: { kind: Reflect.get(channel, "adapter").kind },
    session: { id: "root", auth: { initiator: { attributes: { webSessionOwner: "alice" } } } },
  };
  assert.equal(ctx.channel.kind, "http");
  const event = {
    type: "message.received" as const,
    meta: { id: "m", at: "2026-09-21T00:00:00Z" },
    data: { message: "A title", turnId: "turn", sequence: 1 },
  };
  assert.equal(observe(event, ctx), undefined);
  assert.equal(writes.length, 0);
  await Promise.all(pending);
  assert.equal(writes[0][3], "A title");
  fail = true;
  assert.equal(observe(event, ctx), undefined);
  await Promise.all(pending);
  assert.equal(errors.length, 1);
});
