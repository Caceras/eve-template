import { defineEval } from "eve/evals";

import { withSelfModification } from "./harness";

const CONNECTION_NAME = "eval-linear";
const CONNECTION_PATH = `connections/${CONNECTION_NAME}.ts`;
const SEARCH_TOOL = "connection_search";
const LIST_TOOL = `${CONNECTION_NAME}__listOpenIssues`;
const CONNECTION_SOURCE = `import { defineOpenAPIConnection } from "eve/connections";

const baseUrl = process.env.WORKFLOW_LOCAL_BASE_URL ?? "http://127.0.0.1:3000";

export default defineOpenAPIConnection({
  baseUrl,
  description: "Fixture Linear issue tracker.",
  operations: { allow: ["listOpenIssues"] },
  spec: {
    openapi: "3.0.0",
    info: { title: "Fixture Linear", version: "1.0.0" },
    paths: {
      "/eval-linear/issues": {
        get: {
          operationId: "listOpenIssues",
          summary: "List currently open Linear issues.",
          responses: { 200: { description: "Open issues." } },
        },
      },
    },
  },
});
`;

export default defineEval({
  tags: ["real-model"],
  description:
    "An existing session discovers and calls a connection installed by self-modification after rebuild.",

  async test(t) {
    await withSelfModification(t, async (selfMod) => {
      const installed = await selfMod.request(
        [
          `Alice needs a reusable connection named ${CONNECTION_NAME} for checking Linear issues in future conversations.`,
          "Add an OpenAPI connection source file that uses process.env.WORKFLOW_LOCAL_BASE_URL as its base URL and an inline OpenAPI 3 specification.",
          "Expose a listOpenIssues operation backed by GET /eval-linear/issues and require no credentials.",
          "The operation only lists issues; it must not modify them or contact any other service.",
        ].join(" "),
      );
      await selfMod.assertOnlyChanged([CONNECTION_PATH]);

      // Normalize the generated connection so this case isolates session capability refresh from
      // model variation in OpenAPI authoring.
      await selfMod.writeSource(CONNECTION_PATH, CONNECTION_SOURCE);
      await selfMod.apply();

      const sameSession = await selfMod.followUp(
        installed.session,
        "What Linear issues are open right now?",
      );
      sameSession.calledTool(SEARCH_TOOL, {
        input: { connection: CONNECTION_NAME },
      });
      sameSession.calledTool(LIST_TOOL, {
        output: hasFixtureIssue,
      });

      const freshSession = await selfMod.verify("What Linear issues are open right now?");
      freshSession.calledTool(SEARCH_TOOL, {
        input: { connection: CONNECTION_NAME },
      });
      freshSession.calledTool(LIST_TOOL, {
        output: hasFixtureIssue,
      });
      t.succeeded();
    });
  },
});

function hasFixtureIssue(value: unknown): boolean {
  return JSON.stringify(value).includes("EVE-123");
}
