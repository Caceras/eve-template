---
"eve": patch
---

Report BYOK and compaction model spend in workflow tags and OpenTelemetry. Successful BYOK calls now use AI Gateway's market-price estimate as effective cost, compaction calls receive their own step span, and their usage is folded into running token and cost totals.
