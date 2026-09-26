import { spawn } from "node:child_process";
import {
  ensureSandboxSessions,
  productionConfigProblems,
  runAsNodeUser,
} from "./self-hosted-user.mjs";

// Production (NODE_ENV=production, the image) refuses a scripted test model
// and warns about a weak secret or the default login without stopping.
const { fatal, warnings } = productionConfigProblems();
for (const warning of warnings) console.warn(`[start] WARNING: ${warning}`);
if (fatal.length) {
  for (const problem of fatal) console.error(`[start] ${problem}`);
  process.exit(1);
}

// Everything the servers create (settings, chats, run records) is private to
// their user; children inherit the mask.
process.umask(0o077);
try {
  ensureSandboxSessions();
} catch (error) {
  console.warn(`[start] WARNING: sandbox session directory: ${error?.message ?? error}`);
}
runAsNodeUser();

const nextPort = process.env.PORT?.trim() || "3000";
const evePort = process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274";
const host = process.env.NEXT_HOST?.trim() || "0.0.0.0";
const children = new Set();
let shuttingDown = false;

function spawnChild(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);

    if (shuttingDown) return;

    const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[${name}] exited unexpectedly (${detail})`);
    // Even a clean exit is a failure here, so the container restarts.
    void shutdown(code || 1);
  });

  return child;
}

async function waitForEve() {
  const deadline = Date.now() + 60_000;
  const url = `http://127.0.0.1:${evePort}/eve/v1/health`;
  let lastFailure = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`eve did not become ready at ${url} within 60s (${lastFailure})`);
}

// Docker waits 10s after SIGTERM before it kills the container, so the whole
// shutdown stays under that: children get 7s (eve's server gives open
// requests 5s), then SIGKILL.
const HARD_STOP_MS = 7_000;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  const hardStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, HARD_STOP_MS);
  hardStop.unref();

  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          child.once("exit", resolve);
        }),
    ),
  );

  clearTimeout(hardStop);
  process.exit(exitCode);
}

process.once("SIGTERM", () => void shutdown(0));
process.once("SIGINT", () => void shutdown(0));

try {
  // eve stays on loopback: only Next.js (its /eve/v1 proxy) and the task runner
  // reach it. `eve start` overrides HOST from its own --host flag (default
  // 0.0.0.0), so the flag is what keeps it off the container network. Its
  // workflow queue posts to itself, so its base URL is pinned to the same address.
  // Its graceful shutdown is 5s: Nitro documents NITRO_SHUTDOWN_TIMEOUT (ms,
  // default 30s); the srvx server in this Nitro reads SERVER_SHUTDOWN_TIMEOUT (s).
  spawnChild(
    "eve",
    ["node_modules/eve/bin/eve.js", "start", "--host", "127.0.0.1", "--port", evePort],
    {
      PORT: evePort,
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: evePort,
      NITRO_SHUTDOWN_TIMEOUT: "5000",
      SERVER_SHUTDOWN_TIMEOUT: "5",
      WORKFLOW_LOCAL_BASE_URL: `http://127.0.0.1:${evePort}`,
    },
  );

  spawnChild("next", ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", nextPort], {
    PORT: nextPort,
  });

  void waitForEve()
    .then(() => console.log(`[eve] ready on 127.0.0.1:${evePort}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
