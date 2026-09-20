import { agentRouter } from "eve/tools/agent-router";

import { selectAgent } from "../lib/select-agent";

export default agentRouter({ select: selectAgent });
