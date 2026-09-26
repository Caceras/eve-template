// The agent's bash sandbox keeps its files across containers. The image links
// eve's just-bash session directory to the volume (Dockerfile); a session
// whose files are gone anyway (created before that link, or a restored
// volume) is recreated from its template by eve's just-bash provider, as
// patched in patches/eve@0.67.0.patch, instead of failing every later call.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createJustBashSandboxProvider } = await import(
  new URL("../node_modules/eve/dist/src/execution/sandbox/bindings/just-bash.js", import.meta.url)
);
const base = await mkdtemp(join(tmpdir(), "aegentica-sandbox-resume-"));
const storagePath = join(base, "sandbox-cache");
const volume = join(base, "workflow-data", "sandbox-sessions");
await mkdir(join(storagePath, "just-bash"), { recursive: true });
await mkdir(volume, { recursive: true });
await symlink(volume, join(storagePath, "just-bash", "sessions"));
const host = {
  loadOptionalPackage: (options) => options.importModule(),
  resolveProjectPath: (p) => p,
};
const provider = createJustBashSandboxProvider({ autoInstall: false });
const session = { host, session: { id: "resume-fixture" }, storagePath };
const run = async (handle, command) => {
  const child = await handle.sandbox.spawn({ command });
  const output = await new Response(child.stdout).text();
  assert.equal((await child.wait()).exitCode, 0, command);
  return output;
};
const warn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args.join(" "));
try {
  const artifact = await provider.prepare({
    host,
    resources: {},
    sourceRevision: "t",
    storagePath,
  });
  const started = await provider.start(session, undefined, artifact);
  await run(started.handle, "echo kept > /workspace/note.txt");
  await started.handle.onSessionStop();
  const [stored] = await readdir(volume);
  assert(stored, "the session's files are on the volume");

  const resumed = await provider.resume(session, artifact, started.state);
  assert.equal(await run(resumed, "cat /workspace/note.txt"), "kept\n");
  await resumed.onSessionStop();

  await rm(join(volume, stored), { recursive: true, force: true });
  const recreated = await provider.resume(session, artifact, started.state);
  assert(existsSync(join(volume, stored, "fs")), "the session root is back");
  assert.match(warnings.join("\n"), /no longer exists; recreating it/);
  assert.equal(await run(recreated, "echo again"), "again\n");
  await recreated.onSessionStop();

  await assert.rejects(
    provider.resume(session, artifact, { ...started.state, generation: "other" }),
    /incompatible/,
    "state from another environment is still refused",
  );
  console.log(
    "PASS: sandbox files live on the volume through the sessions link, and a session whose files are gone is recreated from its template",
  );
} finally {
  console.warn = warn;
  await rm(base, { recursive: true, force: true });
}
