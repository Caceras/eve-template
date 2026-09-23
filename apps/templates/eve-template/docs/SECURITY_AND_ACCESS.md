# Security and access

This deployment is a private, single-operator workspace, not a multi-tenant service. Saved agents share that operator's permissions. Tool approval policies remain in force.

## Change the password

Open Settings > Security. Supply the current password and a different passphrase of at least 16 characters (up to 256 UTF-8 bytes). A successful change keeps this browser signed in and revokes other password sessions. It does not change `EVE_SESSION_SECRET`, the encryption key, saved model-provider credentials, profiles, chats or memory. Existing v1 cookies are invalid after the first deployment of this release, so sign in once again.

The password is persisted as a salted scrypt verifier (`N=32768`, `r=8`, `p=3`, 16-byte random salt), not plaintext or reversible encryption, in `settings/operator-password.json` on the existing private volume. Writes use the shared cross-process settings lock and atomic 0600 files. Password verification uses asynchronous Node crypto. Cookie signatures bind the current username and credential revision to the independent signing secret. Invalid stored credentials fail closed.

The legacy bootstrap password remains only to avoid silently locking an existing self-hosted operator out when environment secrets are unavailable to the deployer. Settings warns when it is still in use or the environment password is shorter than 16 characters. **Replace it before entering API keys or private information.** A deployer must not call the installation production-secure while this warning remains. A strong environment password or a saved password takes precedence over the legacy bootstrap value. New deployments must explicitly set a strong `EVE_CHAT_PASSWORD` and `EVE_SESSION_SECRET` in Dokploy.

## Recovery

An authorized server operator can recover access by setting a new strong `EVE_CHAT_PASSWORD` in the existing Dokploy environment and removing only `settings/operator-password.json` from the existing private volume. Do not replace the full environment with a partial or redacted copy. Do not rotate `EVE_SESSION_SECRET` as a password-reset mechanism: existing encrypted provider keys and agent profiles depend on it. Keep the volume private and backed up. Never expose recovery through an unauthenticated HTTP endpoint.

Settings writes require a valid operator session, a matching origin, bounded bodies and rate limits. Password changes additionally require the current password and recheck the session inside the cross-process lock. The browser uses HTTP-only, same-site cookies; TLS and the reverse proxy remain required. These controls are not a claim of an independent penetration test.

## Verification

`node scripts/test-security.mjs` covers unauthorized access, origin/body bounds, password policy, concurrent rotations, old-cookie revocation, preservation of encrypted settings and corrupt-file denial. The isolated Playwright script also changes its test password through the real UI and verifies that existing profiles remain accessible only with the new session.

Primary references: [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
