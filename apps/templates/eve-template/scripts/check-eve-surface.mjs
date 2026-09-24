import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Compare the synced files before and after a fresh sync rather than asking git,
// so the check also works on a working tree with uncommitted changes.
function snapshot() {
  const hash = createHash("sha256");
  const files = ["lib/eve-surface.generated.ts"];
  if (existsSync("public/reference"))
    for (const entry of readdirSync("public/reference", { recursive: true, withFileTypes: true }))
      if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(file));
  return hash.digest("hex");
}

const before = snapshot();
execFileSync(process.execPath, ["scripts/sync-eve-surface.mjs"], { stdio: "inherit" });
if (snapshot() !== before) {
  console.error(
    "eve public surface changed. Run `pnpm eve:surface`, review the diff, and update the template/matrix.",
  );
  process.exit(1);
}
