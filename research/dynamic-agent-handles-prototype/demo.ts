import {
  discoveryTool,
  loadExternalAgents,
  registerAndCallTool,
  updateDescriptionTool,
} from "./examples.ts";
import { directoryFixture, transportFixture } from "./fixtures.ts";
import { PrototypeSession, InvocationError } from "./prototype.ts";

const source = await directoryFixture([
  {
    key: "operations",
    description: "Checks operations.",
    route: "reviewer",
    sessionId: "existing-ops-session",
  },
  { key: "archive", description: "Searches archived work; may be offline.", route: "offline" },
]);
try {
  const transport = transportFixture();
  const session = new PrototypeSession({
    dispatch: transport.dispatch,
    authorize: ({ route }) => ["reviewer", "offline"].includes(route),
    staticAgents: [{ key: "editor", description: "Edits prose.", route: "reviewer" }],
  });
  await loadExternalAgents(session.context, source.url);
  console.log(
    "Startup: external destinations + automatic static registration; calls:",
    transport.calls.length,
  );
  console.log(session.captureRequest().at(-1)?.content);

  source.set([
    { key: "project-helper", description: "Knows this project's conventions.", route: "reviewer" },
  ]);
  console.log("Discovery tool result:", await session.runTool(discoveryTool(source.url), {}));
  console.log("Next request:", session.captureRequest().at(-1)?.content);

  console.log("Register → call inside one tool:", await session.runTool(registerAndCallTool, {}));
  await session.runTool(updateDescriptionTool, {
    id: session.handle("change-reviewer").id,
    description: "Reviews the current change and its tests.",
  });
  console.log("Next request:", session.captureRequest().at(-1)?.content);

  try {
    await session.context.agent(session.handle("archive"), {
      message: "Find last month's review.",
    });
  } catch (error) {
    if (!(error instanceof InvocationError)) throw error;
    console.log("Offline call:", error.code, "; destination remains advertised:");
  }
  console.log(session.captureRequest().at(-1)?.content);
} finally {
  await source.close();
}
