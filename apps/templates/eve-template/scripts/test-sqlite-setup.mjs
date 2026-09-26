// The chat and memory databases are opened by both the Next.js and eve
// processes. First-time setup must wait for the other process's lock, and a
// failed setup must not leave a cached connection without tables.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-sqlite-setup-"));
process.env.EVE_CHAT_DB_PATH = join(directory, "chats.sqlite");
process.env.EVE_MEMORY_DIR = join(directory, "memory");
const chats = await import("../lib/db/sqlite-queries.ts");
const memory = await import("../lib/memory-store.ts");
const { durableMemory } = await import("../agent/lib/durable-memory.ts");

/** Another process holds an exclusive lock on `path` for `ms` after it reports in. */
async function holdLock(path, ms) {
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const { DatabaseSync } = require("node:sqlite");
       const db = new DatabaseSync(${JSON.stringify(path)});
       db.exec("BEGIN EXCLUSIVE");
       console.log("locked");
       setTimeout(() => db.exec("COMMIT"), ${ms});`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise((resolve, reject) => {
    holder.stdout.on("data", (chunk) => String(chunk).includes("locked") && resolve());
    holder.once("exit", (code) => reject(new Error(`lock holder exited (${code})`)));
  });
  return Date.now();
}

/** Setup that fails once (not a database) is retried, then waits out the other process's lock. */
async function check(path, first) {
  await writeFile(path, "not a database, so setup fails ".repeat(40));
  await assert.rejects(async () => first(), /not a database/);
  await rm(path);
  const locked = await holdLock(path, 400);
  await first();
  assert(Date.now() - locked >= 300, "setup waited for the other process");
  await first();
}

try {
  await check(process.env.EVE_CHAT_DB_PATH, () => chats.listChatsByUser("riki"));
  await mkdir(process.env.EVE_MEMORY_DIR);
  await check(join(process.env.EVE_MEMORY_DIR, "profile.sqlite"), () =>
    memory.readOperatorMemory(),
  );
  const agentDirectory = join(directory, "agent");
  const backend = durableMemory(agentDirectory);
  await mkdir(agentDirectory);
  await check(join(agentDirectory, "profile.sqlite"), () =>
    backend.read({ key: "riki", signal: new AbortController().signal }),
  );
  console.log(
    "PASS: chat and memory databases wait for the other process during setup and retry a failed setup",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
