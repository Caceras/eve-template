import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["scripts/sync-eve-surface.mjs"], { stdio: "inherit" });
const changes = execFileSync(
  "git",
  ["status", "--porcelain", "--", "lib/eve-surface.generated.ts", "public/reference"],
  { encoding: "utf8" },
);
if (changes.trim()) {
  console.error(
    "eve public surface changed. Run `pnpm eve:surface`, review the diff, and update the template/matrix.",
  );
  process.exit(1);
}
