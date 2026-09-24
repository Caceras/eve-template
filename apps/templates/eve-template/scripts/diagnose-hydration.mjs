import { launchBrowser } from "./browser.mjs";
import { writeFile } from "node:fs/promises";
const browser = await launchBrowser();
const page = await browser.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(60000);
const messages = [];
const report = (message) => {
  messages.push(message);
  console.log(message);
};
page.on("console", (message) => {
  if (message.type() === "error") report(page.url() + " " + message.text());
});
page.on("pageerror", (error) => report(page.url() + " " + (error.stack || error.message)));
try {
  let ready = false;
  for (let n = 0; n < 45; n++) {
    try {
      await fetch("http://localhost:3001/icon.svg", { signal: AbortSignal.timeout(2000) });
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error("Diagnostic server did not start.");
  console.log("DIAGNOSTIC_SIGN_IN");
  await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded" });
  // A click that lands before hydration is dropped; retry until the dialog opens.
  const username = page.getByLabel("Username", { exact: true });
  for (let attempt = 0; !(await username.isVisible()); attempt++) {
    if (attempt >= 10) throw new Error("The sign-in dialog did not open.");
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await username.waitFor({ timeout: 3000 }).catch(() => {});
  }
  await page.getByLabel("Username", { exact: true }).fill(process.env.EVE_CHAT_USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(async () => (await fetch("/api/agents")).status === 200);
  await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });
  for (const path of [
    "/",
    "/agents",
    "/capabilities",
    "/images",
    "/tasks",
    "/memory",
    "/settings",
    "/settings/voice",
    "/settings/notifications",
    "/settings/integrations",
    "/library",
    "/session",
    "/native",
  ]) {
    console.log("DIAGNOSTIC_ROUTE", path);
    await page.goto("http://localhost:3001" + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  }
} catch (error) {
  report(String(error));
} finally {
  await writeFile(
    process.env.QA_ARTIFACTS + "/hydration-diagnostics.json",
    JSON.stringify(messages, null, 2),
  );
  await browser.close();
}
