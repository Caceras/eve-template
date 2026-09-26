import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import { connectorFor } from "@/lib/connectors";

// NOTION_CONNECTOR is the UID returned by Vercel Connect. For local setup,
// create a connector with `vercel connect create mcp.notion.com --name notion`.
// Without a connector the agent never sees Notion: every call would fail, and
// the listing would cost tokens on every turn.
const notionConnector = connectorFor("notion");

export default defineDynamic({
  events: {
    "session.started": () =>
      notionConnector
        ? defineMcpClientConnection({
            url: "https://mcp.notion.com/mcp",
            description: "Notion workspace: search and edit pages and databases.",
            instanceKey: notionConnector,
            auth: connect(notionConnector),
          })
        : null,
  },
});
