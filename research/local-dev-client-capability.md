---
issue: https://github.com/vercel/eve/pull/3590#discussion_r4064820411
status: deferred
last_updated: "2026-09-21"
---

# Developer-held local development capability

## Decision

Do not implement this change for PR #3590. The product boundary is not that
only a client on the developer's machine may edit source. `eve dev` is a trusted
development server started by someone with local filesystem access. Developers
may deliberately expose it to remote clients.

PR #3590 reduces accidental exposure by granting local self-modification only
to requests whose direct peer is loopback. It does not make a forwarded
endpoint safe for untrusted callers. A reverse proxy, SSH forwarding, or tunnel
that connects to `eve dev` over loopback can present external callers as
loopback peers. This is documented beside `getLocalDevCapability()` and in the
PR description.

## Preserved behavior and risk

- A direct network request does not receive the local editing capability.
- A developer can intentionally expose editing by forwarding a loopback
  endpoint. The developer must disable self-modification or protect that
  endpoint before admitting untrusted callers.
- `localDev()` route authentication remains independent of source-editing
  capability. Do not imply that either one authenticates the other.
- The default dev host is `127.0.0.1`. Self-modification is disabled for newly
  initialized projects; an installed extension enables local editing unless its
  `local.enabled` setting is false.

This accepts the risk of a trusted developer forwarding a privileged dev server.
It does not accept accidental inherited privilege across unrelated deliveries;
that remains the scope of
[delivery-scoped authorization](./local-dev-delivery-authorization.md).

## Revisit trigger

Implement a developer-held credential only if eve changes its contract to
promise that remote clients cannot initiate edits, or if it needs a secure
remote editing workflow. The credential must then be separate from authored
route auth, be delivered only through private local server state to managed
clients, and be verified before source access is granted. It must not reuse the
workflow transport secret or expose a credential-discovery HTTP endpoint.

Validation for such a future change must include a real loopback proxy and
WebSocket forwarder without the credential, server restart and credential
rotation, managed-client reconnects, and leakage checks for logs, traces, and
workflow state.
