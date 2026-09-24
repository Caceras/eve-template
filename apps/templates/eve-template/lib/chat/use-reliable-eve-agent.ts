"use client";

import { useCallback, useRef } from "react";
import {
  useEveAgent as useUpstreamAgent,
  type EveMessageData,
  type UseEveAgentOptions,
  type UseEveAgentHelpers,
} from "eve/react";

/** eve reports terminal failures in its snapshot, not by rejecting send(). */
export function useEveAgent(options: UseEveAgentOptions<EveMessageData>) {
  const failure = useRef<Error | undefined>(undefined);
  const upstream = useUpstreamAgent({
    ...options,
    onError(error) {
      failure.current = error;
      options.onError?.(error);
    },
    onFinish(snapshot) {
      failure.current = snapshot.error;
      options.onFinish?.(snapshot);
    },
  });
  const upstreamSend = upstream.send;
  const upstreamRespond = upstream.respond;
  const send: UseEveAgentHelpers<EveMessageData>["send"] = useCallback(
    async (message, settings) => {
      failure.current = undefined;
      await upstreamSend(message, settings);
      if (failure.current) throw failure.current;
    },
    [upstreamSend],
  );
  const respond: UseEveAgentHelpers<EveMessageData>["respond"] = useCallback(
    async (responses, settings) => {
      failure.current = undefined;
      await upstreamRespond(responses, settings);
      if (failure.current) throw failure.current;
    },
    [upstreamRespond],
  );
  return { ...upstream, send, respond };
}
