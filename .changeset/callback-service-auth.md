---
"eve": patch
---

Remote child agents now authenticate completion, progress, and activity callbacks to their parent with their own identity: on Vercel the deployment's OIDC token is sent to any HTTPS callback URL, and `eveChannel({ callbackAuth })` supplies the credential elsewhere. In return, the eve HTTP routes bind the `callback` or `activityObserver` destination to the caller who nominated it: when `trustedForwarders` is set the caller must satisfy it (403 otherwise), and without a policy the caller must be a `service` or `runtime` principal (400 otherwise), except under local `eve dev`.
