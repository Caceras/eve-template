// Start-up rules of the self-hosted image: which directories the node user
// gets, that re-owning makes them owner-only without following symbolic links,
// the sandbox sessions link target, and which production settings are fatal.
import assert from "node:assert/strict";
import { existsSync, lstatSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dataPaths,
  ensureSandboxSessions,
  productionConfigProblems,
  secureTree,
} from "./self-hosted-user.mjs";

const base = await mkdtemp(join(tmpdir(), "aegentica-user-"));
const mode = (path) => statSync(path).mode & 0o777;
try {
  // Production layout: the volume inside .eve, so it is walked once.
  assert.deepEqual(
    dataPaths({ EVE_MEMORY_DIR: "/app/.eve/.workflow-data/profile-memory" }, "/app"),
    ["/app/.eve", "/app/.next/cache"],
  );
  assert.deepEqual(
    dataPaths(
      {
        EVE_MEMORY_DIR: "/data/volume/memory",
        EVE_CHAT_DB_PATH: "/data/volume/chats.sqlite",
        EVE_SETTINGS_DIR: "/srv/aegentica/settings",
      },
      "/app",
    ),
    ["/app/.eve", "/app/.next/cache", "/srv/aegentica", "/data/volume"],
  );
  // Never the filesystem root, a system directory, or the app (code) itself.
  assert.deepEqual(
    dataPaths(
      {
        EVE_MEMORY_DIR: "/app/memory",
        EVE_CHAT_DB_PATH: "/chats.sqlite",
        EVE_SETTINGS_DIR: "/tmp/s",
      },
      "/app",
    ),
    ["/app/.eve", "/app/.next/cache"],
  );
  assert.deepEqual(dataPaths({ EVE_CHAT_DB_PATH: "chats.sqlite" }, "/app"), [
    "/app/.eve",
    "/app/.next/cache",
  ]);

  // Owner-only, and a link to something outside is re-owned itself, never followed.
  const data = join(base, "data");
  const outside = join(base, "outside");
  await mkdir(join(data, "settings"), { recursive: true });
  await mkdir(outside);
  await writeFile(join(data, "chats.sqlite"), "x");
  await writeFile(join(data, "settings", "gateway.enc"), "x");
  await writeFile(join(outside, "secret"), "x");
  for (const path of [data, join(data, "settings"), outside]) await chmod(path, 0o755);
  for (const path of [join(data, "chats.sqlite"), join(data, "settings", "gateway.enc")])
    await chmod(path, 0o644);
  await chmod(join(outside, "secret"), 0o644);
  await symlink(join(outside, "secret"), join(data, "file-link"));
  await symlink(outside, join(data, "dir-link"));
  const { uid, gid } = lstatSync(data);
  secureTree(data, uid, gid);
  assert.equal(mode(data), 0o700);
  assert.equal(mode(join(data, "settings")), 0o700);
  assert.equal(mode(join(data, "chats.sqlite")), 0o600);
  assert.equal(mode(join(data, "settings", "gateway.enc")), 0o600);
  assert.equal(mode(outside), 0o755, "a linked directory is not followed");
  assert.equal(mode(join(outside, "secret")), 0o644, "a linked file is not followed");
  secureTree(join(base, "missing"), uid, gid);

  // The image's sessions link points at the volume; its target is created.
  const app = join(base, "app");
  await mkdir(join(app, ".eve", "sandbox-cache", "just-bash"), { recursive: true });
  const sessions = join(app, ".eve", ".workflow-data", "sandbox-sessions");
  await symlink(sessions, join(app, ".eve", "sandbox-cache", "just-bash", "sessions"));
  ensureSandboxSessions(app);
  assert(existsSync(sessions));
  ensureSandboxSessions(join(base, "no-app"));

  // Only a scripted test model stops a production start; the rest warn.
  const settings = join(base, "settings");
  const strong = { EVE_SESSION_SECRET: "s".repeat(64), EVE_CHAT_PASSWORD: "p".repeat(20) };
  assert.deepEqual(productionConfigProblems({ ...strong, AEGENTICA_TEST_MODEL: "mock" }, base), {
    fatal: [],
    warnings: [],
  });
  assert.deepEqual(productionConfigProblems({ NODE_ENV: "production", ...strong }, base), {
    fatal: [],
    warnings: [],
  });
  const mock = productionConfigProblems(
    { NODE_ENV: "production", ...strong, AEGENTICA_TEST_MODEL: "mock" },
    base,
  );
  assert.match(mock.fatal.join(), /AEGENTICA_TEST_MODEL/);
  const weak = productionConfigProblems(
    { NODE_ENV: "production", EVE_SESSION_SECRET: "short", EVE_SETTINGS_DIR: settings },
    base,
  );
  assert.deepEqual(weak.fatal, []);
  assert.match(weak.warnings.join("\n"), /EVE_SESSION_SECRET/);
  assert.match(weak.warnings.join("\n"), /temporary default login/);
  await mkdir(settings);
  await writeFile(join(settings, "operator-password.json"), "{}");
  assert.doesNotMatch(
    productionConfigProblems(
      { NODE_ENV: "production", EVE_SESSION_SECRET: "s".repeat(64), EVE_SETTINGS_DIR: settings },
      base,
    ).warnings.join(),
    /default login/,
    "a password saved in Settings counts",
  );
  console.log(
    "PASS: data directories (never /, system directories or the code), owner-only re-owning without following links, sandbox sessions link target, fatal test model in production",
  );
} finally {
  await rm(base, { recursive: true, force: true });
}
