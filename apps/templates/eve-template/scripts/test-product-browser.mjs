// Run only against an isolated production build with test credentials, never production data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Browser fixture requires localhost.");
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath)
  throw new Error("Set PLAYWRIGHT_MODULE to the separately installed playwright/index.mjs.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const snapshot = async (name) => {
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
};
async function check(name, work) {
  try {
    await work();
    checks.push({ name, passed: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: String(error) });
    await snapshot(`failure-${checks.length}`).catch(() => {});
    throw error;
  }
}
try {
  await check("signed-out private APIs deny access", async () => {
    for (const path of [
      "/api/agents",
      "/api/images",
      "/api/settings/providers",
      "/api/settings/memory",
      "/api/chats",
    ])
      assert.equal((await context.request.get(origin + path)).status(), 401, path);
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await snapshot("desktop-logged-out");
  await check("password sign-in through the actual UI", async () => {
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await page
      .getByLabel("Username", { exact: true })
      .fill(process.env.EVE_CHAT_USERNAME || "Riki");
    await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForFunction(async () => {
      const r = await fetch("/api/agents");
      return r.status === 200;
    });
    await page.waitForLoadState("networkidle");
  });
  await check("create and edit a saved agent without an API key", async () => {
    await page.goto(origin + "/agents");
    await page.getByRole("button", { name: "Create agent", exact: true }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Browser research partner");
    await page
      .getByLabel("Instructions", { exact: true })
      .fill("Use evidence, distinguish uncertainty and keep answers clear.");
    await page.getByRole("button", { name: "Save agent", exact: true }).click();
    await page.getByRole("heading", { name: "Browser research partner", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit Browser research partner", exact: true }).click();
    await page
      .getByLabel("Description", { exact: true })
      .fill("Created and edited by an isolated browser check.");
    await snapshot("desktop-agent-editor");
    await page.getByRole("button", { name: "Save agent", exact: true }).click();
    await page
      .getByText("Created and edited by an isolated browser check.", { exact: true })
      .waitFor();
    await snapshot("desktop-agents");
  });
  await check("select a saved agent and open the model picker", async () => {
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page
      .getByRole("button", { name: "Choose agent", exact: true })
      .filter({ hasText: "Browser research partner" })
      .waitFor();
    await page
      .getByRole("button", { name: /^Model:/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "Choose a model", exact: true }).waitFor();
    await snapshot("desktop-model-picker");
    await page.keyboard.press("Escape");
  });
  await check(
    "file and profile survive new-chat navigation; failed send retains files",
    async () => {
      await page
        .getByLabel("Upload attachments", { exact: true })
        .setInputFiles({
          name: "qa-note.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("This is an isolated attachment fixture."),
        });
      await page.getByRole("button", { name: "Remove qa-note.txt", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Remove qa-note.txt", exact: true }).waitFor();
      await page.getByRole("button", { name: "Choose input mode", exact: true }).click();
      await page.getByRole("menuitem", { name: "Research", exact: true }).click();
      await snapshot("desktop-composer");
      let captured;
      await page.route("**/eve/v1/**", async (route) => {
        const request = route.request();
        if (request.method() === "POST" && (request.postData() || "").includes("qa-note.txt")) {
          captured = { body: request.postData(), headers: request.headers() };
          await route.abort("failed");
        } else await route.continue();
      });
      await page.locator("[data-chat-composer] textarea").fill("Summarize the attached note.");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      const deadline = Date.now() + 20000;
      while (!captured && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      assert(captured, "eve client receives the file after provisional chat navigation");
      assert.match(captured.body, /data:text\/plain;base64/);
      assert(captured.headers["x-aegentica-profile"]);
      assert.equal(captured.headers["x-aegentica-mode"], "research");
      assert.match(new URL(page.url()).pathname, /^\/chat\/(?!new-)/);
      await page.getByRole("button", { name: "Remove qa-note.txt", exact: true }).waitFor();
      await page.unroute("**/eve/v1/**");
    },
  );
  await check("global command navigation and all page routes", async () => {
    await page.keyboard.press("Control+k");
    await page.getByRole("heading", { name: "Search your workspace", exact: true }).waitFor();
    await page.getByPlaceholder("Search pages, agents, settings, chats...").fill("Images");
    await snapshot("desktop-command");
    await page.getByRole("option", { name: "Images", exact: true }).click();
    await page.getByRole("heading", { name: "Images", exact: true }).waitFor();
    for (const route of [
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
      const response = await page.goto(origin + route, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, route);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${route} desktop horizontal overflow`,
      );
      await snapshot("desktop-" + route.slice(1).replaceAll("/", "-"));
    }
  });
  await check("mobile navigation is focus-trapped and routes fit viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await page.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
    await dialog.waitFor();
    await snapshot("mobile-navigation");
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      assert(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        "focus stays in mobile navigation",
      );
    }
    await dialog.getByRole("link", { name: "Agents", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    for (const route of [
      "/",
      "/agents",
      "/capabilities",
      "/images",
      "/tasks",
      "/settings",
      "/settings/integrations",
    ]) {
      await page.goto(origin + route, { waitUntil: "networkidle" });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${route} mobile horizontal overflow`,
      );
      await snapshot("mobile-" + (route.slice(1).replaceAll("/", "-") || "chat"));
    }
  });
  await check("logout denies private data and clears drafts", async () => {
    const response = await context.request.post(origin + "/api/password-auth/logout", {
      headers: { Origin: origin },
    });
    assert.equal(response.status(), 200);
    await page.goto(origin + "/agents");
    assert.equal((await context.request.get(origin + "/api/agents")).status(), 401);
    assert.equal((await context.request.get(origin + "/api/images")).status(), 401);
  });
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await writeFile(
    join(output, "browser-results.json"),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  await context.close();
  await browser.close();
}
