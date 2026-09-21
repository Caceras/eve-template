import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { InvocationError, type Destination, type Dispatch } from "./prototype.ts";

/** Real HTTP directory; deterministic agent transport. Neither is a production eve agent. */
export async function directoryFixture(initial: Destination[]) {
  let catalog = initial;
  let reads = 0;
  const server = createServer((_request, response) => {
    reads++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(catalog));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Directory did not start.");
  return {
    url: `http://127.0.0.1:${address.port}/agents`,
    set: (next: Destination[]) => {
      catalog = next;
    },
    reads: () => reads,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

export function transportFixture() {
  const calls: Parameters<Dispatch>[0][] = [];
  const dispatch: Dispatch = async (input) => {
    calls.push(structuredClone(input));
    if (input.destination.route === "offline") throw new InvocationError("unavailable");
    if (input.sessionId === "expired") throw new InvocationError("expired-session");
    return { sessionId: input.sessionId ?? randomUUID(), output: `Reviewed: ${input.message}` };
  };
  return { dispatch, calls };
}
