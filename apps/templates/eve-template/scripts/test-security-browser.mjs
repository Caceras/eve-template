import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local fixture only.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Username", { exact: true }).fill(process.env.EVE_CHAT_USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(async () => (await fetch("/api/settings/security")).status === 200);
  await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });
  const cookie = (await context.cookies()).find((item) => item.name === "eve_chat_session");
  assert(cookie);
  const before = await (await context.request.get(origin + "/api/agents")).json();
  await page.goto(origin + "/settings/security", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Current password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
  const password = "Browser-fixture-" + randomUUID();
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Password changed." }).waitFor();
  assert.equal((await context.request.get(origin + "/api/agents")).status(), 200);
  assert.deepEqual(await (await context.request.get(origin + "/api/agents")).json(), before);
  assert.equal((await context.request.get(origin + "/api/agents", {
    headers: { Cookie: `eve_chat_session=${cookie.value}` },
  })).status(), 401);
  await page.screenshot({ path: join(output, "desktop-security.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: join(output, "mobile-security.png"), fullPage: true });
  assert.equal(errors.length, 0);
  await writeFile(join(output, "security-browser-results.json"), JSON.stringify({ passed: true, checks: ["UI password rotation", "old cookie revoked", "profiles preserved", "mobile viewport fits"], pageErrors: errors }));
  console.log("PASS: password rotation through UI, revoked cookie, preserved profiles and mobile layout");
} catch (error) {
  await page.screenshot({ path: join(output, "security-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
