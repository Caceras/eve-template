---
title: "Build an Agent Router"
description: "Route requests to specialist eve agents with model-directed delegation, controlled workflows, and routing evals."
contentType: "How-to"
---

<!--
Content plan
- Overview: Build one root router with billing and support specialists.
- Goal: Configure, constrain, and test request routing between eve agents.
- Audience: Developers who have an eve project and need specialist delegation.
- Content: Choose a routing style, build the default model-directed path, add a controlled workflow, test routing, and diagnose common failures.
- Open questions: Whether a future router template should replace the inline customer-service example.
-->

An agent router receives a request, selects a specialist, and later combines the specialist's result into its response. In eve, the usual router is a root agent with [declared subagents](/docs/subagents#declared-subagents).

This guide builds a customer-service router with two specialists:

```text
incoming request
       |
   root router
    /       \
billing   support
```

Use this structure when callers talk to one root agent. Use an [agent workspace](/docs/concepts/project-structure#several-root-agents) when each specialist also needs its own endpoint or channel.

## Choose a routing style

Start with model-directed routing. Add a workflow only when you need one validated routing surface.

| Requirement                                                | Route with                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Let the root choose a specialist from clear descriptions   | Declared subagents                                                         |
| Hide specialists and allow calls only through one tool     | A workflow tool with `ctx.agent()`                                         |
| Expose routes only for specific callers or tenants         | [Dynamic subagents](/docs/guides/dynamic-capabilities#dynamic-subagents)   |
| Delegate to another eve deployment                         | [Remote agents](/docs/guides/remote-agents)                                |
| Let application code select a separately addressable agent | An [agent workspace](/docs/concepts/project-structure#several-root-agents) |

## Build a model-directed router

Model-directed routing exposes each specialist as a tool. The root model compares the request with each subagent's `description`, then delegates to the best match.

### Create the agent structure

Start from an existing [eve project](/docs/getting-started), then add two subagent directories:

```text
agent/
├── agent.ts
├── instructions.md
└── subagents/
    ├── billing/
    │   ├── agent.ts
    │   └── instructions.md
    └── support/
        ├── agent.ts
        └── instructions.md
```

Each directory under `agent/subagents/` becomes a specialist. Its directory name becomes the model-facing tool name.

### Define distinct route contracts

Give each specialist a specific `description`. State what belongs on the route and what does not.

```ts title="agent/subagents/billing/agent.ts"
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Resolve invoices, charges, refunds, subscription payments, and billing-account questions. Do not troubleshoot product behavior.",
  model: "anthropic/claude-opus-4.8",
});
```

```ts title="agent/subagents/support/agent.ts"
import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Troubleshoot setup, errors, integrations, and product behavior. Do not answer invoices, charges, refunds, or payment questions.",
  model: "anthropic/claude-opus-4.8",
});
```

The descriptions form the route table. Avoid broad descriptions such as “helps customers,” because overlapping routes make selection less predictable.

### Scope each specialist

Give each specialist its own instructions. Return a visible mismatch when a request reaches the wrong route.

```md title="agent/subagents/billing/instructions.md"
# Role

Resolve billing requests using the billing tools and policies available to you.

If the request requires product troubleshooting, return `ROUTE_MISMATCH: support`.
Do not invent account data, charges, refund status, or policy exceptions.
```

```md title="agent/subagents/support/instructions.md"
# Role

Resolve product setup, integration, error, and behavior questions.

If the request concerns a charge, invoice, refund, or payment, return
`ROUTE_MISMATCH: billing`.
Do not claim that a billing action occurred.
```

By default, a declared subagent does not inherit the root's authored instructions, tools, connections, skills, or sandbox. Add each required capability inside that specialist's directory. A subagent can explicitly reuse its parent's sandbox when shared files and processes are intentional. See [The isolation boundary](/docs/subagents#the-isolation-boundary) for the full list.

### Configure the root

Disable the root-only built-in `agent` tool when the router should use only declared delegation paths. This prevents the root from delegating to an unnamed copy of itself. It does not disable the root's other tools.

```ts title="agent/agent.ts"
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-opus-4.8",
  tool: false,
});
```

Tell the root how to choose routes and handle requests that span both specialists:

```md title="agent/instructions.md"
# Role

Route customer requests to the billing and support specialists.

# Routing

- Send invoices, charges, refunds, and payment questions to `billing`.
- Send setup, errors, integrations, and product behavior to `support`.
- For a request that needs both, call both specialists in the same response.
- Give each specialist the complete request and relevant known context.
- If a specialist returns `ROUTE_MISMATCH`, call the suggested specialist once.
- Do not answer a specialist question without delegation.

After the specialists finish, give the customer one concise response.
```

Direct model-visible subagent calls run as background tasks. The initial call returns a task receipt, and a completion notification wakes the root in a later turn. When both routes run together, eve delivers their successful completion notifications as one batch before the root synthesizes the response.

Subagents do not see the parent's conversation history. The root must put all relevant context in each subagent's `message`. Do not send data that the specialist should not receive.

### Exercise each route

Start the project:

```bash
npm run dev
```

Send requests that cover one route, multiple routes, and unclear intent:

| Request                                             | Expected delegation                       |
| --------------------------------------------------- | ----------------------------------------- |
| “Why was I charged twice?”                          | `billing` only                            |
| “The upload fails with a 403.”                      | `support` only                            |
| “My upload fails, and I was charged for the retry.” | `billing` and `support`                   |
| “Something is wrong with my account.”               | Ask for the missing detail before routing |

Keep the request and expected route together. They become the first cases in your routing evals.

## Put routing behind one workflow tool

Use a workflow tool when specialists must remain hidden from the root model. The root still selects a destination, but it can only invoke specialists through one validated input and one orchestration path.

Keep `tool: false` on the root as shown above. This removes the built-in self-delegation path. Then set `tool: false` on each specialist:

```ts title="agent/subagents/billing/agent.ts"
import { defineAgent } from "eve";

export default defineAgent({
  description: "Resolve customer billing requests for the routing workflow.",
  model: "anthropic/claude-opus-4.8",
  tool: false,
});
```

Apply the same change to `support`. Hidden subagents remain available to authored workflow tools through `ctx.agent()`.

Then add the routing tool:

```ts title="agent/tools/route_request.ts"
import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

export default defineWorkflowTool({
  description: "Route a customer request to billing or support.",
  inputSchema: z.object({
    team: z.enum(["billing", "support"]),
    request: z.string().min(1),
  }),
  async execute({ team, request }, ctx) {
    "use workflow";
    return ctx.agent(team, { message: request });
  },
});
```

Update the root instructions so every specialist request goes through `route_request`. The `team` enum allows only the two authored names, but it does not verify that matching subagents exist. A missing target fails at runtime. The blocking workflow waits durably for the selected child and returns its result to the root in the current turn.

This pattern controls orchestration, not classification. The root model still supplies `team`. If a business rule must choose the destination without a model decision, route in application code to a separately addressable [workspace agent](/docs/concepts/project-structure#several-root-agents).

## Add a routing eval

Routing behavior can change when descriptions, instructions, or models change. Assert the selected subagent directly instead of grading only the final prose.

```ts title="evals/routing/billing.eval.ts"
import { defineEval } from "eve/evals";

export default defineEval({
  description: "Routes duplicate charges to billing and not support.",
  async test(t) {
    const turn = await t.send("Why was I charged twice for one month?");

    t.succeeded();
    turn.event("subagent.called", {
      data: { name: "billing" },
      count: 1,
    });
    turn.notEvent("subagent.called", {
      data: { name: "support" },
    });
  },
});
```

This eval checks the route dispatched in the initial root turn. It does not prove that the background child finished or that the root delivered its final answer.

Add cases for support, mixed intent, ambiguity, and adversarial wording. For a mixed request, assert one `subagent.called` event for each specialist. Run the suite with:

```bash
eve eval routing
```

See [Evals](/docs/evals/overview) for configuration, datasets, and CI setup.

## Avoid common routing failures

| Symptom                                                     | Check                                                                          | Next action                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| The root chooses different specialists for similar requests | The route descriptions overlap.                                                | Make descriptions mutually exclusive and add concrete boundaries.                              |
| The specialist lacks context                                | The delegated `message` omits details from the parent conversation.            | Include the complete request and relevant facts in `message`.                                  |
| The specialist cannot use a root tool or connection         | The capability exists only under the root agent.                               | Add the capability under the specialist's directory.                                           |
| The root bypasses the intended route                        | The built-in `agent` or direct specialist tools remain visible.                | Disable the built-in `agent`, or hide specialists with `tool: false` and use a workflow tool.  |
| A route exposes sensitive actions                           | The specialist's tools or connections lack approval or authorization controls. | Add approvals and route authorization. Delegation is not an approval boundary.                 |
| A specialist needs its own public endpoint                  | Clients must address the specialist directly.                                  | Move it to an agent workspace. Expose it as a workspace peer if the router must still call it. |

## Extend the router

- Use [dynamic subagents](/docs/guides/dynamic-capabilities#dynamic-subagents) to expose routes by tenant, feature flag, or authenticated caller.
- Use [remote agents](/docs/guides/remote-agents) when a specialist has a separate deployment or owner.
- Use an [output schema](/docs/subagents#what-the-parent-sees) when the root must combine typed specialist results.
- Start from the [LLM council template](https://eve.dev/templates/eve-llm-council-template) to study parallel fan-out and result synthesis.

Workspace members do not become router targets automatically. Declare each peer with `defineWorkspaceAgent` under the router's `agent/subagents/` directory. `vercel dev` provides the local workspace transport. `eve dev` starts only one selected member, so separately running peers need an explicit transport.
