// One shared operator account and one replica: a global limit cannot be bypassed
// by spoofing forwarded IP headers. Use shared storage before scaling replicas.
let startedAt = 0;
let attempts = 0;
export function enforceLoginLimit(now = Date.now()): number {
  if (now - startedAt >= 60_000) {
    startedAt = now;
    attempts = 0;
  }
  attempts += 1;
  return attempts > 10 ? Math.max(1, Math.ceil((60_000 - (now - startedAt)) / 1000)) : 0;
}
