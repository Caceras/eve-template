---
"eve": patch
---

The eve channel now ends a live session stream response after ten seconds without an event, advertised via the `x-eve-stream-idle-close-ms` header, so client reconnects no longer leave abandoned serverless invocations running until their execution timeout. The client reconnects immediately after that advertised close without counting it toward its idle-reconnect limit; clients from earlier eve versions still count it, so a manual `session.stream()` on an older frontend may stop following a quiet session after roughly seventy seconds against an upgraded server.
