import { EveAgentStore, defaultMessageReducer } from "eve/client";
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export default defineEval({
  description: "A frontend stream reconnect uses the latest send's authorization header.",
  async test(t) {
    const session = await t.session();
    const host = `https://${crypto.randomUUID()}.invalid`;
    const originalFetch = globalThis.fetch;
    const reconnected = Promise.withResolvers<string | null>();
    let disconnect: (() => void) | undefined;
    let refreshed = false;
    const store = new EveAgentStore({
      host,
      initialSession: session.state,
      reducer: defaultMessageReducer(),
    });

    // Route only this store through the authenticated live eval target.
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== host) return originalFetch(input, init);
      const isStream = url.pathname.endsWith("/stream");
      if (isStream && refreshed) {
        reconnected.resolve(new Headers(init?.headers).get("authorization"));
      }
      const response = await t.target.fetch(`${url.pathname}${url.search}`, init);
      if (isStream && response.ok && response.body !== null && !refreshed) {
        const transport = new TransformStream<Uint8Array, Uint8Array>({
          start(controller) {
            disconnect = () => controller.terminate();
          },
        });
        return new Response(response.body.pipeThrough(transport), response);
      }
      if (init?.method === "POST" && refreshed && response.ok) disconnect?.();
      return response;
    };

    try {
      await store.send({
        message: "Reply with first.",
        headers: { authorization: "Bearer old" },
        signal: t.signal,
      });
      await t.require(store.snapshot.error, equals(undefined));
      if (disconnect === undefined) throw new Error("The first turn never opened its stream.");
      refreshed = true;
      await store.send({
        message: "Reply with second.",
        headers: { authorization: "Bearer fresh" },
        signal: t.signal,
      });
      await t.require(store.snapshot.error, equals(undefined));
      await t.require(await reconnected.promise, equals("Bearer fresh"));
    } finally {
      store.reset();
      globalThis.fetch = originalFetch;
    }
  },
});
