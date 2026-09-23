#!/usr/bin/env bash
# Isolated CI runner: never reads production credentials or production storage.
set -euo pipefail
export QA_ARTIFACTS="${QA_ARTIFACTS:-/tmp/aegentica-qa}"
mkdir -p "$QA_ARTIFACTS"
run_check() {
  local name="$1"
  shift
  if "$@" > "$QA_ARTIFACTS/$name.log" 2>&1; then
    echo "PASS: $name"
  else
    tail -100 "$QA_ARTIFACTS/$name.log"
    echo "FAIL: $name"
    exit 1
  fi
}
for name in agent-profiles chat-store github-settings image-generation media-library memory-store models openrouter-model production provider-settings push-and-task-runner telegram-and-schedules security; do
  run_check "test-$name" node "scripts/test-$name.mjs"
done
run_check build-eve pnpm build:eve
run_check typecheck pnpm typecheck
run_check build-next pnpm build
run_check browser-install npm install --prefix /tmp/aegentica-browser --save-exact playwright@1.63.0
run_check chromium-install node /tmp/aegentica-browser/node_modules/playwright/cli.js install --with-deps chromium
export EVE_SESSION_SECRET="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
export EVE_CHAT_PASSWORD="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
export EVE_CHAT_USERNAME=Riki
export BETTER_AUTH_URL=http://localhost:3000
state="$(mktemp -d /tmp/aegentica-state-XXXXXX)"
export EVE_MEMORY_DIR="$state/memory"
export EVE_CHAT_DB_PATH="$state/chats.sqlite"
export PLAYWRIGHT_MODULE=/tmp/aegentica-browser/node_modules/playwright/index.mjs
mkdir -p "$EVE_MEMORY_DIR"
node scripts/start-self-hosted.mjs > "$QA_ARTIFACTS/server.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -rf "$state"' EXIT
ready=0
for n in $(seq 1 60); do
  if curl -fsS http://localhost:3000/api/health > "$QA_ARTIFACTS/health.json"; then ready=1; break; fi
  sleep 2
done
if test "$ready" != 1; then cat "$QA_ARTIFACTS/server.log"; exit 1; fi
if node scripts/test-product-browser.mjs > "$QA_ARTIFACTS/browser.log" 2>&1; then
  echo 'PASS: browser'
else
  tail -100 "$QA_ARTIFACTS/browser.log"
  NODE_ENV=development BETTER_AUTH_URL=http://localhost:3001 pnpm exec next dev --port 3001 > "$QA_ARTIFACTS/hydration-server.log" 2>&1 &
  debug_server=$!
  node scripts/diagnose-hydration.mjs > "$QA_ARTIFACTS/hydration.log" 2>&1 || true
  kill "$debug_server" 2>/dev/null || true
  echo 'FAIL: browser'
  exit 1
fi
node --input-type=module -e '
import { readFileSync } from "node:fs";
const result=JSON.parse(readFileSync(process.env.QA_ARTIFACTS+"/browser-results.json","utf8"));
if(result.checks.length<7 || result.checks.some(check=>!check.passed) || result.pageErrors.length) process.exit(1);
console.log(`PASS: ${result.checks.length} browser acceptance groups; no uncaught page errors`);
'
run_check browser-security node scripts/test-security-browser.mjs
