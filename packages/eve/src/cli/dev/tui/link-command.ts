import { runLinkFlow } from "#setup/flows/link.js";
import type { Prompter } from "#setup/prompter.js";

export interface TuiLinkCommandDependencies {
  readonly runLinkFlow: typeof runLinkFlow;
}

/** Runs the existing project-link flow as a local TUI command. */
export async function runTuiLinkCommand(
  input: { readonly appRoot: string; readonly prompter: Prompter; readonly signal: AbortSignal },
  dependencies: TuiLinkCommandDependencies = { runLinkFlow },
) {
  const result = await dependencies.runLinkFlow({
    appRoot: input.appRoot,
    prompter: input.prompter,
    projectSelection: "create-or-link",
    signal: input.signal,
  });
  return result.kind === "cancelled"
    ? { message: "/link dismissed.", cancelled: true as const, preserveFlowDiagnostics: false }
    : {
        message: "Linked this project to Vercel.",
        preserveFlowDiagnostics: false,
        effect: { kind: "refresh-identity" as const },
      };
}
