---
"eve": patch
---

Task-mode sessions now wait for their background results before emitting completion, so a launch acknowledgement no longer closes the response stream. Deploy session drivers and turn workers at the same revision; result bundling and quiet scheduled launches are preserved.
