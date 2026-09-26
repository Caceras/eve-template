import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { connectorFor } from "@/lib/connectors";

// SENTRY_CONNECTOR is the UID returned by Vercel Connect. For local setup,
// create a connector with `vercel connect create https://mcp.sentry.dev/mcp --name sentry`.
// Without a connector the agent never sees Sentry: every call would fail, and
// the listing would cost tokens on every turn.
const sentryConnector = connectorFor("sentry");

export default defineDynamic({
  events: {
    "session.started": () =>
      sentryConnector
        ? defineMcpClientConnection({
            url: "https://mcp.sentry.dev/mcp",
            description:
              "Sentry workspace: investigate issues, events, traces, releases, and project health.",
            instanceKey: sentryConnector,
            auth: connect(sentryConnector),
          })
        : null,
  },
});
