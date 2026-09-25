// Refreshes apps/templates/eve-chat-template (the baseline scripts/test-upstream.mjs
// compares against) from the live official template on vercel/eve main.
// --check only reports whether the local copy is stale.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const templatePath = "apps/templates/eve-chat-template";
const local = resolve(import.meta.dirname, "../../eve-chat-template");
const checkout = mkdtempSync(join(tmpdir(), "eve-upstream-"));
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" });

try {
  git(
    [
      "clone",
      "--quiet",
      "--depth=1",
      "--filter=blob:none",
      "--sparse",
      "https://github.com/vercel/eve",
      checkout,
    ],
    tmpdir(),
  );
  git(["sparse-checkout", "set", templatePath], checkout);
  const live = join(checkout, templatePath);
  const commit = git(["rev-parse", "--short", "HEAD"], checkout).trim();

  const liveFiles = readdirSync(live, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(live, join(entry.parentPath, entry.name)))
    .sort();
  const localFiles = git(["ls-files"], local).split("\n").filter(Boolean).sort();
  const changed = [
    ...liveFiles.filter(
      (file) =>
        !localFiles.includes(file) ||
        !readFileSync(join(live, file)).equals(readFileSync(join(local, file))),
    ),
    ...localFiles.filter((file) => !liveFiles.includes(file)),
  ];

  if (!changed.length) {
    console.log(`PASS: ${templatePath} matches vercel/eve@${commit}`);
  } else if (process.argv.includes("--check")) {
    console.error(
      `${templatePath} is behind vercel/eve@${commit} (${changed.length} files, e.g. ${changed.slice(0, 5).join(", ")}).\n` +
        "Run `pnpm upstream:sync`, then `pnpm test` and port or record each upstream change.",
    );
    process.exitCode = 1;
  } else {
    for (const file of localFiles) rmSync(join(local, file), { force: true });
    cpSync(live, local, { recursive: true });
    console.log(
      `Synced ${templatePath} to vercel/eve@${commit} (${changed.length} files changed).`,
    );
  }
} finally {
  rmSync(checkout, { recursive: true, force: true });
}
