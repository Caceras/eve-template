// Run only against an isolated production build with test credentials, never production data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { launchBrowser } from "./browser.mjs";
const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Browser fixture requires localhost.");
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa");
await mkdir(output, { recursive: true });
const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  // The operator's zone and locale, unlike the server's UTC: a time rendered
  // during server rendering then fails hydration and lands in page errors.
  timezoneId: "Europe/Stockholm",
  locale: "en-GB",
});
const errors = [];
const checks = [];
function openPage() {
  return context.newPage().then((opened) => {
    opened.setDefaultTimeout(15000);
    opened.on("pageerror", (error) => errors.push(opened.url() + " — " + error.message));
    return opened;
  });
}
let page = await openPage();
/**
 * Runs a check on a page of its own. Chromium keeps a page's pointer type
 * changed after touch emulation is switched off (neither fine nor coarse), which
 * would hide every mouse-only control in the checks that follow.
 */
async function onOwnPage(work) {
  const main = page;
  page = await openPage();
  try {
    await work();
  } finally {
    await page.close();
    page = main;
  }
}
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
  await check("in password mode the sign-in error page speaks of the password", async () => {
    const response = await page.goto(origin + "/auth/error?error=invalid_scope", {
      waitUntil: "domcontentloaded",
    });
    assert.equal(response.status(), 200);
    await page.getByText(/operator username and password/).waitFor();
    assert.equal(await page.getByText(/Vercel|Better Auth|OAuth/).count(), 0);
  });
  await check(
    "signed out, a page with its own Sign in has one obvious sign-in action",
    async () => {
      await navigate("/settings");
      await page.getByText("Sign in to manage Ægentica.", { exact: true }).waitFor();
      // The page's button stays; the top bar (also in main) drops its own once hydrated.
      const inMain = page.locator("main").getByRole("button", { name: "Sign in", exact: true });
      for (let attempt = 0; (await inMain.count()) !== 1; attempt++) {
        assert(attempt < 40, "the top bar hides its Sign in beside the page's own");
        await page.waitForTimeout(250);
      }
    },
  );
  await check("search engines are asked not to index the private app", async () => {
    const home = await context.request.get(origin + "/");
    assert.match(await home.text(), /<meta name="robots" content="noindex, nofollow"/);
    // A robots.txt Disallow would hide that from crawlers (and break link previews).
    const robots = await context.request.get(origin + "/robots.txt");
    if (robots.ok()) assert.doesNotMatch(await robots.text(), /^Disallow:\s*\/\s*$/im);
  });
  await navigate();
  await page.getByRole("button", { name: "Sign in", exact: true }).first().waitFor();
  await snapshot("desktop-logged-out");
  await check("password sign-in through the actual UI", async () => {
    // A click that lands before hydration is dropped; retry until the dialog opens.
    const username = page.getByLabel("Username", { exact: true });
    for (let attempt = 0; !(await username.isVisible()); attempt++) {
      assert(attempt < 10, "sign-in dialog opens");
      await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
      await username.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await page
      .getByLabel("Username", { exact: true })
      .fill(process.env.EVE_CHAT_USERNAME || "Riki");
    // A refused sign-in (answered here, so the login limit is untouched) says
    // why beside the fields and hands focus back to the password.
    await page.route("**/api/password-auth/login", (route) =>
      route.fulfill({ status: 401, json: { error: "Wrong username or password." } }),
    );
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("not-the-password");
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    const refused = page.getByRole("alert").filter({ hasText: "Wrong username or password." });
    await refused.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "eve-chat-password");
    assert.equal(await password.getAttribute("aria-invalid"), "true");
    assert.equal(await password.getAttribute("aria-describedby"), await refused.getAttribute("id"));
    await page.unroute("**/api/password-auth/login");
    await password.fill(process.env.EVE_CHAT_PASSWORD);
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForFunction(async () => (await fetch("/api/agents")).status === 200);
    await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });
  });
  await check("keyboard: skip link, a collapsed sidebar leaves the tab order", async () => {
    // A page without an autofocused field, so the first Tab starts at the top.
    await navigate("/agents");
    const sidebar = page.locator("[data-desktop-sidebar]");
    const sidebarWidth = () => sidebar.evaluate((element) => element.offsetWidth);
    // The first Tab offers a way past the sidebar, straight to the page. Until
    // then it stays fully off screen, also below a tall status bar (an installed
    // app drawn edge to edge, simulated here as an 80 px safe-area inset).
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await skip.evaluate((link) => link.style.setProperty("--skip-top", "80px"));
    const skipBox = () => skip.evaluate((link) => link.getBoundingClientRect().toJSON());
    assert((await skipBox()).bottom <= 0, "the hidden skip link leaves no edge on screen");
    await page.keyboard.press("Tab");
    assert(await skip.evaluate((link) => link === document.activeElement), "skip link comes first");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("a")]
          .find((link) => link.textContent.trim() === "Skip to content")
          ?.getBoundingClientRect().top === 80,
    );
    await skip.evaluate((link) => link.style.removeProperty("--skip-top"));
    assert((await skip.boundingBox()).y >= 0, "the focused skip link is on screen");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "content");
    // Closing the sidebar hands focus to the button that reopens it.
    const close = sidebar.getByRole("button", { name: "Close sidebar", exact: true });
    for (let attempt = 0; (await sidebarWidth()) > 0; attempt++) {
      assert(attempt < 10, "the sidebar closes");
      await close.click();
      await page.waitForTimeout(400);
    }
    assert.equal(await sidebar.getAttribute("inert"), "");
    assert.equal(await sidebar.getAttribute("aria-hidden"), "true");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Open sidebar" &&
        !document.activeElement.closest("[data-desktop-sidebar]"),
    );
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("[data-desktop-sidebar]")),
        ),
        false,
        "Tab never lands in the collapsed sidebar",
      );
    }
    // Reopened from the keyboard, focus lands on the sidebar's own toggle.
    await page.getByRole("button", { name: "Open sidebar", exact: true }).last().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.activeElement?.matches("[data-desktop-sidebar] [data-sidebar-toggle]"),
    );
    assert.equal(await sidebar.getAttribute("inert"), null);
    await page.waitForFunction(
      () => document.querySelector("[data-desktop-sidebar]").offsetWidth > 200,
    );
  });
  await check("contrast: sidebar labels and hints read at 4.5:1, focus rings at 3:1", async () => {
    await navigate("/agents");
    const contrast = await page.evaluate(() => {
      // The browser resolves any CSS colour (oklch included) to pixels on a canvas.
      const pixel = (color) => {
        const context = document.createElement("canvas").getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (color) =>
        pixel(color)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (a, b) => {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (light + 0.05) / (dark + 0.05);
      };
      const background = getComputedStyle(document.body).backgroundColor;
      const sidebar = document.querySelector("[data-desktop-sidebar]");
      const label = [...sidebar.querySelectorAll("p")].find(
        (element) => element.textContent.trim() === "Workspace",
      );
      const hint = [...sidebar.querySelectorAll("span.rounded")].find((element) =>
        element.textContent.trim().endsWith("K"),
      );
      return {
        label: ratio(getComputedStyle(label).color, background),
        hint: ratio(getComputedStyle(hint).color, background),
        hintOpacity: getComputedStyle(hint).opacity,
        ring: ratio(
          getComputedStyle(document.documentElement).getPropertyValue("--ring").trim(),
          background,
        ),
      };
    });
    assert(contrast.label >= 4.5, `section label contrast ${contrast.label.toFixed(2)}`);
    assert(contrast.hint >= 4.5, `shortcut hint contrast ${contrast.hint.toFixed(2)}`);
    assert.equal(contrast.hintOpacity, "1");
    assert(contrast.ring >= 3, `focus ring contrast ${contrast.ring.toFixed(2)}`);
  });
  await check("large JSON answers arrive gzipped and decode", async () => {
    const catalog = await context.request.get(origin + "/api/models", {
      headers: { "Accept-Encoding": "gzip" },
    });
    assert.equal(catalog.status(), 200);
    assert.equal(catalog.headers()["content-encoding"], "gzip");
    assert.match(catalog.headers()["cache-control"], /no-store/);
    assert((await catalog.json()).models.length > 0);
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
    // The chosen agent shows as a chip above the message box, with its own remove button.
    await page
      .getByRole("button", { name: "Remove agent Browser research partner", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: /^Model:/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "Choose a model", exact: true }).waitFor();
    // Models carry their maker's real logo, served as a static file.
    await page.getByRole("dialog").locator('[data-brand="openai"]').first().waitFor();
    const logo = await context.request.get(origin + "/brands/openai.svg");
    assert.equal(logo.status(), 200);
    assert.match(logo.headers()["content-type"], /image\/svg\+xml/);
    await snapshot("desktop-model-picker");
    // Opening renders makers collapsed, not the whole catalog; a maker opens on
    // click or Enter, and search still reaches every model.
    const picker = page.getByRole("dialog");
    const rows = picker.locator("[cmdk-item]");
    const collapsed = await rows.count();
    assert(collapsed > 0 && collapsed < 80, `the picker opens with ${collapsed} rows`);
    const openai = picker.getByRole("option", { name: /^OpenAI \d+ models/ });
    await openai.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("[role=dialog] [cmdk-item]").length > count,
      collapsed,
    );
    await openai.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("[role=dialog] [cmdk-item]").length === count,
      collapsed,
    );
    await picker.getByRole("combobox", { name: "Search models", exact: true }).fill("claude");
    await picker
      .getByRole("option")
      .filter({ hasText: /claude/i })
      .first()
      .waitFor();
    assert((await rows.count()) <= 41, "search shows the best matches, not every model");
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await picker.locator('[cmdk-item][data-selected="true"]').count(),
      1,
      "the keyboard moves through the results",
    );
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
      // Typing / lists whatever skills the compiled runtime reports; Enter picks
      // the highlighted one and removes the typed trigger.
      const box = page.locator("[data-chat-composer] textarea");
      await box.click();
      await box.pressSequentially("/deep");
      const skills = page.getByRole("listbox", { name: "Skills", exact: true });
      await skills.getByRole("option", { name: /^Deep research/ }).waitFor();
      await snapshot("desktop-composer-skills");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Remove skill Deep research", exact: true }).waitFor();
      assert.equal(await box.inputValue(), "", "the typed /deep is removed once picked");
      // @ lists the saved agents the same way, and Escape closes the list.
      await box.pressSequentially("@");
      const agents = page.getByRole("listbox", { name: "Agents", exact: true });
      await agents.getByRole("option", { name: /^Browser research partner/ }).waitFor();
      await page.keyboard.press("Escape");
      await agents.waitFor({ state: "hidden" });
      await box.fill("");
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
      assert.equal(captured.headers["x-aegentica-skill"], "deep-research");
      assert.match(new URL(page.url()).pathname, /^\/chat\/(?!new-)/);
      await page.getByRole("button", { name: "Remove qa-note.txt", exact: true }).waitFor();
      await page.unroute("**/eve/v1/**");
    },
  );
  await check("global command navigation and all page routes", async () => {
    // Recent conversations arrive in one request, not page after page.
    const chatLists = [];
    const countChatList = (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/chats" && url.search) chatLists.push(url.search);
    };
    page.on("request", countChatList);
    const listed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/chats" && response.url().includes("?"),
    );
    await page.keyboard.press("Control+k");
    await page.getByRole("heading", { name: "Search your workspace", exact: true }).waitFor();
    await listed;
    page.off("request", countChatList);
    assert.deepEqual(chatLists, ["?limit=100"]);
    // Group headings divide the list; a separator inside a listbox breaks it for screen readers.
    assert.equal(await page.locator("[role=listbox] [role=separator]").count(), 0);
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
      // Controls that repeat on a page say what they act on.
      if (route === "/library")
        assert.equal(
          await page.locator('a[href^="https://eve.dev/docs/"]:not(:has(.sr-only))').count(),
          0,
          "each documentation link names its guide",
        );
      if (
        route === "/settings/voice" &&
        !(await page.getByText("This browser cannot speak replies aloud.").count())
      )
        await page.getByRole("switch", { name: "Read replies aloud", exact: true }).waitFor();
      await snapshot("desktop-" + route.slice(1).replaceAll("/", "-"));
    }
  });
  await check("mobile navigation is focus-trapped and routes fit viewport", () =>
    onOwnPage(async () => {
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
      // Mid-swipe the drawer sits under the finger, not at either end.
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 60, y: 150 }],
      });
      for (let step = 1; step <= 6; step++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 60 + step * 25, y: 150 }],
        });
      await page.waitForTimeout(100);
      const midway = await page.evaluate(() => {
        const panel = document.querySelector("[data-mobile-drawer]");
        const left = panel.getBoundingClientRect().left;
        return left > -panel.offsetWidth + 40 && left < -40;
      });
      assert(midway, "the drawer follows the finger during a swipe");
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await dialog.waitFor();
      await swipe(120, 300, 150);
      await dialog.waitFor();
      await snapshot("mobile-navigation-swipe");
      assert(
        await dialog.evaluate((drawer) => {
          const list = drawer.querySelector("aside > div");
          return (
            list.clientHeight < drawer.clientHeight && getComputedStyle(list).overflowY === "auto"
          );
        }),
        "the drawer's list is its own scroll area",
      );
      const drawerBox = await dialog.boundingBox();
      assert(drawerBox, "mobile navigation has a visible drawer box");
      await swipe(drawerBox.x + Math.min(250, drawerBox.width - 20), drawerBox.x + 40, 150);
      await dialog.waitFor({ state: "hidden" });
      // A swipe outside the drawer closes it too; so does a tap.
      await swipe(120, 300, 150);
      await dialog.waitFor();
      await swipe(385, 180, 150);
      await dialog.waitFor({ state: "hidden" });
      await swipe(120, 300, 150);
      await dialog.waitFor();
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 380, y: 500 }],
      });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await dialog.waitFor({ state: "hidden" });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await touch.detach();
      // Android's back gesture closes the drawer instead of leaving the page.
      const before = page.url();
      await page.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
      await dialog.waitFor();
      await page.waitForFunction(() => Boolean(history.state?.aegenticaLayer));
      await page.goBack();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(page.url(), before, "back closes the drawer and stays on the page");
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
        // The shell owns the screen; the page itself must never scroll.
        assert.equal(
          await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight + 1),
          false,
          `${route} mobile page scrolls vertically`,
        );
        await snapshot("mobile-" + (route.slice(1).replaceAll("/", "-") || "chat"));
      }
    }),
  );
  await check("phone overlays never raise the keyboard and back closes them", async () => {
    const phone = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const tab = await phone.newPage();
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
    const search = tab.getByRole("heading", { name: "Search your workspace", exact: true });
    // A tap that lands before hydration is dropped; retry until search opens.
    for (let attempt = 0; !(await search.isVisible()); attempt++) {
      assert(attempt < 10, "search opens");
      await tab
        .getByRole("button", { name: "Search pages and conversations", exact: true })
        .click();
      await search.waitFor({ timeout: 2000 }).catch(() => {});
    }
    assert.notEqual(
      await tab.evaluate(() => document.activeElement?.tagName),
      "INPUT",
      "search opens without focusing its field",
    );
    await tab.waitForFunction(() => Boolean(history.state?.aegenticaLayer));
    await tab.goBack();
    await search.waitFor({ state: "hidden" });
    assert.equal(new URL(tab.url()).pathname, "/", "back closes search and stays on the page");
    assert.equal(
      await tab.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
      "none",
      "no pull-to-refresh",
    );
    await phone.close();
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
  await check("a long share arrives whole instead of failing with HTTP 431", async () => {
    // About 33 KB once percent-encoded: far past the server's header limit as an address.
    const long = `Delad text </script><b>kvar</b> ${"åäö 日本語 ".repeat(700)}slut`;
    const fallback = await context.request.post(origin + "/share", {
      multipart: { text: long },
      maxRedirects: 0,
    });
    assert.equal(fallback.status(), 200, "the fallback hands a long text over in the page");
    const handover = await fallback.text();
    assert(!handover.includes("</script><b>"), "shared text cannot close the script");
    // Through the service worker, as Android's share sheet sends it: a form navigation.
    await page.evaluate((text) => {
      const form = Object.assign(document.createElement("form"), {
        method: "POST",
        action: "/share",
        enctype: "multipart/form-data",
      });
      form.append(Object.assign(document.createElement("textarea"), { name: "text", value: text }));
      document.body.append(form);
      form.submit();
    }, long);
    // The share page hands over and replaces itself with the home page.
    const composer = page.locator("[data-chat-composer-input]");
    const deadline = Date.now() + 20000;
    while ((await composer.inputValue({ timeout: 2000 }).catch(() => "")) !== long) {
      assert(Date.now() < deadline, "the whole shared text lands in the message box");
      await page.waitForTimeout(250);
    }
    assert.equal(new URL(page.url()).pathname, "/");
    await composer.fill("");
  });
  await check("IME Enter never sends; a long message is kept whole with its limit", async () => {
    // A fresh page: the share check's handoff (a full load that restores a draft) must
    // not still be settling while this check types.
    await navigate("/");
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    const send = page.getByRole("button", { name: "Send message", exact: true });
    // Typing that lands before hydration is replaced by it; retry until it sticks.
    for (let attempt = 0; !(await send.isEnabled()); attempt++) {
      assert(attempt < 10, "the composer takes text");
      await composer.fill("変換中のテキスト");
      await page.waitForTimeout(300);
    }
    // Enter that confirms a composition: flagged as composing, or (Safari) keyCode 229.
    await composer.evaluate((field) => {
      const enter = (init, keyCode) => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...init,
        });
        if (keyCode) Object.defineProperty(event, "keyCode", { get: () => keyCode });
        field.dispatchEvent(event);
      };
      enter({ isComposing: true });
      enter({ isComposing: false }, 229);
    });
    await page.waitForTimeout(800);
    assert.equal(new URL(page.url()).pathname, "/", "a composition Enter does not send");
    assert.equal(await composer.inputValue(), "変換中のテキスト");
    // 5,000 emoji are 10,000 UTF-16 units but 5,000 characters: within the limit, never cut.
    await composer.fill("😀".repeat(5000));
    assert.equal(await composer.inputValue(), "😀".repeat(5000));
    assert(await send.isEnabled(), "5,000 characters can be sent");
    const notice = page.getByText("Messages must be 8,000 characters or fewer.", { exact: true });
    assert.equal(await notice.count(), 0);
    await composer.fill("a".repeat(8100));
    await notice.waitFor();
    assert.equal((await composer.inputValue()).length, 8100, "a long paste is kept whole");
    assert(await send.isDisabled(), "a message over the limit cannot be sent");
    await page.getByText("8,100 / 8,000", { exact: true }).waitFor();
    await composer.fill("");
    await notice.waitFor({ state: "detached" });
  });
  await check("a chat turn streams a tool card and reply that survive reload", async () => {
    // check-product.sh starts the server with eve's deterministic mock model.
    assert.equal(process.env.AEGENTICA_TEST_MODEL, "mock", "Set AEGENTICA_TEST_MODEL=mock.");
    const reply = page.getByText("Mock reply: What is the weather in Stockholm?", { exact: true });
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    await composer.fill("What is the weather in Stockholm?");
    // The Send button enables only once the composer state holds the text.
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByText("Used get weather", { exact: true }).waitFor();
    await reply.waitFor();
    await page.waitForURL(/\/chat\/(?!new-)/);
    await snapshot("desktop-chat-reply");
    await page.reload({ waitUntil: "domcontentloaded" });
    await reply.waitFor();
    // Screen readers hear who said what, and the page is titled after the chat.
    await page.getByRole("article", { name: "You", exact: true }).first().waitFor();
    await page.getByRole("article", { name: "Ægentica", exact: true }).first().waitFor();
    await page
      .getByRole("heading", { level: 1, name: /^What is the weather in Stockholm/ })
      .waitFor({ state: "attached" });
    assert.equal(
      await page.locator("[aria-busy=true]").filter({ hasText: "Mock reply" }).count(),
      0,
      "a finished reply is not busy",
    );
  });
  await check("rename a chat from its sidebar menu and keep the name after reload", async () => {
    const link = page.getByRole("link", { name: /^What is the weather in Stockholm\?/ }).first();
    await link.hover();
    await link
      .locator("..")
      .getByRole("button", { name: /^Actions for / })
      .click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Chat name", exact: true })
      .fill("  Stockholm weather ");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const renamed = page.getByRole("link", { name: /^Stockholm weather/ }).first();
    await renamed.waitFor();
    // A dialog opened from a menu gives focus back to the menu's button, not the page body.
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-haspopup") === "menu" &&
        document.activeElement.closest("[data-desktop-sidebar]"),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await renamed.waitFor();
  });
  await check("dialogs opened by a shortcut give focus back when they close", async () => {
    await navigate("/");
    const composer = page.locator("[data-chat-composer-input]");
    const search = page.getByRole("heading", { name: "Search your workspace", exact: true });
    // A key that lands before hydration meets no listener; retry until search opens.
    for (let attempt = 0; !(await search.isVisible()); attempt++) {
      assert(attempt < 10, "search opens");
      await composer.focus();
      await page.keyboard.press("Control+k");
      await search.waitFor({ timeout: 2000 }).catch(() => {});
    }
    await page.keyboard.press("Escape");
    await search.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.matches("[data-chat-composer-input]"));
  });
  await check("a chat that cannot be deleted or renamed says so and keeps its dialog", async () => {
    await navigate("/agents");
    const link = page.getByRole("link", { name: /^Stockholm weather/ }).first();
    await link.waitFor();
    // Server actions post to the page's own address; refuse them all.
    const refuse = async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"])
        await route.fulfill({ status: 500, body: "" });
      else await route.continue();
    };
    await page.route(/\/agents$/, refuse);
    try {
      await link.hover();
      await link.locator("..").locator("[aria-haspopup=menu]").click();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
      const confirm = page.getByRole("alertdialog", { name: "Delete conversation?" });
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await confirm.getByRole("alert").filter({ hasText: "Couldn't delete this chat" }).waitFor();
      assert(await confirm.isVisible(), "the dialog stays open after a failed delete");
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      await confirm.waitFor({ state: "hidden" });
      await link.hover();
      await link.locator("..").locator("[aria-haspopup=menu]").click();
      await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
      const rename = page.getByRole("dialog", { name: "Rename chat" });
      await rename.getByRole("textbox", { name: "Chat name", exact: true }).fill("Never saved");
      await rename.getByRole("button", { name: "Save", exact: true }).click();
      await rename.getByRole("alert").filter({ hasText: "Couldn't rename this chat" }).waitFor();
      await page.keyboard.press("Escape");
      await rename.waitFor({ state: "hidden" });
      // The name the server still has is back in the list.
      await link.waitFor();
      assert.equal(await page.getByRole("link", { name: /^Never saved/ }).count(), 0);
    } finally {
      await page.unroute(/\/agents$/, refuse);
    }
  });
  await check("pages that cannot load say so, with Retry, instead of looking empty", async () => {
    const failGet = (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 500, json: { error: "Internal error" } })
        : route.continue();
    for (const [path, api, message] of [
      ["/agents", "**/api/agents", "Couldn't load your agents."],
      ["/images", /\/api\/images(\?.*)?$/, "Couldn't load your images."],
      ["/memory", "**/api/settings/memory", "Couldn't load your memory."],
      ["/settings", "**/api/settings/providers", "Couldn't load provider settings."],
      ["/settings/security", "**/api/settings/security", "Couldn't load your account."],
      ["/session", /\/api\/chats$/, "Couldn't load your conversations."],
    ]) {
      await page.route(api, failGet);
      await navigate(path);
      const alert = page.getByRole("alert").filter({ hasText: message });
      await alert.waitFor();
      for (const misleading of [
        "Create your first agent",
        "Your first image starts in chat",
        "Nothing saved yet",
        "Loading settings…",
        "Loading security settings...",
        "No conversations yet",
        "Internal error",
      ])
        assert.equal(
          await page.getByText(misleading).filter({ visible: true }).count(),
          0,
          `${path} shows "${misleading}" beside a failed load`,
        );
      await page.unroute(api, failGet);
      await alert.getByRole("button", { name: "Retry", exact: true }).click();
      await alert.waitFor({ state: "detached" });
    }
    // Activity reports actions as sentences, never raw JSON.
    const sessionId = page.getByRole("textbox", { name: "Session ID", exact: true });
    await sessionId.fill("not-a-real-session");
    await page.getByRole("button", { name: /Compact/ }).click();
    const status = page.getByRole("status").filter({
      hasText:
        /^(Couldn't compact this session\.|Compaction queued\.|This session is no longer active)/,
    });
    await status.waitFor();
    assert.doesNotMatch(await status.innerText(), /[{}]/, "no raw JSON");
  });
  await check("desktop: the Tasks empty state shows every skill", async () => {
    await navigate("/tasks");
    // The list or its empty state, once tasks and skills have loaded.
    await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector("main")?.innerText.includes("Loading tasks"),
    );
    await page.waitForTimeout(1000);
    const row = page
      .locator("p", { hasText: "Or start from a skill" })
      .locator("xpath=following-sibling::div[1]");
    if (await row.count()) {
      const hidden = await row.evaluate((element) => {
        const edge = element.getBoundingClientRect().right;
        return [...element.children]
          .filter((chip) => chip.getBoundingClientRect().right > edge + 1)
          .map((chip) => chip.textContent);
      });
      assert.deepEqual(hidden, [], "no skill hides past the row's edge on a desktop");
    }
  });
  await check("desktop app: drop files, Open with Ægentica, shortcuts, offline", async () => {
    // Start in a chat (the page before may have no composer to drop into).
    await navigate("/");
    await page
      .getByRole("link", { name: /^Stockholm weather/ })
      .first()
      .click();
    await page.waitForURL(/\/chat\//);
    // Pages kept alive in the background hold hidden composers too.
    await page.locator("[data-chat-composer]:visible").first().waitFor();
    // Files dragged anywhere onto the window attach; an untyped .md attaches as text.
    // A drag that lands before hydration meets no listener; retry until one does.
    const overlay = page.locator("[data-drop-overlay]");
    for (let attempt = 0; !(await overlay.isVisible()); attempt++) {
      assert(attempt < 10, "the drop overlay appears");
      await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["# Notes"], "dropped.md", { type: "" }));
        const main = document.querySelector("main");
        main.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true }));
        window.__qaTransfer = transfer;
      });
      await overlay.waitFor({ timeout: 1500 }).catch(() => {});
    }
    await page.evaluate(() =>
      document.querySelector("main").dispatchEvent(
        new DragEvent("drop", {
          dataTransfer: window.__qaTransfer,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await page.locator("[data-drop-overlay]").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Remove dropped.md", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove dropped.md", exact: true })
      .waitFor({ state: "detached" });
    // Ctrl/⌘+B hides and shows the sidebar; Ctrl/⌘+Shift+O starts a chat.
    await page.keyboard.press("Control+b");
    await page.waitForFunction(
      () => document.querySelector("[data-desktop-sidebar]").offsetWidth === 0,
    );
    await page.keyboard.press("Control+b");
    await page.waitForFunction(
      () => document.querySelector("[data-desktop-sidebar]").offsetWidth > 200,
    );
    await page.keyboard.press("Control+Shift+O");
    await page.waitForURL(origin + "/");
    // Without a connection the top bar says so instead of failing quietly.
    const offline = page.getByRole("status").filter({ hasText: "Offline" });
    await context.setOffline(true);
    await offline.waitFor();
    // A page that cannot load gets the branded offline page, mark included (from the cache).
    const unreachable = await context.newPage();
    // Without the browser's HTTP cache, as on a device that has not shown the mark lately.
    const network = await context.newCDPSession(unreachable);
    await network.send("Network.enable");
    await network.send("Network.setCacheDisabled", { cacheDisabled: true });
    await unreachable.goto(origin + "/images", { waitUntil: "load" });
    // The branded page: "Offline" without a connection, "Reconnecting" when the
    // browser still reports one (emulated offline can lag behind navigator.onLine).
    assert.match(await unreachable.title(), /^(Offline|Reconnecting) · Ægentica$/);
    await unreachable.waitForFunction(() => document.querySelector("img")?.naturalWidth > 0);
    await unreachable.close();
    await context.setOffline(false);
    await offline.waitFor({ state: "detached" });
    // Desktop "Open with Ægentica" hands files to the launch queue.
    const launched = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 1280, height: 900 },
    });
    await launched.addInitScript(() => {
      const file = new File(["Opened from the desktop"], "opened.txt", { type: "text/plain" });
      Object.defineProperty(window, "launchQueue", {
        configurable: true,
        value: { setConsumer: (consume) => consume({ files: [{ getFile: async () => file }] }) },
      });
    });
    const opened = await launched.newPage();
    opened.on("pageerror", (error) => errors.push(opened.url() + " — " + error.message));
    await opened.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await opened.getByRole("button", { name: "Remove opened.txt", exact: true }).click();
    await opened
      .getByRole("button", { name: "Remove opened.txt", exact: true })
      .waitFor({ state: "detached" });
    await launched.close();
  });
  await check("on a Mac, ⌘ runs the shortcuts and Ctrl+B / Ctrl+K stay text editing", async () => {
    const mac = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await mac.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: () => ({ platform: "macOS", mobile: false, brands: [] }),
      });
    });
    const tab = await mac.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
    const sidebarWidth = () =>
      tab.evaluate(() => document.querySelector("[data-desktop-sidebar]").offsetWidth);
    // A key that lands before hydration meets no listener; retry until ⌘B hides the sidebar.
    for (let attempt = 0; (await sidebarWidth()) > 0; attempt++) {
      assert(attempt < 10, "⌘B hides the sidebar");
      await tab.keyboard.press("Meta+b");
      await tab.waitForTimeout(500);
    }
    await tab.keyboard.press("Meta+b");
    await tab.waitForFunction(
      () => document.querySelector("[data-desktop-sidebar]").offsetWidth > 200,
    );
    await tab.locator("[data-chat-composer-input]").focus();
    await tab.keyboard.press("Control+b");
    await tab.keyboard.press("Control+k");
    await tab.waitForTimeout(500);
    assert((await sidebarWidth()) > 200, "Ctrl+B leaves the sidebar alone");
    const search = tab.getByRole("heading", { name: "Search your workspace", exact: true });
    assert.equal(await search.count(), 0, "Ctrl+K does not open search");
    await tab.keyboard.press("Meta+k");
    await search.waitFor();
    // The hints name the Mac's key, in search and in the sidebar.
    await tab.getByRole("dialog").getByText("⌘ K", { exact: true }).first().waitFor();
    await tab
      .locator("[data-desktop-sidebar]")
      .getByText("⌘ K", { exact: true })
      .first()
      .waitFor({ state: "attached" });
    await tab.keyboard.press("Escape");
    await mac.close();
  });
  await check("phone: back closes menus and dialogs; long-press opens a chat's menu", async () => {
    assert.equal(await page.evaluate(() => typeof CloseWatcher), "function");
    const phone = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    // Android's back gesture reaches pages as a CloseWatcher close request,
    // which no desktop input can send; a stand-in records the watchers.
    await phone.addInitScript(() => {
      const watchers = [];
      window.CloseWatcher = class {
        constructor() {
          this.onclose = null;
          this.live = true;
          watchers.push(this);
        }
        destroy() {
          this.live = false;
        }
        requestClose() {
          if (!this.live) return;
          this.live = false;
          this.onclose?.();
        }
      };
      window.__qaLive = () => watchers.filter((watcher) => watcher.live).length;
      window.__qaBack = () =>
        watchers
          .filter((watcher) => watcher.live)
          .at(-1)
          ?.requestClose();
    });
    const tab = await phone.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
    // Typing / in the box lists the skills on a phone too; a tap before
    // hydration is dropped, so retry until the list opens.
    const box = tab.locator("[data-chat-composer] textarea");
    const skills = tab.getByRole("listbox", { name: "Skills", exact: true });
    for (let attempt = 0; !(await skills.isVisible()); attempt++) {
      assert(attempt < 10, "the skill list opens");
      await box.click();
      await box.fill("/");
      await skills.waitFor({ timeout: 2000 }).catch(() => {});
    }
    await box.fill("");
    await skills.waitFor({ state: "hidden" });
    await tab.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
    const drawer = tab.getByRole("dialog", { name: "Workspace navigation" });
    await drawer.waitFor();
    const row = drawer.getByRole("link", { name: /^Stockholm weather/ }).first();
    const rename = tab.getByRole("menuitem", { name: "Rename", exact: true });
    await row.dispatchEvent("contextmenu");
    await rename.waitFor();
    await snapshot("mobile-chat-long-press");
    await tab.evaluate(() => window.__qaBack());
    await rename.waitFor({ state: "hidden" });
    assert(await drawer.isVisible(), "back closes the chat's menu before the drawer");
    await row.dispatchEvent("contextmenu");
    await rename.click();
    const dialog = tab.getByRole("dialog", { name: "Rename chat" });
    await dialog.waitFor();
    await tab.waitForFunction(() => window.__qaLive() === 1);
    await tab.evaluate(() => window.__qaBack());
    await dialog.waitFor({ state: "hidden" });
    assert.equal(new URL(tab.url()).pathname, "/", "back closes the dialog and stays on the page");
    // Escape closes only the top layer: a chat's menu or dialog, never the drawer under it.
    if (!(await drawer.isVisible())) {
      await tab.getByRole("button", { name: "Open sidebar", exact: true }).first().click();
      await drawer.waitFor();
    }
    await row.dispatchEvent("contextmenu");
    await rename.waitFor();
    await tab.keyboard.press("Escape");
    await rename.waitFor({ state: "hidden" });
    assert(await drawer.isVisible(), "Escape closes the chat's menu, not the drawer");
    await row.dispatchEvent("contextmenu");
    await rename.click();
    await dialog.waitFor();
    await tab.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await drawer.waitFor();
    await tab.waitForTimeout(300);
    assert(await drawer.isVisible(), "Escape closes the Rename dialog, not the drawer");
    // Outside the installed app, links keep the browser's own long-press menu.
    assert.equal(
      await tab.evaluate(() => {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        document.querySelector('[data-mobile-drawer] a[href="/tasks"]').dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    await phone.close();
  });
  await check("touch tablet: finger-sized controls and chat actions in sight", async () => {
    // Wider than md, but under a finger: density follows the pointer, not the width.
    const tablet = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 820, height: 1180 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const tab = await tablet.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
    const sidebar = tab.locator("[data-desktop-sidebar]");
    const row = sidebar.getByRole("link", { name: /^Stockholm weather/ }).first();
    await row.waitFor();
    await tab.locator("[data-chat-composer]").waitFor();
    const small = await tab.evaluate(() =>
      [
        ...document.querySelectorAll(
          // The whole sidebar, its account row included, and the composer.
          "[data-desktop-sidebar] aside :is(a[href^='/chat/'], nav a, button), [data-chat-composer] button",
        ),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const box = element.getBoundingClientRect();
          const name = element.getAttribute("aria-label") || element.textContent.trim();
          return `${name.slice(0, 40)} ${Math.round(box.width)}x${Math.round(box.height)}`;
        })
        .filter((entry) => {
          const [width, height] = entry.split(" ").at(-1).split("x").map(Number);
          return width < 40 || height < 40;
        }),
    );
    assert.deepEqual(small, [], "sidebar and composer controls are at least 40px under a finger");
    // The chat's ⋯ is in sight (no hover to reveal it) and no keyboard hints show.
    const actions = row.locator("..").locator("[aria-haspopup=menu]");
    assert.equal(await actions.evaluate((button) => getComputedStyle(button).opacity), "1");
    assert.equal(
      await sidebar
        .locator("span", { hasText: "⇧ O" })
        .first()
        .evaluate((hint) => getComputedStyle(hint).display),
      "none",
      "shortcut hints are for keyboards and mice",
    );
    // A dialog's small close button still answers a finger beside it.
    await actions.click();
    await tab.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const close = tab.getByRole("dialog").getByRole("button", { name: "Close", exact: true });
    const box = await close.boundingBox();
    assert(
      await close.evaluate((button, { x, y }) => button.contains(document.elementFromPoint(x, y)), {
        x: box.x + box.width / 2 + 16,
        y: box.y + box.height / 2 + 16,
      }),
      "the close button's hit area reaches about 44px under a finger",
    );
    await close.click();
    await tablet.close();
  });
  await check(
    "the chat list catches up with other devices on reconnect and task results",
    async () => {
      await navigate("/");
      const other = await browser.newContext({
        storageState: await context.storageState(),
        viewport: { width: 1280, height: 900 },
      });
      const device = await other.newPage();
      device.setDefaultTimeout(15000);
      device.on("pageerror", (error) => errors.push(device.url() + " — " + error.message));
      await device.goto(origin + "/", { waitUntil: "domcontentloaded" });
      // Another device renames the chat through its own sidebar menu.
      const renameOn = async (from, to) => {
        const link = device.getByRole("link", { name: new RegExp(`^${from}`) }).first();
        await link.hover();
        await link
          .locator("..")
          .getByRole("button", { name: /^Actions for / })
          .click();
        await device.getByRole("menuitem", { name: "Rename", exact: true }).click();
        await device.getByRole("textbox", { name: "Chat name", exact: true }).fill(to);
        await device.getByRole("button", { name: "Save", exact: true }).click();
        await device
          .getByRole("link", { name: new RegExp(`^${to}`) })
          .first()
          .waitFor();
      };
      await renameOn("Stockholm weather", "Renamed on another device");
      // Back online, this device's list catches up without a reload.
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .getByRole("link", { name: /^Renamed on another device/ })
        .first()
        .waitFor();
      // A task result's notification tells the open app to catch up too.
      await renameOn("Renamed on another device", "Stockholm weather");
      await page.evaluate(() =>
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent("message", { data: { type: "aegentica:chats-changed" } }),
        ),
      );
      await page
        .getByRole("link", { name: /^Stockholm weather/ })
        .first()
        .waitFor();
      await other.close();
      // Capabilities read as words; the identifier stays in the details.
      await navigate("/capabilities");
      await page
        .getByRole("button", { name: /^Read file/ })
        .first()
        .click();
      await page.getByRole("dialog").getByText("read_file", { exact: true }).first().waitFor();
      await page.keyboard.press("Escape");
    },
  );
  await check("phone: replies and chat links open the share sheet", async () => {
    const chatPath = await page
      .getByRole("link", { name: /^Stockholm weather/ })
      .first()
      .getAttribute("href");
    const phone = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await phone.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          window.__qaShared = data;
        },
      });
    });
    const tab = await phone.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + chatPath, { waitUntil: "domcontentloaded" });
    await tab.getByText("Mock reply: What is the weather in Stockholm?", { exact: true }).waitFor();
    const share = tab.getByRole("button", { name: "Share reply", exact: true }).last();
    const box = await share.boundingBox();
    assert(box && box.height >= 40, "reply actions are finger-sized on phones");
    await share.click();
    await tab.waitForFunction(() => window.__qaShared?.text?.includes("Mock reply"));
    await tab.getByRole("button", { name: "Share chat link", exact: true }).click();
    await tab.waitForFunction(() => window.__qaShared?.url === location.href);
    await phone.close();
  });
  await check("a half-written message survives a reload until it is sent", async () => {
    await navigate("/");
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    // Typing that lands before hydration is replaced by it; retry until it sticks.
    for (let attempt = 0; (await composer.inputValue()) !== "Half-written thought"; attempt++) {
      assert(attempt < 10, "the composer keeps typed text");
      await composer.fill("Half-written thought");
      await page.waitForTimeout(300);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("[data-chat-composer-input]")?.value === "Half-written thought",
    );
    await composer.fill("");
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Search pages and conversations", exact: true })
      .waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await composer.inputValue(), "", "a cleared draft stays cleared");
  });
  await check("images open full screen; desktop shortcuts for settings and help", async () => {
    // A picture as generate_image would save it, beside the test server's memory.
    assert(process.env.EVE_MEMORY_DIR, "check-product.sh sets EVE_MEMORY_DIR");
    const media = join(dirname(process.env.EVE_MEMORY_DIR), "media");
    const name = `${randomUUID()}.png`;
    await mkdir(media, { recursive: true });
    await writeFile(
      join(media, name),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await writeFile(
      join(media, `${name}.json`),
      JSON.stringify({ prompt: "A test picture", model: "test/model" }),
    );
    // Kept by the browser, revalidated on each use: the second fetch is a 304.
    const first = await context.request.get(`${origin}/api/media/${name}`);
    assert.equal(first.headers()["cache-control"], "private, no-cache");
    const again = await context.request.get(`${origin}/api/media/${name}`, {
      headers: { "If-None-Match": first.headers().etag },
    });
    assert.equal(again.status(), 304);
    await navigate("/images");
    await page
      .getByRole("button", { name: /A test picture/ })
      .first()
      .click();
    await page.getByRole("button", { name: "View full screen", exact: true }).click();
    const viewer = page.locator("[data-image-viewer]");
    await viewer.waitFor();
    // It opens with a short zoom from 95%; measured on the first frame it is smaller.
    await page.waitForFunction(() => {
      const box = document.querySelector("[data-image-viewer]")?.getBoundingClientRect();
      return box && box.width >= innerWidth - 1 && box.height >= innerHeight - 1;
    });
    assert(await viewer.getByRole("link", { name: "Save image", exact: true }).isVisible());
    await snapshot("desktop-image-viewer");
    await page.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    // Ctrl/⌘+, opens Settings; search lists the keyboard shortcuts.
    await page.keyboard.press("Control+,");
    await page.waitForURL(origin + "/settings");
    await page.keyboard.press("Control+k");
    await page.getByText("Esc stops a reply", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
  });
  await check("app icon: themed icon, shortcut glyphs and desktop file handling", async () => {
    const manifest = await (await context.request.get(origin + "/manifest.webmanifest")).json();
    assert(
      manifest.icons.some((icon) => icon.purpose === "monochrome"),
      "themed icon",
    );
    const shortcutIcons = new Set(manifest.shortcuts.map((shortcut) => shortcut.icons[0].src));
    assert.equal(shortcutIcons.size, manifest.shortcuts.length, "each shortcut has its own icon");
    assert(manifest.file_handlers?.[0]?.accept["application/pdf"], "PDFs open with Ægentica");
    for (const src of [...shortcutIcons, "/icons/monochrome-512.png"]) {
      const response = await context.request.get(origin + src);
      assert.equal(response.status(), 200, src);
      assert.equal(response.headers()["content-type"], "image/png", src);
    }
    // Browsers and link previews ask for /favicon.ico directly: the mark, not a Not found page.
    const favicon = await context.request.get(origin + "/favicon.ico");
    assert.equal(favicon.status(), 200);
    assert.match(favicon.headers()["content-type"], /icon/);
    assert.deepEqual([...(await favicon.body()).subarray(0, 4)], [0, 0, 1, 0], "an ICO file");
  });
  await check("without site storage a text message still sends", async () => {
    const blocked = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    // Blocked site data: Chrome refuses IndexedDB with a SecurityError.
    await blocked.addInitScript(() => {
      IDBFactory.prototype.open = () => {
        throw new DOMException("Access to the Indexed Database API is denied.", "SecurityError");
      };
    });
    const tab = await blocked.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
    const composer = tab.getByRole("textbox", { name: "Message Ægentica", exact: true });
    const send = tab.getByRole("button", { name: "Send message", exact: true });
    for (let attempt = 0; !(await send.isEnabled()); attempt++) {
      assert(attempt < 10, "the composer takes text");
      await composer.fill("Sent without site storage");
      await tab.waitForTimeout(300);
    }
    await send.click();
    await tab.getByText("Mock reply: Sent without site storage", { exact: true }).waitFor();
    await tab.waitForURL(/\/chat\/(?!new-)/);
    // Attachments do need the storage, and say so. (The page left behind stays mounted, hidden.)
    // A file set before the new chat page is hydrated meets no listener; set it again.
    const notice = tab.getByText(/blocks site storage/);
    for (let attempt = 0; !(await notice.isVisible()); attempt++) {
      assert(attempt < 5, "attaching without site storage says why");
      await tab
        .getByLabel("Upload attachments", { exact: true })
        .filter({ visible: true })
        .setInputFiles({
          name: "blocked.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Needs storage"),
        });
      await notice.waitFor({ timeout: 3000 }).catch(() => {});
    }
    await blocked.close();
  });
  await check(
    "phone: long words wrap, swipes still open the drawer, Send stays in view",
    async () => {
      const phone = await browser.newContext({
        storageState: await context.storageState(),
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const tab = await phone.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
      // Closed, the drawer leaves no hairline on screen.
      await tab.goto(origin + "/", { waitUntil: "domcontentloaded" });
      await tab.locator("[data-mobile-drawer]").waitFor({ state: "attached" });
      assert(
        await tab.evaluate(
          () =>
            document.querySelector("[data-mobile-drawer]").getBoundingClientRect().right <= -0.5,
        ),
        "the closed drawer is fully off screen",
      );
      // A token longer than the screen, as a pasted link or hash would be.
      const long = `Wrap ${"averylongtokenwithoutanyspaces".repeat(9)}`;
      const composer = tab.getByRole("textbox", { name: "Message Ægentica", exact: true });
      const send = tab.getByRole("button", { name: "Send message", exact: true });
      for (let attempt = 0; !(await send.isEnabled()); attempt++) {
        assert(attempt < 10, "the composer takes text");
        await composer.fill(long);
        await tab.waitForTimeout(300);
      }
      await send.click();
      const reply = tab.getByText(`Mock reply: ${long}`, { exact: true });
      await reply.waitFor();
      // Measure the finished reply: while it still reveals, the conversation keeps
      // scrolling and a swipe can land on the code block below it.
      await tab.getByRole("button", { name: "Copy reply", exact: true }).first().waitFor();
      await tab.waitForFunction(() => document.body.innerText.includes("const ready = true"));
      const layout = await reply.evaluate((element) => {
        const sideways = [];
        for (let node = element; node; node = node.parentElement) {
          const { overflowX } = getComputedStyle(node);
          if (
            (overflowX === "auto" || overflowX === "scroll") &&
            node.scrollWidth > node.clientWidth
          )
            sideways.push(node.tagName);
        }
        return { right: element.getBoundingClientRect().right, width: innerWidth, sideways };
      });
      assert(layout.right <= layout.width + 1, "the reply fits the screen");
      assert.deepEqual(layout.sideways, [], "nothing around the reply scrolls sideways");
      // A right swipe that starts on the reply still pulls the drawer open. The
      // touch must land on the reply itself (a slow machine may still be scrolling),
      // so each attempt checks that first; a real regression fails every attempt.
      const drawer = tab.getByRole("dialog", { name: "Workspace navigation" });
      const cdp = await phone.newCDPSession(tab);
      for (let attempt = 0; !(await drawer.isVisible()); attempt++) {
        assert(attempt < 5, "a swipe that starts on the reply opens the drawer");
        await reply.scrollIntoViewIfNeeded();
        await tab.waitForTimeout(300);
        const box = await reply.boundingBox();
        // On the reply's first lines, clear of the top bar's buttons.
        const y = Math.min(Math.max(box.y + 12, 100), box.y + box.height - 4);
        const onReply = await reply.evaluate(
          (element, point) => element.contains(document.elementFromPoint(point.x, point.y)),
          { x: 40, y },
        );
        if (!onReply) continue;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 40, y }],
        });
        for (let step = 1; step <= 8; step++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: 40 + step * 30, y: y + step / 4 }],
          });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await drawer.waitFor({ timeout: 3000 }).catch(() => {});
      }
      await tab.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      await cdp.detach();
      // With the keyboard up (a short screen), Send stays in view, and a long
      // message scrolls inside the box instead of pushing Send away.
      await tab.setViewportSize({ width: 360, height: 380 });
      const chatPath = new URL(tab.url()).pathname;
      for (const path of ["/", chatPath]) {
        await tab.goto(origin + path, { waitUntil: "domcontentloaded" });
        await composer.waitFor();
        await tab.waitForTimeout(500);
        await composer.fill(Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join("\n"));
        await tab.waitForTimeout(300);
        const fits = await tab.evaluate(() => ({
          send: document
            .querySelector("[data-chat-composer] button[type=submit]")
            .getBoundingClientRect().bottom,
          height: innerHeight,
          scrolls: document.scrollingElement.scrollHeight > innerHeight + 1,
        }));
        assert(fits.send <= fits.height, `${path}: Send is on screen with the keyboard up`);
        assert.equal(fits.scrolls, false, `${path}: the page does not scroll`);
        await composer.fill("");
      }
      await phone.close();
    },
  );
  await check("a chat that cannot be created says why on the home page", async () => {
    await navigate("/");
    // The provisional chat's first server action (creating the chat) fails.
    let failed = false;
    await page.route(/\/chat\/new-/, async (route) => {
      if (
        !failed &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        failed = true;
        await route.fulfill({ status: 500, body: "" });
      } else await route.continue();
    });
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    const send = page.getByRole("button", { name: "Send message", exact: true });
    for (let attempt = 0; !(await send.isEnabled()); attempt++) {
      assert(attempt < 10, "the composer takes text");
      await composer.fill("This chat will not be created");
      await page.waitForTimeout(300);
    }
    await send.click();
    const toast = page
      .getByRole("alert")
      .filter({ has: page.getByRole("button", { name: "Dismiss error", exact: true }) });
    await toast.waitFor();
    // The toast says what happened, without a generic "Request failed" title.
    assert.doesNotMatch(await toast.innerText(), /Request failed/);
    assert.equal(new URL(page.url()).pathname, "/");
    assert(failed, "chat creation was refused");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-chat-composer-input]")?.value ===
        "This chat will not be created",
    );
    await page.unroute(/\/chat\/new-/);
    await page.getByRole("button", { name: "Dismiss error", exact: true }).click();
    await composer.fill("");
  });
  await check(
    "after a deploy a send reloads once into the new version and keeps the message",
    async () => {
      await navigate("/");
      // A deploy replaces every Server Action ID: the new server no longer knows this page's.
      const staleActions = async (route) => {
        const headers = route.request().headers();
        if (route.request().method() === "POST" && headers["next-action"])
          await route.continue({ headers: { ...headers, "next-action": "7f" + "0".repeat(40) } });
        else await route.continue();
      };
      await page.route("**/*", staleActions);
      await page.waitForLoadState("load");
      let loads = 0;
      const countLoad = () => loads++;
      page.on("load", countLoad);
      const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
      const send = page.getByRole("button", { name: "Send message", exact: true });
      for (let attempt = 0; !(await send.isEnabled()); attempt++) {
        assert(attempt < 10, "the composer takes text");
        await composer.fill("Sent across a deploy");
        await page.waitForTimeout(300);
      }
      await send.click();
      // No raw "Server Action … was not found" toast: the page reloads by itself…
      for (let waited = 0; loads === 0; waited += 250) {
        assert(waited < 15_000, "the page reloads into the new version");
        await page.waitForTimeout(250);
      }
      // …with the message back in the box.
      await page.waitForFunction(
        () =>
          document.querySelector("[data-chat-composer-input]")?.value === "Sent across a deploy",
      );
      // Still refused right after that reload: it says so and offers Reload instead of looping.
      await send.click();
      const notice = page.getByRole("alert").filter({ hasText: "Ægentica was updated" });
      await notice.getByText("Reload to continue with the new version.").waitFor();
      await notice.getByRole("button", { name: "Reload", exact: true }).waitFor();
      await page.waitForTimeout(3000);
      assert.equal(loads, 1, "one automatic reload, no loop");
      page.off("load", countLoad);
      await page.unroute("**/*", staleActions);
      await page.getByRole("button", { name: "Dismiss error", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-chat-composer-input]")?.value === "Sent across a deploy",
      );
      await composer.fill("");
    },
  );
  await check("memory import reports what it saved and skipped", async () => {
    await navigate("/memory");
    const importButton = page.getByRole("button", { name: "Import", exact: true });
    const field = page.getByLabel("Memories to import", { exact: true });
    for (let attempt = 0; !(await field.isVisible()); attempt++) {
      assert(attempt < 10, "the import dialog opens");
      await importButton.click();
      await field.waitFor({ timeout: 2000 }).catch(() => {});
    }
    await field.fill("- Likes sauna\n- Likes sauna\n- Drinks tea");
    await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
    await page
      .getByText("Imported 2 memories. Skipped 1 line already saved or repeated.", { exact: true })
      .waitFor();
    // More than 60 lines are refused whole, with the reason inside the dialog.
    await importButton.click();
    await field.fill(Array.from({ length: 61 }, (_, i) => `Note ${i}`).join("\n"));
    await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByText(/up to 60 lines at a time; this has 61/)
      .waitFor();
    await page.keyboard.press("Escape");
  });
  await check("math in a reply renders once, loading KaTeX only then", async () => {
    await navigate("/");
    const katexStyles = () =>
      page.evaluate(() =>
        [...document.styleSheets].some((sheet) => {
          try {
            return [...sheet.cssRules].some((rule) => rule.selectorText?.includes(".katex-mathml"));
          } catch {
            return false;
          }
        }),
      );
    assert.equal(await katexStyles(), false, "no KaTeX styles before a reply needs them");
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    await composer.fill("Energy: $$E = mc^2$$");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.locator(".katex").first().waitFor();
    // With KaTeX's styles its MathML copy is visually hidden, so the formula shows once.
    await page.waitForFunction(() => {
      const mathml = document.querySelector(".katex .katex-mathml");
      return mathml !== null && getComputedStyle(mathml).position === "absolute";
    });
  });
  await check("capabilities that are not in effect say so, on phones too", async () => {
    const phone = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const tab = await phone.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/capabilities", { waitUntil: "domcontentloaded" });
    // This app's own agent.ts and sandbox replace eve's defaults, which the runtime reports as shadowed.
    const row = tab.getByRole("button", { name: /Replaced by an authored override/ }).first();
    // Typing that lands before hydration is replaced by it; retry until the list filters.
    for (let attempt = 0; !(await row.isVisible()); attempt++) {
      assert(attempt < 10, "shadowed runtime entries are listed");
      await tab.getByRole("textbox", { name: "Search capabilities", exact: true }).fill("Shadowed");
      await row.waitFor({ timeout: 3000 }).catch(() => {});
    }
    assert(await row.getByText("Shadowed", { exact: true }).isVisible(), "badge shows on phones");
    await row.click();
    await tab
      .getByRole("dialog")
      .getByText("Replaced by an authored override", { exact: true })
      .waitFor();
    await phone.close();
  });
  await check("phone: the saved agent dialog is finger-sized", async () => {
    const phone = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const tab = await phone.newPage();
    tab.setDefaultTimeout(15000);
    tab.on("pageerror", (error) => errors.push(tab.url() + " — " + error.message));
    await tab.goto(origin + "/agents", { waitUntil: "domcontentloaded" });
    const name = tab.getByLabel("Name", { exact: true });
    for (let attempt = 0; !(await name.isVisible()); attempt++) {
      assert(attempt < 10, "the agent dialog opens");
      // Phones label it "Create".
      await tab.getByRole("button", { name: "Create", exact: true }).click();
      await name.waitFor({ timeout: 2000 }).catch(() => {});
    }
    const dialog = tab.getByRole("dialog");
    for (const [label, control] of [
      ["Name", name],
      ["Description", tab.getByLabel("Description", { exact: true })],
      ["Preferred model", tab.getByLabel("Preferred model", { exact: true })],
      ["Reasoning effort", tab.getByLabel("Reasoning effort", { exact: true })],
      ["a starter", dialog.getByRole("button", { name: "Research partner", exact: true })],
      ["Save agent", dialog.getByRole("button", { name: "Save agent", exact: true })],
    ]) {
      const box = await control.boundingBox();
      assert(box && box.height >= 43, `${label} is finger-sized on phones`);
    }
    await phone.close();
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
