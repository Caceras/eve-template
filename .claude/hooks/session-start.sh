#!/bin/bash
# Prepares a Claude Code on the web session: Node from .nvmrc, workspace and
# Ægentica dependencies, and Playwright wired to the preinstalled Chromium.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
app="$root/apps/templates/eve-template"
major="$(tr -dc '0-9' < "$root/.nvmrc")"
cache="$HOME/.cache/aegentica-session"
mkdir -p "$cache"

persist() {
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then echo "$1" >> "$CLAUDE_ENV_FILE"; fi
  eval "$1"
}

current="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$current" != "$major" ]; then
  node_dir="$cache/node-v$major"
  if [ ! -x "$node_dir/bin/node" ]; then
    base="https://nodejs.org/dist/latest-v$major.x"
    line="$(curl -fsSL "$base/SHASUMS256.txt" | grep -E "node-v[0-9.]+-linux-x64\.tar\.xz$")"
    file="${line##* }"
    curl -fsSL "$base/$file" -o "$cache/$file"
    echo "${line%% *}  $cache/$file" | sha256sum -c --quiet -
    mkdir -p "$node_dir"
    tar -xJf "$cache/$file" -C "$node_dir" --strip-components=1
    rm "$cache/$file"
  fi
  persist "export PATH=\"$node_dir/bin:\$PATH\""
fi

command -v pnpm > /dev/null || corepack enable
(cd "$root" && pnpm install --frozen-lockfile)
(cd "$app" && pnpm install --frozen-lockfile)

chromium="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2> /dev/null | tail -n 1 || true)"
if [ -n "$chromium" ]; then
  browser="$cache/browser"
  version="$(grep -oE 'playwright@[0-9.]+' "$app/scripts/check-product.sh" | head -n 1)"
  if [ ! -f "$browser/node_modules/playwright/index.mjs" ]; then
    npm install --prefix "$browser" --save-exact --no-audit --no-fund "$version" > /dev/null
  fi
  persist "export PLAYWRIGHT_MODULE=\"$browser/node_modules/playwright/index.mjs\""
  persist "export PLAYWRIGHT_CHROMIUM_EXECUTABLE=\"$chromium\""
fi
