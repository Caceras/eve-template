import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { useTemporaryDirectories } from "#internal/testing/use-temporary-app-roots.js";

import { runDoctor } from "./doctor.js";

const createScratchDirectory = useTemporaryDirectories();

async function createWorkspace(root: string): Promise<void> {
  await mkdir(join(root, "agents", "research", "agent"), { recursive: true });
  await mkdir(join(root, "agents", "support", "agent"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { eve: "workspace:*" }, packageManager: "pnpm@11" }),
  );
  await writeFile(join(root, "agents", "research", "agent", "instructions.md"), "Research.\n");
  await writeFile(join(root, "agents", "support", "agent", "instructions.md"), "Support.\n");
}

describe("runDoctor", () => {
  it("reports every workspace member from the workspace root", async () => {
    const root = await createScratchDirectory("eve-doctor-workspace-");
    await createWorkspace(root);

    const result = await runDoctor(root, { offline: true });

    expect(result.scope).toBe("workspace");
    expect(result.workspaceRoot).toBe(root);
    expect(result.agents.map((agent) => agent.name)).toEqual(["research", "support"]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "vercel.authentication", status: "unknown" }),
      ]),
    );
  });

  it("limits a workspace-member invocation to that member", async () => {
    const root = await createScratchDirectory("eve-doctor-member-");
    await createWorkspace(root);

    const result = await runDoctor(join(root, "agents", "support"), { offline: true });

    expect(result.scope).toBe("workspace");
    expect(result.agents.map((agent) => agent.name)).toEqual(["support"]);
  });
});
