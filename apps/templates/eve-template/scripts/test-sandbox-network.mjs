// The agent's bash tool (eve's just-bash sandbox, as patched in
// patches/eve@0.67.0.patch) keeps internet access but never reaches this
// machine or private networks: eve's own API, the workflow queue and cloud
// metadata stay out of reach of a prompt-injected curl.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createBashSandbox } = await import(
  new URL(
    "../node_modules/eve/dist/src/execution/sandbox/bindings/just-bash-runtime.js",
    import.meta.url,
  )
);
let hits = 0;
const server = createServer((_, response) => {
  hits += 1;
  response.end("internal");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const directory = await mkdtemp(join(tmpdir(), "aegentica-sandbox-"));
const sandbox = await createBashSandbox({
  autoInstall: false,
  host: { loadOptionalPackage: (options) => options.importModule(), resolveProjectPath: (p) => p },
  rootPath: directory,
  sessionKey: "network-fixture",
  storagePath: directory,
});
try {
  for (const url of [
    `http://127.0.0.1:${port}/`,
    `http://localhost:${port}/`,
    `http://[::1]:${port}/`,
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
  ]) {
    const run = await sandbox.spawn({ command: `curl -s -m 3 ${url}` });
    const output = await new Response(run.stdout).text();
    const { exitCode } = await run.wait();
    assert.notEqual(exitCode, 0, `${url} is blocked`);
    assert.equal(output, "", `${url} returns nothing`);
  }
  assert.equal(hits, 0, "no request reached the loopback server");
  console.log("PASS: the bash sandbox cannot reach loopback, private or metadata addresses");
} finally {
  await sandbox.dispose();
  server.close();
  await rm(directory, { recursive: true, force: true });
}
