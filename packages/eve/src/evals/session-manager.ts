import type { Client } from "#client/client.js";
import { AssertionCollector } from "#evals/assertions/collector.js";
import { EvalSessionDriver, type EvalSessionStartedEvent } from "#evals/session.js";
import { cleanupEvalSessions } from "#evals/session-cleanup.js";
import type { EveEvalLiveTurn, EveEvalSessionResult } from "#evals/types.js";

export class EvalSessionManager {
  readonly #client: Client;
  readonly #signal: AbortSignal | undefined;
  readonly #collector: AssertionCollector;
  readonly #onSessionStart: ((event: EvalSessionStartedEvent) => void) | undefined;
  readonly #sessions: EvalSessionDriver[] = [];
  #primary: EvalSessionDriver | undefined;

  constructor(input: {
    readonly client: Client;
    readonly collector?: AssertionCollector;
    readonly onSessionStart?: (event: EvalSessionStartedEvent) => void;
    readonly signal?: AbortSignal;
  }) {
    this.#client = input.client;
    this.#collector = input.collector ?? new AssertionCollector();
    this.#onSessionStart = input.onSessionStart;
    this.#signal = input.signal;
  }

  get primary(): EvalSessionDriver {
    this.#primary ??= this.#createSession(true);
    return this.#primary;
  }

  newSession(): EvalSessionDriver {
    return this.#createSession(false);
  }

  async attachSession(
    sessionId: string,
    options?: { readonly startIndex?: number },
  ): Promise<EvalSessionDriver> {
    const session = this.#createAttachedSession(sessionId, options);
    await session.readTurn(options);
    return session;
  }

  watchTurn(sessionId: string, options?: { readonly startIndex?: number }): EveEvalLiveTurn {
    return this.#createAttachedSession(sessionId, options).watchTurn(options, sessionId);
  }

  snapshots(): readonly EveEvalSessionResult[] {
    return this.#sessions.map((session) => session.snapshot());
  }

  lastTurnSession(): EvalSessionDriver | undefined {
    if (this.#primary?.lastTurn !== undefined) {
      return this.#primary;
    }

    return this.#sessions.find((session) => session.lastTurn !== undefined);
  }

  hasActivity(): boolean {
    return this.#sessions.length > 0;
  }
  /** @internal */
  async cleanup(signal: AbortSignal): Promise<readonly PromiseSettledResult<void>[]> {
    return await cleanupEvalSessions(this.#sessions, signal);
  }

  #createSession(primary: boolean): EvalSessionDriver {
    const session = new EvalSessionDriver({
      client: this.#client,
      collector: this.#collector,
      onSessionStart: this.#onSessionStart,
      primary,
      signal: this.#signal,
    });
    this.#sessions.push(session);
    return session;
  }

  #createAttachedSession(
    sessionId: string,
    options?: { readonly startIndex?: number },
  ): EvalSessionDriver {
    const session = new EvalSessionDriver({
      client: this.#client,
      collector: this.#collector,
      onSessionStart: this.#onSessionStart,
      primary: false,
      session: this.#client.sessions.attach(sessionId, {
        streamIndex: options?.startIndex ?? 0,
      }),
      signal: this.#signal,
    });
    this.#sessions.push(session);
    return session;
  }
}
