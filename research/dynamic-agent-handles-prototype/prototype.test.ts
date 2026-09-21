import assert from "node:assert/strict";
import { test } from "node:test";
import { defineTool } from "../../packages/eve/src/tools/definition.ts";
import {
  discoveryTool,
  loadExternalAgents,
  registerAndCallTool,
  updateDescriptionTool,
} from "./examples.ts";
import { directoryFixture, transportFixture } from "./fixtures.ts";
import { InvocationError, PrototypeSession, prototypeContext } from "./prototype.ts";

const destination = {
  key: "reviewer",
  description: "Reviews <code> & tests.",
  route: "private-route",
};
const makeSession = () => {
  const transport = transportFixture();
  return {
    transport,
    session: new PrototypeSession({ dispatch: transport.dispatch, authorize: () => true }),
  };
};
const latest = (session: PrototypeSession) => String(session.captureRequest().at(-1)?.content);

test("external startup and tool discovery advertise destinations without invoking them", async () => {
  const source = await directoryFixture([
    destination,
    { key: "offline", description: "Offline destination.", route: "offline" },
  ]);
  try {
    const { session, transport } = makeSession();
    await loadExternalAgents(session.context, source.url);
    assert.equal(source.reads(), 1);
    assert.equal(transport.calls.length, 0);
    const initial = session.captureRequest();
    const text = String(initial.at(-1)?.content);
    assert.match(text, /offline/);
    assert.match(text, /Reviews &lt;code&gt; &amp; tests/);
    assert.doesNotMatch(text, /private-route/);
    source.set([{ key: "discovered", description: "Newly discovered.", route: "reviewer" }]);
    assert.deepEqual(await session.runTool(discoveryTool(source.url), {}), { loaded: 1 });
    const next = session.captureRequest();
    assert.equal(next.at(-2)?.role, "tool");
    assert.match(String(next.at(-1)?.content), /discovered/);
    assert.doesNotMatch(JSON.stringify(initial), /discovered/);
    assert.equal(transport.calls.length, 0);
    assert.deepEqual(session.captureRequest(), next);
  } finally {
    await source.close();
  }
});

test("ordinary tools register and immediately invoke; later calls reuse the session binding", async () => {
  const { session, transport } = makeSession();
  assert.match(await session.runTool(registerAndCallTool, {}), /Reviewed:/);
  const handle = session.handle("change-reviewer");
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0]?.sessionId, undefined);
  await session.runTool(registerAndCallTool, {});
  assert.equal(typeof transport.calls[1]?.sessionId, "string");
  assert.deepEqual(session.handle("change-reviewer"), handle);
  await session.runTool(updateDescriptionTool, {
    id: handle.id,
    description: "Updated description.",
  });
  assert.match(latest(session), /Updated description/);
});

test("publication waits for tool results; registration survives a later tool exception", async () => {
  const { session } = makeSession();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tool = defineTool({
    description: "Register, then fail after an asynchronous operation.",
    inputSchema: { type: "object" },
    async execute(_input, ctx) {
      prototypeContext(ctx).registerAgent(destination);
      await gate;
      throw new Error("after registration");
    },
  });
  const pending = session.runTool(tool, {});
  assert.ok(session.handle("reviewer"));
  assert.throws(() => session.captureRequest(), /Tool results/);
  await assert.rejects(session.runTool(tool, {}), /serially/);
  release();
  await assert.rejects(pending, /after registration/);
  const request = session.captureRequest();
  assert.equal(request.at(-2)?.role, "tool");
  assert.match(String(request.at(-1)?.content), /reviewer/);
});

test("registration is idempotent; conflicts are explicit and stale handles never start sessions", async () => {
  const { session, transport } = makeSession();
  const [first, second] = await Promise.all([
    Promise.resolve().then(() => session.context.registerAgent(destination)),
    Promise.resolve().then(() => session.context.registerAgent(destination)),
  ]);
  assert.deepEqual(first, second);
  assert.throws(
    () => session.context.registerAgent({ ...destination, route: "other" }),
    /already registered/,
  );
  const foreign = makeSession().session;
  await assert.rejects(foreign.context.agent(first, { message: "wrong session" }), /Unknown/);
  session.context.unregisterAgent(first);
  const replacement = session.context.registerAgent(destination);
  assert.notDeepEqual(replacement, first);
  await assert.rejects(session.context.agent(first, { message: "stale selection" }), /removed/);
  assert.equal(transport.calls.length, 0);
});

test("offline, expired-session, and uncertain delivery failures preserve registration without retry", async () => {
  for (const code of ["unavailable", "expired-session", "acceptance-unknown"] as const) {
    let attempts = 0;
    const session = new PrototypeSession({
      authorize: () => true,
      dispatch: async () => {
        attempts++;
        throw new InvocationError(code);
      },
    });
    const handle = session.context.registerAgent(destination);
    await assert.rejects(session.context.agent(handle, { message: "review" }), { code });
    assert.deepEqual(session.handle(destination.key), handle);
    assert.match(latest(session), new RegExp(code));
    assert.equal(attempts, 1);
  }
});

test("registration grants no invocation permission and authorization is checked on every call", async () => {
  const transport = transportFixture();
  let allowed = false;
  const session = new PrototypeSession({ dispatch: transport.dispatch, authorize: () => allowed });
  const handle = session.context.registerAgent(destination);
  await assert.rejects(session.context.agent(handle, { message: "review" }), { code: "denied" });
  assert.equal(transport.calls.length, 0);
  allowed = true;
  await session.context.agent(handle, { message: "review" });
  allowed = false;
  await assert.rejects(session.context.agent(handle, { message: "again" }), { code: "denied" });
  assert.equal(transport.calls.length, 1);
});

test("static destinations and explicit session bindings use the same invocation path", async () => {
  const transport = transportFixture();
  const session = new PrototypeSession({
    dispatch: transport.dispatch,
    authorize: () => true,
    staticAgents: [{ ...destination, sessionId: "existing-session" }],
  });
  await session.context.agent(session.handle(destination.key), { message: "continue" });
  assert.equal(transport.calls[0]?.sessionId, "existing-session");
  assert.doesNotMatch(latest(session), /existing-session|private-route/);
  const restored = makeSession();
  restored.session.restore(session.snapshot());
  assert.match(latest(restored.session), /reviewer/);
  await restored.session.context.agent(restored.session.handle(destination.key), {
    message: "continue again",
  });
  assert.equal(restored.transport.calls[0]?.sessionId, "existing-session");
});

test("unregister removes advertisement without cancelling accepted work or resurrecting the entry", async () => {
  let finish!: (value: { sessionId: string; output: string }) => void;
  const session = new PrototypeSession({
    authorize: () => true,
    dispatch: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const handle = session.context.registerAgent(destination);
  const pending = session.context.agent(handle, { message: "review" });
  assert.match(latest(session), /availability="busy"/);
  await assert.rejects(session.context.agent(handle, { message: "overlap" }), { code: "busy" });
  assert.throws(() => session.snapshot(), /active work/);
  session.context.unregisterAgent(handle);
  assert.equal(latest(session), "[Agents]\n<agents>\n</agents>");
  finish({ sessionId: "accepted-session", output: "done" });
  assert.equal(await pending, "done");
  assert.throws(() => session.handle(destination.key), /Unknown/);
});

test("compaction republishes all current destinations and final removal publishes an empty view", () => {
  const { session } = makeSession();
  const handle = session.context.registerAgent(destination);
  const before = latest(session);
  session.compactHistory();
  assert.equal(latest(session), before);
  session.context.unregisterAgent(handle);
  assert.equal(latest(session), "[Agents]\n<agents>\n</agents>");
});

test("malformed external records are rejected before any registration", async () => {
  const source = await directoryFixture([destination, { ...destination, key: "" }]);
  try {
    const { session } = makeSession();
    await assert.rejects(
      loadExternalAgents(session.context, source.url),
      /Invalid destination key/,
    );
    assert.equal(session.snapshot(), "[]");
  } finally {
    await source.close();
  }
});
