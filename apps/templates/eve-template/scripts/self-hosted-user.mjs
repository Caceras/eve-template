// Start-up steps of scripts/start-self-hosted.mjs that decide who the servers
// run as and what data they own. Kept apart so the tests can import them.
import {
  chmodSync,
  existsSync,
  lchownSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Never re-owned, even when a data variable points there.
const SYSTEM_DIRECTORIES = new Set(
  ["bin", "boot", "dev", "etc", "home", "lib", "lib64", "media", "mnt", "opt", "proc", "root"]
    .concat(["run", "sbin", "srv", "sys", "tmp", "usr", "var"])
    .map((name) => `/${name}`),
);

/**
 * Directories the servers write to: eve's data and caches (`.eve`, which
 * holds the volume in production), Next.js's cache, and the directories of
 * any data path set in the environment. Never `/`, a system directory, or the
 * app itself: the code stays root-owned.
 */
export function dataPaths(env = process.env, cwd = process.cwd()) {
  const app = resolve(cwd);
  const candidates = [join(app, ".eve"), join(app, ".next", "cache")];
  for (const name of ["EVE_SETTINGS_DIR", "EVE_MEMORY_DIR", "EVE_CHAT_DB_PATH"])
    if (env[name]?.trim()) candidates.push(dirname(resolve(app, env[name].trim())));
  const inside = (path, parent) => {
    const rest = relative(parent, path);
    return rest === "" || (rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
  };
  const allowed = candidates.filter(
    (path) => path !== "/" && !SYSTEM_DIRECTORIES.has(path) && !inside(app, path),
  );
  return allowed.filter(
    (path, index) =>
      allowed.indexOf(path) === index &&
      !allowed.some((other) => other !== path && inside(path, other)),
  );
}

/**
 * Gives `path` and everything under it to uid:gid, owner-only. Symbolic links
 * are re-owned themselves and never followed, so a link cannot hand another
 * file to the app.
 */
export function secureTree(path, uid, gid) {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (info.uid !== uid || info.gid !== gid) lchownSync(path, uid, gid);
  if (info.isSymbolicLink()) return;
  if (info.mode & 0o077) chmodSync(path, info.mode & 0o7700);
  if (info.isDirectory())
    for (const name of readdirSync(path)) secureTree(join(path, name), uid, gid);
}

/**
 * The image links eve's just-bash session directory to the volume; the link's
 * target must exist before eve creates sessions in it.
 */
export function ensureSandboxSessions(cwd = process.cwd()) {
  const link = join(resolve(cwd), ".eve", "sandbox-cache", "just-bash", "sessions");
  try {
    if (!lstatSync(link).isSymbolicLink()) return;
  } catch {
    return;
  }
  mkdirSync(resolve(dirname(link), readlinkSync(link)), { recursive: true });
}

/** The official Node.js image's unprivileged user (uid 1000). */
function nodeUser() {
  const entry = readFileSync("/etc/passwd", "utf8")
    .split("\n")
    .find((line) => line.startsWith("node:"));
  if (!entry) throw new Error("this system has no node user");
  const [name, , uid, gid, , home] = entry.split(":");
  return { name, uid: Number(uid), gid: Number(gid), home: home || "/home/node" };
}

/**
 * When started as root (the Docker image), hands the data to the node user and
 * becomes that user, so the servers and the agent's tools cannot change the
 * code or the system. Any failure leaves the app running as root, loudly:
 * availability first. Existing volumes (root-owned files) are re-owned here.
 */
export function runAsNodeUser({ env = process.env, cwd = process.cwd(), log = console } = {}) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return false;
  try {
    const user = nodeUser();
    for (const path of dataPaths(env, cwd)) secureTree(path, user.uid, user.gid);
    process.initgroups(user.name, user.gid);
    process.setgid(user.gid);
    process.setuid(user.uid);
    env.HOME = user.home;
    log.log(`[start] running as ${user.name} (uid ${user.uid})`);
    return true;
  } catch (error) {
    log.warn(
      `[start] WARNING: still running as root, could not switch to the node user (${
        error instanceof Error ? error.message : error
      }). The app works, without that protection.`,
    );
    return false;
  }
}

/** Where the settings live, as lib/secure-settings.ts resolves it. */
export function settingsDirectory(env = process.env, cwd = process.cwd()) {
  return resolve(
    cwd,
    env.EVE_SETTINGS_DIR ||
      join(env.EVE_MEMORY_DIR ? dirname(env.EVE_MEMORY_DIR) : ".eve/.workflow-data", "settings"),
  );
}

/**
 * Deployment mistakes worth knowing at boot. Only a scripted test model is
 * fatal: the others may be deliberate, and a crash loop would take the app down.
 */
export function productionConfigProblems(env = process.env, cwd = process.cwd()) {
  if (env.NODE_ENV !== "production") return { fatal: [], warnings: [] };
  const fatal = [];
  const warnings = [];
  if (env.AEGENTICA_TEST_MODEL?.trim())
    fatal.push(
      "AEGENTICA_TEST_MODEL is set: every reply would be a scripted test reply. Remove it from the deployment.",
    );
  if ((env.EVE_SESSION_SECRET?.trim().length ?? 0) < 32)
    warnings.push(
      "EVE_SESSION_SECRET is missing or shorter than 32 characters. Sign-in fails without it; use 32+ random bytes and keep it with the volume.",
    );
  if (
    !env.EVE_CHAT_PASSWORD?.trim() &&
    !existsSync(join(settingsDirectory(env, cwd), "operator-password.json"))
  )
    warnings.push(
      "No EVE_CHAT_PASSWORD and no password saved in Settings: the temporary default login is in use. Set EVE_CHAT_PASSWORD or change the password in Settings > Security.",
    );
  return { fatal, warnings };
}
