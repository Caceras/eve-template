---
"eve": patch
---

Fix delegated session delivery when optional activity metadata is present with an `undefined` value. Session inbox encoding now treats undefined object fields as omitted across every supported wire version.
