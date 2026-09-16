import { runInstallVercelCliFlow } from "#setup/flows/install-vercel-cli.js";
import { runLinkFlow } from "#setup/flows/link.js";
import { runLoginFlow } from "#setup/flows/login.js";
import { HumanActionRequiredError } from "#setup/human-action.js";
import type { Prompter } from "#setup/prompter.js";

import {
  recoverVercelHumanAction,
  type VercelHumanActionRecoveryFlows,
} from "./vercel-human-action-recovery.js";

export interface TuiLinkCommandDependencies extends VercelHumanActionRecoveryFlows {
  readonly runLinkFlow: typeof runLinkFlow;
}

/** Runs the existing project-link flow as a local TUI command. */
export async function runTuiLinkCommand(
  input: { readonly appRoot: string; readonly prompter: Prompter; readonly signal: AbortSignal },
  dependencies: TuiLinkCommandDependencies = {
    runInstallVercelCliFlow,
    runLinkFlow,
    runLoginFlow,
  },
) {
  let result: Awaited<ReturnType<typeof runLinkFlow>>;
  while (true) {
    try {
      result = await dependencies.runLinkFlow({
        appRoot: input.appRoot,
        prompter: input.prompter,
        projectSelection: "create-or-link",
        signal: input.signal,
      });
      break;
    } catch (error) {
      if (!(error instanceof HumanActionRequiredError)) throw error;
      const recovery = await recoverVercelHumanAction(error, dependencies, input);
      if (recovery === "retry") continue;
      return {
        message: "/link dismissed.",
        cancelled: true as const,
        preserveFlowDiagnostics: false,
        effect: { kind: "refresh-identity" as const },
      };
    }
  }
  return result.kind === "cancelled"
    ? {
        message: "/link dismissed.",
        cancelled: true as const,
        preserveFlowDiagnostics: false,
        effect: { kind: "refresh-identity" as const },
      }
    : {
        message: "Linked this project to Vercel.",
        preserveFlowDiagnostics: false,
        effect: { kind: "model-access-changed" as const },
      };
}
