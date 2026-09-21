import { defineState } from "eve/context";

export const demoSessionState = defineState("eve-template.demo-session-state", () => ({
  count: 0,
  notes: [] as string[],
}));
