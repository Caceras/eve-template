# In-app AI Gateway settings


Sign in as the operator and open `/settings` to save a Vercel AI Gateway API key.
The authenticated, same-origin API never returns the key. It encrypts the key with
AES-256-GCM using a key derived from `EVE_SESSION_SECRET`, and writes it atomically
with owner-only permissions beneath the persistent workflow directory. Preserve
that session secret alongside the volume: rotating it makes saved credentials
unreadable. Restore the original secret, or remove the unreadable settings file
and restart before entering the key again.

The app-saved key takes precedence over `AI_GATEWAY_API_KEY`. The self-hosted
supervisor notices changes, gracefully reconnects the eve process and marks the
key active only after runtime health succeeds. Next.js stays running. Finish
active conversations before saving; no rebuild or redeployment is needed.
`EVE_SETTINGS_DIR` can override the storage directory for local tests.

“Test connection” sends a small request to the configured root model through the
fixed Vercel AI Gateway endpoint. It may consume tokens. Saving and applying a
key does not itself prove model access; the connection test reports provider
rejection, billing requirements, rate limits and timeouts without exposing raw
provider errors or credentials. Settings currently require the shared password
operator session; OAuth users cannot administer this credential.

Run `node scripts/test-gateway-settings.mjs` to verify storage and API boundaries.

## Model picker

The composer and Settings expose the full Gateway model catalog from
`/v1/models`, searchable by name, provider, model ID and type. The server refreshes
its cache every five minutes and falls back to a complete dated snapshot if the
catalog cannot be reached. All model types remain visible. This tool-using agent
can select language models with text input/output and tool support; incompatible
entries explain why they require another interface.

The browser remembers the choice, and each send or human-input response carries
it in `x-aegentica-model`. Authentication records the choice as caller metadata.
The root agent resolves it against the current catalog at `turn.started`, so the
selection controls the next model call rather than merely changing a UI label.
Subagents retain their own authored model configurations. Provider access and
billing remain subject to the saved Gateway key. Switching models can change
cost and prompt-cache behavior.

Run `node scripts/test-model-picker.mjs`, `node scripts/test-model-catalog.mjs`,
and `node scripts/test-gateway-settings.mjs` for focused checks.
`node scripts/check-model-routing.mjs` exercises a running local app (or
`CHECK_ORIGIN`) and verifies runtime `step.started.modelId` for two providers.
It sends real model requests, which can consume tokens when a valid key is set.
