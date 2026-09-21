---
issue: "untracked"
status: draft
last_updated: "2026-09-21"
---

# Dynamic agent discovery

Generalize the existing agent handles into one session registry of advertised destinations that tools and startup hooks can populate, independently of whether a destination has a running session.

This is the design discussion. The implementation in [draft PR #3567][pr] is an
experiment against the proposal, not the specification. The examples below make
the authoring experience concrete; their API spelling and descriptor fields are
proposed. Open decisions remain open even where the branch already chose a behavior.

## What we have aligned on

- **Discover destinations.** An agent can know about another agent without knowing
  whether it is running, reachable, or currently accepting work.
- **One registry.** Generalize the existing handles collection. `AgentRegistry`
  replaces that abstraction; it does not introduce a second collection. Existing
  static agents participate in the same model.
- **Registration is an authoring operation.** Ordinary tools can register handles
  inside `defineTool.execute`; startup hooks can populate the registry too.
- **Membership means advertisement.** Every registered destination is advertised.
  Search and ranking stay outside this mechanism: a future search tool produces
  registrations like any other tool.
- **Handles are callable.** A tool can pass the returned handle to `ctx.agent()`.
  Registration, advertisement, and calling need explicit boundaries.

The starting limitation is that the [existing handles][original-store] primarily
record delegated children and their execution state. Adding discovery should make
how an entry was obtained irrelevant to its later use.

## Terms and proposed API

A **destination** identifies an agent that can be addressed. A **handle** is the
caller's reference to a registered destination. A **registry** is the session's
collection of those entries. An **invocation** is an attempt to send work to a
destination; a **conversation** is the receiving agent session in which work runs.
Whether a handle becomes bound to one conversation is an open decision below.

```ts
const handle = ctx.registerAgent({
  key: "reviewer",
  description: "Review proposed changes.",
  target: { kind: "remote", url: "https://reviewer.example.com" },
});

await ctx.agent(handle, { message: "Review this change." });
```

The first operation changes the registry. The second attempts an invocation.
Only the second needs to contact the destination. The example does not prescribe
whether its return value is an admission receipt or the completed answer.

| Proposed operation                 | Purpose                                                                           | Decision still needed                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `registerAgent(destination)`       | Return a handle that code can use immediately and the model can subsequently see. | Identity, duplicate registration, and replacement rules.                  |
| `agent(handle, input)`             | Address the registered destination through the ordinary calling path.             | Conversation selection, return value, and calls while work is running.    |
| `updateAgent(handle, description)` | Change what the model is told about a destination.                                | Whether updates may also change routing, and how stale references behave. |
| `unregisterAgent(handle)`          | Remove the destination from subsequent advertisements and handle lookups.         | Treatment of accepted work and later re-registration.                     |

Static declarations supply destinations through the same registry. Their authored
configuration still determines capabilities and credentials. A new registry should
not require a separate calling API just because an entry came from a directory.

## Decisions to align on

1. **Destination versus conversation identity.** Does `h` continue to identify a
   reusable destination after the first call, or become bound to one conversation?
   How does a caller request a fresh conversation or address an existing one?
2. **Registration identity and lifetime.** What makes two descriptors the same
   destination? Are keys aliases or identities? What survives removal, replacement,
   and session resume? What may an update change?
3. **Invocation and authority.** What does `ctx.agent(h, input)` return, what does a
   second call mean while work is running, and who can steer or cancel that work?
   Should ordinary tools and workflows expose different completion behavior?
4. **Commit and publication.** Which callback/checkpoint commits registration?
   What happens if a tool registers and then fails, or invokes before the step is
   persisted? Does an update ever wake an idle agent?

Evaluate these choices against predictable calling behavior, explicit authority,
and the amount of state authors must understand. Exact capacities, transport
adapters, serialized keys, provider classes, and task-claim machinery follow those
decisions; they should not define them.

## Examples for discussion

Both examples use the same external directory. The file adapter is application
code; a database, HTTP directory, or search tool could produce the same descriptors.
Neither example assumes the listed agents are online.

### External source

An operator-managed JSON file outside the agent directory contains:

```json
[
  {
    "key": "reviewer",
    "description": "Review proposed changes.",
    "url": "https://reviewer.example.com"
  }
]
```

`lib/agent-directory.ts` reads and validates the file. The schema is illustrative
application validation, not a proposed framework capacity or transport policy.

```ts
import { readFile } from "node:fs/promises";
import { z } from "zod";

const directory = z.array(
  z.object({
    key: z.string().min(1).max(128),
    description: z.string().min(1).max(2048),
    url: z.string().url(),
    sessionId: z.string().min(1).optional(),
  }),
);

export async function readAgentDirectory() {
  const path = process.env.AGENT_DIRECTORY_PATH;
  if (!path) throw new Error("Set AGENT_DIRECTORY_PATH to the agent directory JSON file.");
  const entries = directory.parse(JSON.parse(await readFile(path, "utf8")));
  return entries.map(({ key, description, url, sessionId }) => ({
    key,
    description,
    target: { kind: "remote" as const, url, sessionId },
  }));
}
```

An optional `sessionId` illustrates a directory advertising an existing
conversation. Omitting it advertises an agent destination without selecting a
conversation. How each form affects later invocations must be specified; knowing
a session ID does not establish permission to call or cancel it.

### A tool loads and registers a destination

`agent/tools/load-agent.ts` reads the source at tool execution time. It can stop
after registration, allowing the model to choose later, or call the handle in the
same execution.

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";
import { readAgentDirectory } from "../../lib/agent-directory";

export default defineTool({
  description: "Load an agent from the directory and optionally send it a message.",
  inputSchema: z.object({
    key: z.string().min(1).max(128),
    message: z.string().min(1).optional(),
  }),
  async execute({ key, message }, ctx) {
    const destination = (await readAgentDirectory()).find((entry) => entry.key === key);
    if (!destination) throw new Error(`No agent destination named "${key}" in the directory.`);
    const handle = ctx.registerAgent(destination);
    if (message !== undefined) return ctx.agent(handle, { message });
    return { agentId: handle.id };
  },
});
```

For example, `{ key: "reviewer" }` discovers the destination;
`{ key: "reviewer", message: "Review this change." }` also invokes it. The returned
tool value is not what makes the registration visible: registry publication does.

### A startup hook populates the registry

`agent/hooks/agents.ts` registers the directory before the first model request.
It uses the same operation as the tool, without making an invocation.

```ts
import { defineHook } from "eve/hooks";
import { readAgentDirectory } from "../../lib/agent-directory";

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      for (const destination of await readAgentDirectory()) {
        ctx.registerAgent(destination);
      }
    },
  },
});
```

Using both examples in one session raises a useful identity question: should
loading the same directory key again return the same handle? The current branch
does that for identical descriptors. This is a candidate rule, not a consequence
of choosing a registry.

### Declared agents and existing conversations

The same proposed registration surface can refer to authored configuration or to
an externally supplied conversation:

```ts
const specialist = ctx.registerAgent({
  key: "review-specialist",
  description: "Use the declared research agent for reviews.",
  target: { kind: "agent", name: "researcher" },
});

const existingReview = ctx.registerAgent({
  key: "existing-review",
  description: "Continue an existing review conversation.",
  target: {
    kind: "remote",
    url: "https://reviewer.example.com",
    sessionId: "review-session-id",
  },
});

await ctx.agent(specialist, { message: "Review this change." });
await ctx.agent(existingReview, { message: "The date should be Friday." });
```

`researcher` is already registered by its static declaration. The first example
proposes an additional alias, not a requirement to register static agents again.
The second makes the conversation choice explicit. Neither registration grants
ownership of the destination or its work.

## When registry changes enter context

The proposed boundary is: code sees a registration immediately; the model sees a
snapshot when its next request is prepared. Persistence and failure behavior need
an explicit rule rather than inheriting whichever callback currently commits state.

Let `R` be the session registry, `h` the returned handle, and `M` the registry
listing included in a particular model request. These are proposal notation, not
new runtime APIs.

| Boundary                        | Registry and model state                                       | Side effect                                                             |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| External lookup                 | `R` is unchanged.                                              | The tool or hook reads the external source.                             |
| `registerAgent(destination)`    | `R` now contains `h`; an existing `M` is unchanged.            | Validate and record the destination; do not contact it.                 |
| Later code in that callback     | `ctx.agent(h, input)` can resolve `h` from `R`.                | An invocation can contact the destination before another model request. |
| Request after `session.started` | `M` includes registrations made by the startup hook.           | Send the first model request with the listing.                          |
| Request after a discovery tool  | `M` includes the updated registry after required tool results. | Send the next model request with the listing.                           |
| Already-running model request   | Its `M` stays unchanged.                                       | No retroactive context mutation.                                        |
| Session checkpoint and resume   | Restore the committed registry before preparing another `M`.   | Persist accepted changes; rollback rules remain to be decided.          |

The listing needs identity and enough description to choose a destination. Being
listed must not imply that the destination is reachable, idle, or authorized for
this particular request. Routing coordinates and credentials are separate from
what the model needs to see.

## Calling is part of the research

The API needs to distinguish destination knowledge from invocation outcomes:

| Situation                                     | Required distinction                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| No conversation exists                        | Registration still succeeds; a call must have an explicit conversation-selection rule.                                                     |
| Destination is offline or rejects the request | The invocation fails; that does not by itself invalidate knowledge of the destination.                                                     |
| Work is already running                       | Define whether the call steers that work, queues new work, or starts a separate invocation. A task claim is not a user-facing explanation. |
| A response is lost after remote acceptance    | The caller cannot infer that work never started. Retry semantics need to account for duplicate delivery.                                   |
| An existing external session is registered    | Addressability does not establish authority to reset the session or cancel another caller's work.                                          |
| An entry is removed or replaced               | Define what stale handles and already-accepted invocations mean independently of advertisement.                                            |

The parent/child ownership discussion belongs here as a design dependency.
A handle identifies what is being addressed; an internal task ID may identify an
invocation. The existence of the current task/claim implementation does not settle
which identifiers authors need or which calls should be accepted.

## What this enables and how to judge it

An application can seed destinations from a directory, reveal new ones through an
ordinary tool, call a discovered destination immediately, or let the model choose
on its next turn. These all use the same registration mechanism. Search ranking
and source integrations remain application concerns.

The proposal should be explainable through these observable checks:

- Startup registration appears in the first model request without starting agents.
- A tool registers `h`, uses it in the same execution, and the next model request
  advertises it even if the tool did not return the handle.
- Static and externally discovered destinations use the same lookup and calling
  rules once registered.
- An offline destination remains known after a failed call; the failure reports
  an invocation outcome rather than silently choosing a different conversation.
- A repeated call, removal, failed callback, and restart each have a specified
  result that follows the four decisions above.

The [experimental registry][registry], [context tests][context-tests], and
[publication tests][publication-tests] provide implementation evidence to challenge
these rules. Passing them would not by itself establish that the design is right.
The [authoring docs][authoring-docs] should follow the resulting research decisions.

[pr]: https://github.com/vercel/eve/pull/3567
[original-store]: https://github.com/vercel/eve/blob/d88aedeef375c654a04da7e81bb06e7098478306/packages/eve/src/subagents/handles/store.ts
[registry]: ../packages/eve/src/subagents/registry/registry.ts
[context-tests]: ../packages/eve/src/context/agent-registry.integration.test.ts
[publication-tests]: ../packages/eve/src/harness/tool-loop.test.ts
[authoring-docs]: ../docs/subagents/index.mdx#register-destinations-at-runtime
