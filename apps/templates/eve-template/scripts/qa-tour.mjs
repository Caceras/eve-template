// Visual audit: screenshots every product route on a phone and a desktop, in
// light and dark, and fails on uncaught errors, console errors or horizontal
// overflow. Run against a local server started with test credentials.
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";

const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("The tour signs in with test credentials, so it runs against localhost only.");
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa", "tour");
await mkdir(output, { recursive: true });
const routes = (
  process.env.TOUR_ROUTES ||
  "/,/agents,/tasks,/images,/memory,/capabilities,/settings,/settings/voice,/settings/notifications,/settings/integrations,/settings/security,/session,/library,/native"
).split(",");
const devices = {
  phone: {
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: { width: 1440, height: 900 } },
};
const problems = [];
const browser = await launchBrowser();
for (const [device, options] of Object.entries(devices)) {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({ ...options, colorScheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`${device} ${page.url()} ${error.message}`));
    // Next.js answers some head-only link prefetches with 404; the click still navigates.
    const failedPrefetches = new Set();
    const consoleErrors = [];
    page.on("response", (response) => {
      if (response.status() === 404 && response.request().headers()["next-router-prefetch"])
        failedPrefetches.add(response.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error")
        consoleErrors.push([message.location().url, `${device} ${page.url()} ${message.text()}`]);
    });
    await page.goto(origin);
    const status = await page.evaluate(
      async (credentials) =>
        (
          await fetch("/api/password-auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(credentials),
          })
        ).status,
      { username: process.env.EVE_CHAT_USERNAME, password: process.env.EVE_CHAT_PASSWORD },
    );
    if (status !== 200)
      throw new Error(
        `Sign-in failed with ${status}; set EVE_CHAT_USERNAME and EVE_CHAT_PASSWORD.`,
      );
    for (const route of routes) {
      await page.goto(origin + route, { waitUntil: "networkidle" });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
        problems.push(`${device} ${route} overflows horizontally`);
      if (await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight + 1))
        problems.push(`${device} ${route} page scrolls vertically`);
      const name = `${device}-${colorScheme}${route === "/" ? "_home" : route.replaceAll("/", "_")}.png`;
      await page.screenshot({ path: join(output, name) });
    }
    // Routes alone never show a conversation, so run one mock turn (needs AEGENTICA_TEST_MODEL=mock).
    await page.goto(origin, { waitUntil: "networkidle" });
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    await composer.fill("Plan a short weekend in Stockholm.");
    await composer.press("Enter");
    await page.getByText("Mock reply:").first().waitFor({ timeout: 30_000 });
    // Replies reveal gradually; shoot the finished reply, not a half-typed one.
    await page.getByRole("button", { name: "Copy reply", exact: true }).waitFor();
    await page.waitForFunction(() => document.body.innerText.includes("const ready = true"));
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: join(output, `${device}-${colorScheme}_conversation.png`) });
    if (device === "phone") {
      await page.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: join(output, `${device}-${colorScheme}_drawer.png`) });
    }
    for (const [url, problem] of consoleErrors)
      if (!failedPrefetches.has(url)) problems.push(problem);
    await context.close();
  }
}
await browser.close();
console.log(`${routes.length * 4 + 6} screenshots in ${output}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
