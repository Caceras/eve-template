---
"eve": patch
---

Remote child agents now authenticate completion, progress, and activity callbacks with their own identity: on Vercel the deployment's OIDC token is sent to every HTTPS callback URL, and `eveChannel({ callbackAuth })` supplies the credential elsewhere. In return, `POST /eve/v1/session` and session-message bodies carrying `callback` or `activityObserver` are rejected with 400 unless the caller is a `service` or `runtime` principal (local `eve dev` exempt).
