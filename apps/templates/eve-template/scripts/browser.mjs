// Playwright stays outside the product lockfile: check-product.sh installs it
// separately. PLAYWRIGHT_CHROMIUM_EXECUTABLE reuses a preinstalled Chromium,
// as in cloud agent sessions where downloading browsers is unavailable.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath =
  process.env.PLAYWRIGHT_MODULE || "/tmp/aegentica-browser/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);

export function launchBrowser(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  return chromium.launch({ ...options, executablePath });
}
