---
"eve": patch
---

Remote child agents now authenticate completion, progress, and activity callbacks to their parent with their own identity: on Vercel the deployment's OIDC token is sent to any HTTPS callback URL, and `eveChannel({ callbackAuth })` supplies the credential elsewhere. In return, the eve HTTP routes only accept `callback` or `activityObserver` work from callers authenticated as a `service` or `runtime` principal (400 otherwise), except under local `eve dev`.
