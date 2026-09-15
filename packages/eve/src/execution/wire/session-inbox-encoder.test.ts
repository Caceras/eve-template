import { describe, expect, it } from "vitest";

import { deriveChildWorkIdentity } from "#execution/activity-work.js";
import {
  SESSION_INBOX_WIRE_VERSIONS,
  SessionInboxWireError,
  type SessionInboxWireTarget,
} from "#execution/wire/session-inbox-contract.js";
import { sessionInboxWire } from "#execution/wire/session-inbox-encoder.js";

const legacyTargets = [
  { variant: "deliver", version: 0 },
  { variant: "send", version: 0 },
  { version: 1 },
] satisfies readonly SessionInboxWireTarget[];
const targets = [
  { variant: "deliver", version: 0 },
  { variant: "send", version: 0 },
  ...SESSION_INBOX_WIRE_VERSIONS.map((version) => ({ version })),
] satisfies readonly SessionInboxWireTarget[];
const activityObserver = {
  sink: { url: "https://example.com/activity", version: 1 as const },
};
const childWorkIdentity = deriveChildWorkIdentity({
  callId: "call-1",
  kind: "task",
  name: "researcher",
  parentSessionId: "root",
  parentTurnId: "turn-1",
  parentWork: {
    id: "work:root",
    kind: "root-turn",
    rootSessionId: "root",
    rootTurnId: "turn-1",
  },
});

function withUndefinedObjectFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withUndefinedObjectFields) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries([
    ...Object.entries(value).map(([key, item]) => [key, withUndefinedObjectFields(item)]),
    ["undefinedField", undefined],
  ]) as T;
}

describe("session inbox encoder", () => {
  it.each(targets)("treats undefined object fields as omitted for target %o", (target) => {
    const omitted = {
      caller: {
        activityObserver: { ...activityObserver, workIdentity: childWorkIdentity },
        callId: "call-1",
        replyTo: { kind: "hook" as const, token: "callback-token" },
        subagentName: "researcher",
      },
      kind: "send" as const,
      payload: { message: "hello" },
    };
    const explicit = withUndefinedObjectFields({
      ...omitted,
      caller: {
        ...omitted.caller,
        activityObserver: {
          ...omitted.caller.activityObserver,
          workIdentity: { ...childWorkIdentity, label: undefined },
        },
        taskId: undefined,
      },
      payload: { ...omitted.payload, outputSchema: undefined },
      requestId: undefined,
    });

    expect(sessionInboxWire.encode(explicit, target)).toStrictEqual(
      sessionInboxWire.encode(omitted, target),
    );
  });

  it.each(targets)("treats an undefined activity observer as omitted for target %o", (target) => {
    const caller = {
      callId: "call-1",
      replyTo: { kind: "hook" as const, token: "callback-token" },
      subagentName: "researcher",
    };
    const omitted = { caller, kind: "send" as const, payload: { message: "hello" } };
    const explicit = { ...omitted, caller: { ...caller, activityObserver: undefined } };

    expect(sessionInboxWire.encode(explicit, target)).toStrictEqual(
      sessionInboxWire.encode(omitted, target),
    );
  });

  it.each(
    legacyTargets.flatMap(
      (target) =>
        [
          [target, undefined],
          [target, activityObserver],
        ] as const,
    ),
  )("projects caller fields for target %o with activity observer %o", (target, observer) => {
    const caller = {
      activityObserver: observer,
      callId: "call-1",
      futureCallerField: "future-value",
      replyTo: { kind: "hook" as const, token: "callback-token" },
      subagentName: "researcher",
    };

    const wire = sessionInboxWire.encode(
      { caller, kind: "send", payload: { message: "legacy" } },
      target,
    );

    expect(wire).toHaveProperty("caller", {
      callId: "call-1",
      replyTo: { kind: "hook", token: "callback-token" },
      subagentName: "researcher",
    });
  });

  it.each(legacyTargets)("wraps malformed caller fields for target %o", (target) => {
    expect(() =>
      sessionInboxWire.encode(
        {
          caller: {
            callId: 1 as never,
            replyTo: { kind: "hook", token: "callback-token" },
            subagentName: "researcher",
          },
          kind: "send",
          payload: { message: "legacy" },
        },
        target,
      ),
    ).toThrowError(SessionInboxWireError);
  });
});
