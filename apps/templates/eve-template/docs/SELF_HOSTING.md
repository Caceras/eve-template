# Model providers and keys

Ægentica can run its models through **Vercel AI Gateway** or **OpenRouter**. Both
keys can be saved at once; one provider is active. Switching provider, replacing
a key or choosing another model applies to the next model call. Nothing is
rebuilt, redeployed or restarted, and running conversations continue on the new
setting from their next step.

The installable app, notifications, the Tasks and Memory pages and server-side
chat history are covered in [WEB_APP.md](./WEB_APP.md); GitHub in
[GITHUB.md](./GITHUB.md); Telegram and the scheduler in
[TELEGRAM_AND_SCHEDULES.md](./TELEGRAM_AND_SCHEDULES.md); releasing to
ai-chat.se in [production-release.md](./production-release.md).

## Settings

Sign in as the password operator and open `/settings`. Each provider has its own
card:

- **Save key** encrypts and stores the key, then makes that provider active.
  An OpenRouter key (`sk-or-…`) pasted into the AI Gateway card, or the reverse,
  is rejected with a hint instead of being stored.
- **Use AI Gateway / Use OpenRouter** switches the active provider. It needs a
  key for that provider.
- **Test connection** sends one short request (`Reply with OK.`) to the selected
  model on that provider, then shows the remaining balance when the provider
  reports one: AI Gateway `GET /v1/credits`, OpenRouter `GET /api/v1/key`. The
  test may use a few tokens. Rejected keys, missing credits, rate limits and
  unsupported models get specific messages; raw provider errors and keys are
  never returned.
- **Remove saved key** deletes the app-saved key. The server environment key,
  if any, applies again.

The provider switch is also in the model picker, so the operator can change
provider without leaving the chat. Viewers who are not the password operator see
the active provider's models but cannot switch.

### Environment fallback

| Provider   | Environment variable | Precedence                              |
| ---------- | -------------------- | --------------------------------------- |
| AI Gateway | `AI_GATEWAY_API_KEY` | App-saved key first, then this variable |
| OpenRouter | `OPENROUTER_API_KEY` | App-saved key first, then this variable |

Without an explicit choice in Settings, the first provider with a usable key is
active (AI Gateway before OpenRouter).

### Storage and security

Keys are encrypted with AES-256-GCM using a key derived from
`EVE_SESSION_SECRET` and written atomically with owner-only permissions to
`settings/gateway.enc` and `settings/openrouter.enc` beside the workflow data
(`EVE_SETTINGS_DIR` overrides the directory). The active choice is
`settings/provider.json`. Keys are never returned by the API, displayed again or
stored in the browser. The settings API requires the operator session, same-origin
POSTs, bounded request bodies and a per-process rate limit.

Keep `EVE_SESSION_SECRET` with the persistent volume. If it changes, saved keys
become unreadable: Settings shows this per provider, and **Remove saved key**
clears the unreadable file so you can save the key again. The other provider is
unaffected.

## Model picker

The composer and Settings share one picker. It lists the active provider's live
catalog, filtered to models this agent can actually run (text in, text out and
tool calling), grouped as **Recent**, **Recommended** and by model maker. Each row
shows the model ID, context window, price per million input/output tokens, and
reasoning or vision support. Search matches name, ID and maker; arrow keys and
Enter select.

Catalogs come from `https://ai-gateway.vercel.sh/v1/models` and
`https://openrouter.ai/api/v1/models`, are cached on the server for five minutes,
and fall back to a bundled snapshot (`lib/model-catalogs.snapshot.json`) when a
provider is unreachable. Refresh the snapshot with
`node scripts/sync-model-catalogs.mjs`.

The browser remembers the chosen model ID and the last five picks, and sends the
choice with each message in `x-aegentica-model`. Many IDs exist on both providers
(for example `anthropic/claude-sonnet-5`), so switching provider keeps your model
when it can. When the active provider does not offer it, the turn uses that
provider's default (`openai/gpt-5.6-luna-fast` on AI Gateway,
`openai/gpt-5.6-luna` on OpenRouter) and the picker says so.

## How routing works

`agent/lib/routed-model.ts` is an eve dynamic model resolved at `step.started`,
the only scope that may return a live provider model object. On each model step
it reads the active provider and key from the settings directory, resolves the
requested model against that provider's catalog, and returns:

- AI Gateway: `createGateway({ apiKey })(modelId)` from the AI SDK.
- OpenRouter: `openRouterModel()` in `lib/openrouter-model.ts`, built on
  `@openrouter/ai-sdk-provider`, with reasoning effort `high` for models that
  support reasoning (OpenRouter takes reasoning as a model setting, not a call
  option).

eve attaches AI Gateway's provider-executed search (`gateway.exa_search`) as
`web_search` to every dynamically selected model. OpenRouter cannot run that
tool, so the OpenRouter model swaps it for OpenRouter's own
`openrouter:web_search` server tool (up to 10 results). Web search therefore
works on both providers; OpenRouter bills its searches separately.

Each selection includes the model's context window from the catalog, which eve
uses for compaction. The root agent and the researcher follow the composer
choice; the reviewer prefers `anthropic/claude-sonnet-5` for an independent
second opinion. The operator's picks are also saved on the server
(`settings/provider.json`), so Telegram and scheduled tasks, which have no
browser, use the last picked model, then the provider default.

The session cost limit (`maxTokenCostUsdPerSession`, $25) works on both
providers: eve reads cost from AI Gateway metadata, so the OpenRouter model
mirrors OpenRouter's reported per-call cost into that field.

The `conditional-helper` demo subagent is never enabled in this app. eve
requires a fixed model for dynamic subagents, so it still uses an AI Gateway
model ID.

## Checks

```sh
node scripts/test-provider-settings.mjs   # auth, CSRF, storage, switching, tests, fail-closed
node scripts/test-models.mjs              # catalogs, fallbacks, picker preference
node scripts/test-openrouter-model.mjs    # OpenRouter request shape, search tool, cost
```

`node scripts/check-model-routing.mjs` runs against a live app (`CHECK_ORIGIN`,
`EVE_CHAT_USERNAME`, `EVE_CHAT_PASSWORD`). For every provider with a key it
switches provider, sends one message and asserts that eve's `step.started`
event used the requested model on that provider. With real keys this sends real,
token-consuming requests. With placeholder keys each provider must reject the
key, which still proves the request reached the right provider.

## Orchestration release

Saved agents and the image library reuse the existing persistent volume. Keep `settings/agents.enc.json`, generated media and metadata together with existing settings, chats, memory and workflow data; preserve `EVE_SESSION_SECRET`. No new database, Vercel hosting dependency, host Docker socket or public runtime port is introduced. The application remains a single-operator installation, not a public multi-tenant agent service.

The intended primary host is `aegentica.se`; `ai-chat.se` remains the working alias until DNS, domain routing and TLS are verified. Configure both domains to this same application, not separate processes with diverging data. Verify the `polish-2026-09-24` health release field after deployment. See [release verification](./RELEASE_VERIFICATION.md) and [agent storage](./AGENTS_AND_ORCHESTRATION.md#storage-and-limits).
