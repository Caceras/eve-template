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
