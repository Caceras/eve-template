// The Postgres chat store (lib/db/pg-queries.ts, used when DATABASE_URL is
// set) against drizzle's real neon-http driver with a recording client in
// place of Neon, so no database is needed. A snapshot save and an
// authorization save are each one transaction (one neon-http batch) that locks
// the chat row, checks ownership in every write and, for authorization events,
// counts the next index in SQL; the operator principal gets its "user" row
// (chat.user_id references it) before its first chat.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/db/client")
      return {
        url: "data:text/javascript,export const db = globalThis.__pgTestDb;",
        shortCircuit: true,
      };
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});

const calls = [];
let owned = true;
const updatedAt = "2026-09-26 10:00:00";
/** What Neon would answer; array-mode rows for drizzle's typed queries. */
function answer({ sql }) {
  if (sql.endsWith("for update")) return { rows: owned ? [["chat-1"]] : [] };
  if (/insert into chat_event/.test(sql))
    return { rows: owned ? [{ event_index: 7 }, { event_index: 8 }] : [] };
  if (sql.startsWith('update "chat"') && /returning/.test(sql))
    return { rows: owned ? [["chat-1", "Plans", updatedAt]] : [] };
  if (sql.startsWith('insert into "chat"')) return { rows: [["chat-new", "Plans", updatedAt]] };
  return { rows: [] };
}
/** Stands in for neon(): a query is lazy, so a batch can collect it unrun. */
function client(sql, params, options) {
  const query = { sql: sql.trim(), params, options };
  return {
    ...query,
    // eslint-disable-next-line unicorn/no-thenable -- neon() queries are lazy thenables; the fake must be one too.
    then(resolve, reject) {
      calls.push({ batch: false, queries: [query] });
      return Promise.resolve(answer(query)).then(resolve, reject);
    },
  };
}
client.transaction = async (queries) => {
  const list = queries.map(({ sql, params, options }) => ({ sql, params, options }));
  calls.push({ batch: true, queries: list });
  return list.map(answer);
};

const { drizzle } = await import("drizzle-orm/neon-http");
const schema = await import("../lib/db/schema.ts");
globalThis.__pgTestDb = drizzle({ client, schema });
const store = await import("../lib/db/pg-queries.ts");
const event = (type) => ({ type, data: {}, meta: { id: crypto.randomUUID() } });
const take = () => calls.splice(0);

// A snapshot save: one transaction, lock first, every write owner-guarded.
await store.saveChatSnapshot({
  chatId: "chat-1",
  events: [event("message.received"), event("session.waiting")],
  fromIndex: 3,
  session: { sessionId: "s1", streamIndex: 5 },
  userId: "riki",
});
let [save] = take();
assert.equal(save.batch, true, "one transaction");
assert.equal(save.queries.length, 4);
const [lock, insert, remove, update] = save.queries;
assert.match(lock.sql, /^select "id" from "chat" where .* for update$/);
assert.deepEqual(lock.params, ["chat-1", "riki"]);
assert.match(
  insert.sql,
  /^insert into chat_event .* where exists \(select 1 from "chat" where id = \$\d+ and user_id = \$\d+\)/s,
);
assert.match(
  insert.sql,
  /on conflict \(chat_id, event_index\) do update set event = excluded.event/,
);
const rows = JSON.parse(insert.params.find((param) => String(param).startsWith("[")));
assert.deepEqual(
  rows.map((row) => row.event.type),
  ["message.received", "session.waiting"],
);
assert(rows.every((row) => typeof row.id === "string" && row.id.length > 0));
assert(insert.params.includes(3), "events start at fromIndex");
assert.match(
  remove.sql,
  /^delete from "chat_event" where .*"event_index" >= \$\d+ and exists \(select/,
);
assert(remove.params.includes(5), "rows past the new end are dropped");
assert.match(update.sql, /^update "chat" set .*"eve_session"/);

// Not the caller's chat: nothing else runs and the save is refused.
owned = false;
await assert.rejects(
  store.saveChatSnapshot({ chatId: "chat-1", events: [], session: undefined, userId: "mallory" }),
  /Chat not found/,
);
[save] = take();
assert.equal(save.batch, true);
assert.equal(calls.length, 0);
owned = true;

// Authorization events: the next index is counted in SQL inside the transaction.
const skipped = await store.skipChatAuthorization({
  chatId: "chat-1",
  events: [event("authorization.required"), event("authorization.completed")],
  session: undefined,
  userId: "riki",
});
const [skip] = take();
assert.equal(skip.batch, true, "one transaction");
assert.equal(skip.queries.length, 3);
assert.match(skip.queries[0].sql, /for update$/);
assert.match(
  skip.queries[1].sql,
  /\(select coalesce\(max\(event_index\), -1\) \+ 1 from chat_event where chat_id = \$\d+\)/,
);
assert.deepEqual(skipped, {
  chat: { id: "chat-1", title: "Plans", updatedAt: new Date(`${updatedAt}+0000`).toISOString() },
  eventCount: 2,
  eventIndex: 7,
});
owned = false;
await assert.rejects(
  store.skipChatAuthorization({
    chatId: "chat-1",
    events: [event("x")],
    session: undefined,
    userId: "mallory",
  }),
  /Chat not found/,
);
take();
owned = true;

// The operator principal gets its user row once, before its first chat.
await store.createChat("eve-chat-user", { title: "Plans" });
let created = take();
assert.equal(created.length, 2);
assert.match(created[0].queries[0].sql, /^insert into "user" .* on conflict \("id"\) do nothing$/);
assert(created[0].queries[0].params.includes("eve-chat-user"));
assert.match(created[1].queries[0].sql, /^insert into "chat"/);
await store.createChat("eve-chat-user", { title: "Plans" });
created = take();
assert.equal(created.length, 1, "the user row is written once per process");
await store.createChat("vercel-user-1", { title: "Plans" });
created = take();
assert.equal(created.length, 1, "signed-up users already have a row");
assert.match(created[0].queries[0].sql, /^insert into "chat"/);

console.log(
  "PASS: Postgres snapshot and authorization saves are single owner-guarded transactions with SQL-counted indexes; the operator gets its user row before its first chat",
);
