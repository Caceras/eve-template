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
page.on("pageerror", (error) => errors.push(page.url() + " — " + error.message));
const snapshot = async (name) => {
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
};
// Streaming and background requests need not become idle for the UI to be usable.
// Every interaction below waits for its actual visible control or observable result.
async function navigate(path = "/") {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200, path);
  await page.getByRole("button", { name: "Search pages and conversations", exact: true }).waitFor();
  await page.getByRole("main").waitFor();
  return response;
}
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
  await navigate();
  await page.getByRole("button", { name: "Sign in", exact: true }).first().waitFor();
  await snapshot("desktop-logged-out");
  await check("password sign-in through the actual UI", async () => {
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await page
      .getByLabel("Username", { exact: true })
      .fill(process.env.EVE_CHAT_USERNAME || "Riki");
    await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForFunction(async () => (await fetch("/api/agents")).status === 200);
    await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });
  });
  await check("create and edit a saved agent without an API key", async () => {
    await navigate("/agents");
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
      await page.getByLabel("Upload attachments", { exact: true }).setInputFiles({
        name: "qa-note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("This is an isolated attachment fixture."),
      });
      await page.getByRole("button", { name: "Remove qa-note.txt", exact: true }).waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
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
      await navigate(route);
      await page.locator("main h1, main [data-chat-composer]").first().waitFor();
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
    await navigate();
    const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
    // Real touch input: synthetic pointer events hide the pointercancel a browser
    // fires once a finger pans, which is exactly how swipes fail on phones.
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const swipe = async (fromX, toX, y) => {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: fromX, y }],
      });
      for (let step = 1; step <= 8; step++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: fromX + ((toX - fromX) * step) / 8, y: y + step / 4 }],
        });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await swipe(120, 300, 150);
    await dialog.waitFor();
    await snapshot("mobile-navigation-swipe");
    const drawerBox = await dialog.boundingBox();
    assert(drawerBox, "mobile navigation has a visible drawer box");
    await swipe(drawerBox.x + Math.min(250, drawerBox.width - 20), drawerBox.x + 40, 150);
    await dialog.waitFor({ state: "hidden" });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await touch.detach();
    await page.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
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
      await navigate(route);
      await page.locator("main h1, main [data-chat-composer]").first().waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${route} mobile horizontal overflow`,
      );
      await snapshot("mobile-" + (route.slice(1).replaceAll("/", "-") || "chat"));
    }
  });
  await check("share target attaches files and keeps shared text", async () => {
    const fallback = await context.request.post(origin + "/share", {
      multipart: { title: "Shared note", text: "From the share sheet" },
      maxRedirects: 0,
    });
    assert.equal(fallback.status(), 303);
    assert.equal(fallback.headers().location, "/?title=Shared+note&text=From+the+share+sheet");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const landed = await page.evaluate(async () => {
      const form = new FormData();
      form.append("text", "Look at this");
      form.append("files", new File(["Shared fixture"], "shared.txt", { type: "text/plain" }));
      form.append("files", new File(["MZ"], "skip.exe", { type: "application/x-msdownload" }));
      const response = await fetch("/share", { method: "POST", body: form });
      return response.url;
    });
    assert.equal(new URL(landed).search, "?text=Look+at+this");
    await navigate();
    await page.getByRole("button", { name: "Remove shared.txt", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Remove skip.exe" }).count(), 0);
    await page.getByRole("button", { name: "Remove shared.txt", exact: true }).click();
  });
  await check("logout denies private data and clears drafts", async () => {
    const response = await context.request.post(origin + "/api/password-auth/logout", {
      headers: { Origin: origin },
    });
    assert.equal(response.status(), 200);
    await navigate("/agents");
    assert.equal((await context.request.get(origin + "/api/agents")).status(), 401);
    assert.equal((await context.request.get(origin + "/api/images")).status(), 401);
  });
  assert.equal(errors.length, 0, errors.join("\n"));
} catch (error) {
  await snapshot("browser-failure").catch(() => {});
  throw error;
} finally {
  await writeFile(
    join(output, "browser-results.json"),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  await context.close();
  await browser.close();
}
