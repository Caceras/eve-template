import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES,
  WEB_APP_TEMPLATE_FILES,
} from "#setup/scaffold/create/web-template.js";

const GENERATED_NEXT_CONFIG =
  'import type { NextConfig } from "next";\nimport { withEve } from "eve/next";\n\nconst nextConfig: NextConfig = {};\n\nexport default withEve(nextConfig);\n';

export interface WebChatMigration {
  apply(): Promise<void>;
}

/** Returns a rewrite only for unmodified Web Chat templates eve can preserve exactly. */
export async function prepareWebChatMigration(
  root: string,
  oldName: string,
): Promise<WebChatMigration | undefined> {
  const configPath = join(root, "next.config.ts");
  const pagePath = join(root, "app", "page.tsx");
  let config: string;
  let page: string;
  try {
    [config, page] = await Promise.all([readFile(configPath, "utf8"), readFile(pagePath, "utf8")]);
  } catch {
    return undefined;
  }
  if (
    config !== GENERATED_NEXT_CONFIG ||
    (page !== WEB_APP_TEMPLATE_FILES["app/page.tsx"] &&
      page !== WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES["app/page.tsx"])
  ) {
    return undefined;
  }

  const updated = GENERATED_NEXT_CONFIG.replace(
    "withEve(nextConfig)",
    `withEve(nextConfig, { eveRoot: "./agents/${oldName}" })`,
  );
  return { apply: async () => await writeFile(configPath, updated, "utf8") };
}
