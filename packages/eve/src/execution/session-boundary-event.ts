import { buildAdapterContext } from "#channel/adapter-context.js";
import { callAdapterEventHandler } from "#channel/adapter.js";
import { ContextContainer, contextStorage } from "#context/container.js";
import { dispatchStreamEventHooks } from "#context/hook-lifecycle.js";
import { ParentSessionKey, TurnDeliveryIdsKey } from "#context/keys.js";
import { withContextScope } from "#context/run-step.js";
import { deserializeContext } from "#context/serialize.js";
import { dispatchDynamicToolEvent } from "#context/dynamic-tool-lifecycle.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { readDurableSession } from "#execution/durable-session-store.js";
import { hydrateDurableSession } from "#execution/session.js";
import { resolveEffectiveAgentRuntime } from "#execution/effective-agent-config.js";
import { bindSessionInstrumentation } from "#instrumentation/runtime.js";
import type { HandleEventFn } from "#harness/types.js";
import { getHarnessEmissionState, setHarnessEmissionState } from "#harness/emission.js";
import { createLogger } from "#internal/logging.js";
import {
  encodeMessageStreamEvent,
  stampMessageStreamEvent,
  type UnstampedMessageStreamEvent,
} from "#protocol/message.js";
import { BundleKey, ChannelKey } from "#runtime/sessions/runtime-context-keys.js";

const log = createLogger("execution.workflow-entry");

type SessionBoundaryEvent = Extract<
  UnstampedMessageStreamEvent,
  { type: "session.completed" | "session.failed" | "session.waiting" }
>;

/** Delivers one out-of-turn session boundary through the native instrumentation lifecycle. */
export async function emitSessionBoundaryEvent(input: {
  readonly errorId?: string;
  readonly event: SessionBoundaryEvent;
  readonly parentWritable: WritableStream<Uint8Array>;
  readonly serializedContext: Record<string, unknown>;
  readonly sessionState?: DurableSessionState;
  readonly turnId?: string;
}): Promise<void> {
  const sessionId = (input.serializedContext["eve.sessionId"] as string | undefined) ?? "";
  let ctx: ContextContainer | undefined;

  try {
    ctx = await deserializeContext(input.serializedContext);
  } catch (error) {
    log.error(`failed to restore context for session boundary ${input.event.type} event`, {
      error,
      errorId: input.errorId,
      sessionId,
    });
  }

  const emitInContext = async (): Promise<void> => {
    const handleEvent: HandleEventFn = async (event) => {
      let deliverableEvent = event;
      if (ctx !== undefined) {
        const adapter = ctx.get(ChannelKey);
        if (adapter !== undefined) {
          try {
            deliverableEvent = await callAdapterEventHandler(
              adapter,
              event,
              buildAdapterContext(adapter, ctx),
            );
          } catch (error) {
            log.error(`adapter failed to handle session boundary ${event.type} event`, {
              error,
              errorId: input.errorId,
              sessionId,
            });
          }
        }
      }

      const stamped = stampMessageStreamEvent(deliverableEvent, ctx?.get(TurnDeliveryIdsKey));
      try {
        const writer = input.parentWritable.getWriter();
        try {
          await writer.write(encodeMessageStreamEvent(stamped));
        } finally {
          writer.releaseLock();
        }
      } catch (error) {
        log.error(`failed to write session boundary ${event.type} event to durable stream`, {
          error,
          errorId: input.errorId,
          sessionId,
        });
        return;
      }

      if (ctx !== undefined && input.sessionState !== undefined) {
        const bundle = ctx.get(BundleKey);
        if (bundle !== undefined) {
          await dispatchStreamEventHooks({ ctx, event: stamped, registry: bundle.hookRegistry });
          await dispatchDynamicToolEvent({
            ctx,
            event: stamped,
            messages: [],
            resolvers: bundle.resolvedAgent.dynamicToolResolvers ?? [],
          });
        }
      }
    };

    let instrumentation: ReturnType<typeof bindSessionInstrumentation>;
    if (ctx !== undefined) {
      try {
        const bundle = ctx.require(BundleKey);
        instrumentation = bindSessionInstrumentation({
          agentName: bundle.turnAgent.id,
          ctx,
          rootSessionId: ctx.get(ParentSessionKey)?.rootSessionId ?? sessionId,
          sessionId,
        });
      } catch (error) {
        log.error(`failed to bind instrumentation for session boundary ${input.event.type} event`, {
          error,
          errorId: input.errorId,
          sessionId,
        });
      }
    }

    const emit =
      instrumentation?.createHandleEvent({
        handleEvent,
        turnId: input.turnId,
      }) ?? handleEvent;
    try {
      if (ctx === undefined) {
        await emit(input.event);
      } else {
        await contextStorage.run(ctx, () => emit(input.event));
      }
    } catch (error) {
      log.error(`instrumentation failed to handle session boundary ${input.event.type} event`, {
        error,
        errorId: input.errorId,
        sessionId,
      });
    } finally {
      try {
        await instrumentation?.flush();
      } catch (error) {
        log.error(
          `failed to flush instrumentation after session boundary ${input.event.type} event`,
          {
            error,
            errorId: input.errorId,
            sessionId,
          },
        );
      }
    }
  };

  const bundle = ctx?.get(BundleKey);
  if (ctx !== undefined && input.sessionState !== undefined && bundle !== undefined) {
    const durableSession = await readDurableSession(input.sessionState);
    const effectiveAgent = resolveEffectiveAgentRuntime(bundle, ctx);
    const session = hydrateDurableSession({
      compactionOverrides: { thresholdPercent: effectiveAgent.thresholdPercent },
      durable: durableSession,
      turnAgent: effectiveAgent.turnAgent,
    });
    const emission = getHarnessEmissionState(session.state);
    // The epilogue advanced the durable cursor; callbacks still belong to the ended turn.
    const callbackSession =
      emission.turnId === "" && emission.sequence > 0
        ? setHarnessEmissionState(session, { ...emission, sequence: emission.sequence - 1 })
        : session;
    await withContextScope(ctx, callbackSession, async (enrichedSession) => {
      await emitInContext();
      return { result: undefined, session: enrichedSession };
    });
  } else {
    await emitInContext();
  }
}
