import type { TurnCaller } from "#channel/types.js";
import type { SettledTurn } from "#harness/types.js";
import { addTokenUsage } from "#shared/add-token-usage.js";
import type { TokenUsage } from "#shared/token-usage.js";

/** One outstanding answer, spanning any turns needed to consume its task results. */
export class Invocation {
  readonly caller: TurnCaller | undefined;
  private readonly pendingTasks = new Set<string>();
  private deferredUsage: TokenUsage | undefined;

  constructor(caller?: TurnCaller) {
    this.caller = caller;
  }

  get usage(): TokenUsage | undefined {
    return this.deferredUsage;
  }

  admitTasks(taskIds: readonly string[]): void {
    for (const taskId of taskIds) this.pendingTasks.add(taskId);
  }

  receiveResults(taskIds: readonly string[]): void {
    for (const taskId of taskIds) this.pendingTasks.delete(taskId);
  }

  /** A received result can make a turn runnable without producing an answer yet. */
  finishTurn(answer: SettledTurn | undefined): SettledTurn | undefined {
    if (answer === undefined) return undefined;
    if (answer.isError !== true && this.pendingTasks.size > 0) {
      if (this.caller !== undefined) {
        this.deferredUsage = addTokenUsage(this.deferredUsage, answer.usage);
      }
      return undefined;
    }
    return { ...answer, usage: addTokenUsage(this.deferredUsage, answer.usage) };
  }
}
