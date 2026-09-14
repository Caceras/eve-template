import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { useTemporaryDirectories } from "#internal/testing/use-temporary-app-roots.js";
import {
  WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES,
  WEB_APP_TEMPLATE_FILES,
} from "#setup/scaffold/create/web-template.js";
import { WizardCancelledError } from "#setup/step.js";

import { migrateStandaloneProject } from "./init-standalone-migration.js";

const createDirectory = useTemporaryDirectories();
const standaloneContext = vi.fn(async (root: string) => ({
  appRoot: root,
  environmentRoot: root,
  kind: "standalone" as const,
}));

async function createStandalone(directory: string, nextConfig?: string): Promise<string> {
  const root = join(directory, "weather");
  await mkdir(join(root, "agent"), { recursive: true });
  await mkdir(join(root, "evals"), { recursive: true });
  await writeFile(join(root, "agent", "agent.ts"), "export default {};\n");
  await writeFile(join(root, "evals", "smoke.ts"), "export default {};\n");
  await writeFile(
    join(root, "package.json"),
    '{"name":"weather","imports":{"#*":"./agent/*","#evals/*":"./evals/*"}}\n',
  );
  await writeFile(join(root, "tsconfig.json"), '{"include":["agent/**/*.ts","evals/**/*.ts"]}\n');
  if (nextConfig !== undefined) await writeFile(join(root, "next.config.ts"), nextConfig);
  return root;
}

function dependencies(choice: "convert" | "cancel" = "convert") {
  return {
    createPrompter: () => ({ select: vi.fn(async () => choice) }) as any,
    findEveProjectContext: standaloneContext,
    hasInteractiveTerminal: () => true,
  };
}

function logger() {
  return { error: vi.fn(), log: vi.fn() };
}

describe("migrateStandaloneProject", () => {
  it("moves the root agent and evals and adds the requested agent", async () => {
    const root = await createStandalone(await createDirectory("migration"));

    await expect(
      migrateStandaloneProject({
        dependencies: dependencies(),
        logger: logger(),
        options: { yes: true },
        root,
        target: "research",
      }),
    ).resolves.toBe(true);

    await expect(
      readFile(join(root, "agents", "weather", "agent", "agent.ts"), "utf8"),
    ).resolves.toBe("export default {};\n");
    await expect(
      readFile(join(root, "agents", "weather", "evals", "smoke.ts"), "utf8"),
    ).resolves.toBe("export default {};\n");
    await expect(
      readFile(join(root, "agents", "research", "agent", "agent.ts"), "utf8"),
    ).resolves.toContain("defineAgent");
    await expect(readFile(join(root, "tsconfig.json"), "utf8")).resolves.toContain(
      '"agents/**/*.ts"',
    );
    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain(
      '"#*": "./agents/weather/agent/*"',
    );
  });

  it.each([
    ["standard", WEB_APP_TEMPLATE_FILES["app/page.tsx"]],
    ["Vercel sign-in", WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES["app/page.tsx"]],
  ])(
    "preserves %s generated Web Chat and points it at the moved root agent",
    async (_name, page) => {
      const config =
        'import type { NextConfig } from "next";\nimport { withEve } from "eve/next";\n\nconst nextConfig: NextConfig = {};\n\nexport default withEve(nextConfig);\n';
      const root = await createStandalone(await createDirectory("migration"), config);
      await mkdir(join(root, "app"));
      await writeFile(join(root, "app", "page.tsx"), page);

      await migrateStandaloneProject({
        dependencies: dependencies(),
        logger: logger(),
        options: { yes: true },
        root,
        target: "research",
      });

      await expect(readFile(join(root, "app", "page.tsx"), "utf8")).resolves.toBe(page);
      await expect(readFile(join(root, "next.config.ts"), "utf8")).resolves.toBe(
        config.replace(
          "withEve(nextConfig)",
          'withEve(nextConfig, { eveRoot: "./agents/weather" })',
        ),
      );
    },
  );

  it("cancels without writing", async () => {
    const root = await createStandalone(await createDirectory("migration"));

    await expect(
      migrateStandaloneProject({
        dependencies: dependencies("cancel"),
        logger: logger(),
        options: {},
        root,
        target: "research",
      }),
    ).rejects.toBeInstanceOf(WizardCancelledError);

    await expect(readFile(join(root, "agent", "agent.ts"), "utf8")).resolves.toBe(
      "export default {};\n",
    );
    await expect(readFile(join(root, "evals", "smoke.ts"), "utf8")).resolves.toBe(
      "export default {};\n",
    );
  });

  it.each([
    ["custom Next.js app", "export default withEve({});\n", "custom Next.js app"],
    ["vercel service graph", undefined, "Vercel service graph"],
  ])("refuses a %s before writing", async (_name, config, expected) => {
    const root = await createStandalone(await createDirectory("migration"), config);
    if (config === undefined) await writeFile(join(root, "vercel.ts"), "export default {};\n");

    await expect(
      migrateStandaloneProject({
        dependencies: dependencies(),
        logger: logger(),
        options: { yes: true },
        root,
        target: "research",
      }),
    ).rejects.toThrow(expected);

    await expect(readFile(join(root, "agent", "agent.ts"), "utf8")).resolves.toBe(
      "export default {};\n",
    );
    await expect(readFile(join(root, "evals", "smoke.ts"), "utf8")).resolves.toBe(
      "export default {};\n",
    );
  });
});
