import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The settings lock is shared by the Next.js and eve processes on one volume.
const directory = await mkdtemp(join(tmpdir(), "aegentica-settings-lock-"));
process.env.EVE_SETTINGS_DIR = directory;
const settingsModule = new URL("../lib/secure-settings.ts", import.meta.url).href;
const { withSettingsLock, writeJson, readJson } = await import(settingsModule);

/** Runs `source` in another Node process with the same settings directory. */
function child(source) {
  const running = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const settings = await import(${JSON.stringify(settingsModule)});\n${source}`,
    ],
    { env: { ...process.env, EVE_SETTINGS_DIR: directory }, stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  running.stdout.on("data", (chunk) => (output += chunk));
  const exited = new Promise((resolve) => running.once("exit", (code) => resolve(code)));
  return { running, exited, output: () => output };
}

/** A lock that belongs to no live owner: a foreign process table and a 60s-old owner file. */
async function plantStaleLock(name) {
  const lock = join(directory, `${name}.lock`);
  await mkdir(lock, { recursive: true });
  const owner = join(lock, "0123456789abcdef");
  await writeFile(owner, JSON.stringify({ pid: 1, space: "another-host" }));
  const old = new Date(Date.now() - 60_000);
  await utimes(owner, old, old);
}

try {
  // Waiters racing to break the same stale lock never both enter the critical section.
  let active = 0;
  let most = 0;
  for (let round = 0; round < 25; round++) {
    await plantStaleLock("race");
    await Promise.all(
      Array.from({ length: 8 }, () =>
        withSettingsLock("race", async () => {
          most = Math.max(most, ++active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
        }),
      ),
    );
  }
  assert.equal(most, 1, "one holder at a time while stale locks are broken");

  // Separate processes: each holder creates an exclusive marker, which fails if two overlap.
  await plantStaleLock("processes");
  const workers = Array.from({ length: 4 }, () =>
    child(`
      const { open, unlink } = await import("node:fs/promises");
      const marker = ${JSON.stringify(join(directory, "processes.holder"))};
      for (let i = 0; i < 25; i++)
        await settings.withSettingsLock("processes", async () => {
          await (await open(marker, "wx")).close();
          await new Promise((resolve) => setTimeout(resolve, 1));
          await unlink(marker);
        });
    `),
  );
  for (const worker of workers) assert.equal(await worker.exited, 0);

  // A lock left by a killed sibling process is taken at once, not after the 30s staleness window.
  const holder = child(`
    await settings.withSettingsLock("killed", async () => {
      console.log("held");
      await new Promise(() => setInterval(() => {}, 1000));
    });
  `);
  await Promise.race([
    new Promise((resolve) =>
      holder.running.stdout.on("data", () => holder.output().includes("held") && resolve()),
    ),
    holder.exited.then((code) => assert.fail(`the lock holder exited early (${code})`)),
  ]);
  holder.running.kill("SIGKILL");
  await holder.exited;
  assert.equal((await readdir(join(directory, "killed.lock"))).length, 1);
  const started = Date.now();
  assert.equal(await withSettingsLock("killed", async () => "taken"), "taken");
  assert(Date.now() - started < 1000, "a dead owner's lock is free without waiting");

  // An empty lock directory (older releases, or a crash while releasing) is free.
  await mkdir(join(directory, "legacy.lock"));
  assert.equal(await withSettingsLock("legacy", async () => "taken"), "taken");

  // A failed write removes its temporary file instead of leaving one per attempt,
  // and released locks and unused claims leave nothing behind.
  await mkdir(join(directory, "blocked.json"));
  await writeFile(join(directory, "blocked.json", "keep"), "");
  await assert.rejects(writeJson("blocked.json", { value: 1 }));
  await writeJson("saved.json", { value: 2 });
  assert.deepEqual(await readJson("saved.json"), { value: 2 });
  const leftovers = (await readdir(directory)).filter(
    (entry) => entry.endsWith(".tmp") || entry.endsWith(".lock"),
  );
  assert.deepEqual(leftovers, []);
  console.log(
    "PASS: settings lock breaks stale locks for one waiter only, across processes, frees a killed owner's lock at once, cleans temporary files",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
