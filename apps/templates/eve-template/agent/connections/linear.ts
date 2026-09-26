import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { connectorFor } from "@/lib/connectors";

// LINEAR_CONNECTOR is the UID returned by Vercel Connect. For local setup,
// create a connector with `vercel connect create https://mcp.linear.app/mcp --name linear`.
// Without a connector the agent never sees Linear: every call would fail, and
// the listing would cost tokens on every turn.
const linearConnector = connectorFor("linear");

export default defineDynamic({
  events: {
    "session.started": () =>
      linearConnector
        ? defineMcpClientConnection({
            url: "https://mcp.linear.app/mcp",
            description:
              "Linear workspace: search and update issues, projects, cycles, comments, and planning work.",
            instanceKey: linearConnector,
            auth: connect(linearConnector),
          })
        : null,
  },
});
