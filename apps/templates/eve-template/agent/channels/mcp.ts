import { localDev } from "eve/channels/auth";
import { mcpChannel } from "eve/channels/mcp";

// Safe reference configuration: usable from local development, closed in production.
export default mcpChannel({
  auth: localDev(),
});
