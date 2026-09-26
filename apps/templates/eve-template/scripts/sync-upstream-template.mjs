// Fetches the live official chat template from vercel/eve main into
// node_modules/.cache/eve-chat-template, the baseline scripts/test-upstream.mjs compares against.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const templatePath = "apps/templates/eve-chat-template";
const target = resolve(import.meta.dirname, "../node_modules/.cache/eve-chat-template");
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
  rmSync(target, { recursive: true, force: true });
  cpSync(join(checkout, templatePath), target, { recursive: true });
  // The template keeps its Next.js app in apps/web; this repository keeps the
  // same files at its root, so the baseline does too.
  const web = join(target, "apps/web");
  if (existsSync(web)) {
    cpSync(web, target, { recursive: true });
    rmSync(join(target, "apps"), { recursive: true, force: true });
  }
  const commit = git(["rev-parse", "--short", "HEAD"], checkout).trim();
  console.log(`Fetched ${templatePath} from vercel/eve@${commit} into node_modules/.cache/`);
} finally {
  rmSync(checkout, { recursive: true, force: true });
}
