---
issue: https://github.com/vercel/eve/issues/1476
status: implemented
last_updated: "2026-09-15"
---

# Session prewarming

## Summary

The eve HTTP channel can create a conversation session before its first message. This lets a
browser start Workflow, claim the session inbox, and run session-scoped lifecycle handlers while
the user is still composing their first turn.

## Authoring API

The HTTP API accepts `POST /eve/v1/session` with an empty object. The TypeScript client exposes the
same operation as `client.sessions.create()`, and the React, Vue, and Svelte bindings expose
`prewarm()`. Existing `client.sessions.create({ message })` calls still create the session and start
turn zero in one request.

Message-free creation is conversation-only. It accepts request auth and session capabilities, but
rejects turn-scoped context, output schemas, callbacks, and activity observers. The create promise
keeps the existing acceptance boundary: it resolves after the server returns `202`, before the
workflow necessarily reaches its parked state.

## Runtime boundary

A prewarmed workflow creates durable session state and claims its stable inbox, emits
`session.started`, runs session-scoped lifecycle handlers, emits `session.waiting`, and blocks on
the inbox. It does not run channel delivery, emit `turn.started`, or invoke a model. The first
message resumes that inbox and remains `turn_0`.

Session tracing starts during prewarming, while turn tracing starts only after the first delivery.
Session initialization state, including dynamic instructions and sandbox state requested by
session handlers, is committed before the workflow parks.

## Boundaries

This change does not add address-based creation to custom channels, a separate prewarm timeout, or
a readiness protocol. The configured session timeout begins at creation, and an early first send
uses the client's existing session-start retry behavior.
