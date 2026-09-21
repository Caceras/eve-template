import { spawn } from "node:child_process";

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
    void shutdown(code ?? 1);
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

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  const hardStop = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
  }, 20_000);
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
  spawnChild(
    "eve",
    ["node_modules/eve/bin/eve.js", "start", "--port", evePort],
    { PORT: evePort, HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", NITRO_PORT: evePort },
  );

  await waitForEve();
  console.log(`[eve] ready on 127.0.0.1:${evePort}`);

  spawnChild(
    "next",
    ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", nextPort],
    { PORT: nextPort },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
