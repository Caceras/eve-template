// The self-hosted supervisor with stand-in eve and Next.js processes: shutdown
// fits Docker's 10s stop grace, and any unexpected child exit fails the container.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const supervisor = fileURLToPath(new URL("./start-self-hosted.mjs", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "aegentica-supervisor-"));
const record = join(root, "eve.json");
const stub = async (path, source) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), source);
};
// eve records how it was started; STUCK_EVE ignores SIGTERM like a hung shutdown.
await stub(
  "node_modules/eve/bin/eve.js",
  `require("node:fs").writeFileSync(${JSON.stringify(record)}, JSON.stringify({
     pid: process.pid,
     argv: process.argv.slice(2),
     shutdown: process.env.NITRO_SHUTDOWN_TIMEOUT,
     workflow: process.env.WORKFLOW_LOCAL_BASE_URL,
   }));
   if (process.env.STUCK_EVE) process.on("SIGTERM", () => {});
   setInterval(() => {}, 1000);`,
);
// Next.js exits cleanly on its own when NEXT_EXITS is set.
await stub(
  "node_modules/next/dist/bin/next",
  `if (process.env.NEXT_EXITS) setTimeout(() => process.exit(0), 300);
   setInterval(() => {}, 1000);`,
);

function start(env) {
  const running = spawn(process.execPath, [supervisor], {
    cwd: root,
    // Port 9 refuses connections, so the readiness probe never reaches a real server.
    env: {
      ...process.env,
      NODE_ENV: "",
      AEGENTICA_TEST_MODEL: "",
      PORT: "9",
      EVE_NEXT_PRODUCTION_PORT: "9",
      ...env,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errors = "";
  running.stderr.on("data", (chunk) => (errors += chunk));
  const exited = new Promise((resolve) =>
    running.once("exit", (code, signal) => resolve({ code, signal, errors })),
  );
  return { running, exited };
}

async function eveStarted() {
  for (let i = 0; i < 200; i++) {
    const raw = await readFile(record, "utf8").catch(() => "");
    if (raw) return JSON.parse(raw);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the eve stand-in never started");
}

let eve;
try {
  // Scripted test replies must never reach production: nothing starts.
  const mocked = await start({ NODE_ENV: "production", AEGENTICA_TEST_MODEL: "mock" }).exited;
  assert.equal(mocked.code, 1, mocked.errors);
  assert.match(mocked.errors, /AEGENTICA_TEST_MODEL is set/);
  assert.equal(await readFile(record, "utf8").catch(() => ""), "", "eve never started");

  // A child that exits with code 0 is still unexpected: the supervisor exits non-zero.
  // A weak secret or the default login only warns in production.
  const clean = start({
    NEXT_EXITS: "1",
    NODE_ENV: "production",
    EVE_SESSION_SECRET: "short",
    EVE_CHAT_PASSWORD: "",
    EVE_SETTINGS_DIR: join(root, "settings"),
  });
  eve = await eveStarted();
  // Children inherit the owner-only umask: the record eve wrote is 0600.
  assert.equal((await stat(record)).mode & 0o777, 0o600);
  assert.deepEqual(eve.argv.slice(0, 4), ["start", "--host", "127.0.0.1", "--port"]);
  assert.equal(eve.shutdown, "5000");
  assert.equal(eve.workflow, "http://127.0.0.1:9");
  const failed = await clean.exited;
  assert.equal(failed.code, 1, failed.errors);
  assert.match(failed.errors, /\[next\] exited unexpectedly \(code 0\)/);
  assert.match(failed.errors, /WARNING: EVE_SESSION_SECRET is missing or shorter/);
  assert.match(failed.errors, /WARNING: No EVE_CHAT_PASSWORD .* temporary default login/);

  // SIGTERM with a child that ignores it: SIGKILL follows, all within Docker's 10s grace.
  await rm(record);
  const stuck = start({ STUCK_EVE: "1" });
  eve = await eveStarted();
  const stopping = Date.now();
  stuck.running.kill("SIGTERM");
  const stopped = await stuck.exited;
  const elapsed = Date.now() - stopping;
  assert.equal(stopped.code, 0, stopped.errors);
  assert(elapsed >= 6_000, `the stuck child was given time to stop (${elapsed}ms)`);
  assert(elapsed < 9_000, `shutdown finished before Docker's SIGKILL (${elapsed}ms)`);
  assert.throws(() => process.kill(eve.pid, 0), { code: "ESRCH" });
  console.log(
    "PASS: supervisor refuses a test model in production and warns about weak sign-in settings, gives children an owner-only umask, keeps eve on loopback with a 5s shutdown, stops within Docker's grace period, exits non-zero on any unexpected child exit",
  );
} finally {
  if (eve) {
    try {
      process.kill(eve.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
  await rm(root, { recursive: true, force: true });
}
