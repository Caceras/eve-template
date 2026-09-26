// Renders the install-dialog images in public/screenshots/: real phone and
// desktop captures of the app, framed with a headline on the brand's black
// canvas, like app-store screenshots. Run against a local server started with
// test credentials and AEGENTICA_TEST_MODEL=mock (see pnpm qa:tour); it seeds
// a few example tasks and memories there.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";

const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Seeds example data with test credentials, so it runs against localhost only.");
const output = resolve(import.meta.dirname, "../public/screenshots");
await mkdir(output, { recursive: true });

const NARROW = [
  {
    file: "phone-home.png",
    route: "/",
    title: "Your own AI agent",
    text: "Private, on your own server. On every device.",
  },
  {
    file: "phone-chat.png",
    route: "chat",
    title: "Ask anything",
    text: "It researches, writes and plans with you.",
  },
  {
    file: "phone-tasks.png",
    route: "/tasks",
    title: "Runs tasks for you",
    text: "Briefings, reminders and recurring jobs, with a notification when done.",
  },
  {
    file: "phone-memory.png",
    route: "/memory",
    title: "Remembers what matters",
    text: "One memory across the app, Telegram and your tasks.",
  },
];
const WIDE = {
  file: "desktop-chat.png",
  title: "Your own<br>AI agent",
  text: "Chat, research, tasks and memory, on your own server.",
};

const browser = await launchBrowser();
const credentials = {
  username: process.env.EVE_CHAT_USERNAME,
  password: process.env.EVE_CHAT_PASSWORD,
};

async function signedInPage(options) {
  const context = await browser.newContext({ ...options, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(origin);
  const status = await page.evaluate(
    async (body) =>
      (
        await fetch("/api/password-auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    credentials,
  );
  if (status !== 200) throw new Error(`Sign-in failed with ${status}.`);
  return page;
}

async function post(page, path, body) {
  const status = await page.evaluate(
    async ([path, body]) =>
      (
        await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    [path, body],
  );
  if (status >= 400) throw new Error(`${path} answered ${status}.`);
}

// The framework's dev overlay never belongs in a product image.
const hideDevChrome = (page) =>
  page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

async function capture(page, route) {
  if (route === "chat") {
    await page.goto(origin, { waitUntil: "networkidle" });
    const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
    await composer.fill("Plan a relaxed weekend in Stockholm for two");
    await composer.press("Enter");
    await page.getByText("Mock reply:").first().waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Stop response" }).waitFor({ state: "detached" });
    // A reload renders the saved reply once, so React never rewrites the staged copy.
    await page.reload();
    await page.getByRole("button", { name: "Copy reply" }).first().waitFor();
    await page.waitForTimeout(1000);
    // The mock model's placeholder reply becomes an example of a real one.
    await page.evaluate(() => {
      const first = [...document.querySelectorAll("article .space-y-4")].find((block) =>
        block.textContent?.includes("Mock reply:"),
      );
      if (!first?.parentElement) throw new Error("No reply to stage.");
      for (const part of Array.from(first.parentElement.children))
        if (part !== first && !part.querySelector("[aria-label='Copy reply']")) part.remove();
      for (const later of [...first.parentElement.querySelectorAll(".space-y-4")].slice(1))
        later.remove();
      first.innerHTML = `
        <p>Here’s an easy weekend with room to wander:</p>
        <h3 class="font-semibold">Saturday</h3>
        <ul class="list-disc space-y-1 pl-5">
          <li>Morning coffee and a walk through Gamla stan</li>
          <li>Fotografiska, then dinner in Södermalm</li>
        </ul>
        <h3 class="font-semibold">Sunday</h3>
        <ul class="list-disc space-y-1 pl-5">
          <li>Ferry to Djurgården and a slow lunch</li>
          <li>Skansen or the Vasa Museum before heading home</li>
        </ul>
        <p>Want me to check opening hours and book a table?</p>`;
    });
    await page.evaluate(() => document.querySelector("[role=log]")?.scrollTo({ top: 0 }));
  } else {
    await page.goto(origin + route, { waitUntil: "networkidle" });
  }
  await hideDevChrome(page);
  await page.waitForTimeout(400);
  return (await page.screenshot()).toString("base64");
}

const phone = await signedInPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
// Example data for the Tasks and Memory captures; memory opens after the first message.
async function seed(page) {
  for (const [title, prompt, cron] of [
    ["Morning briefing", "Summarize my calendar, the weather and the top news.", "0 7 * * 1-5"],
    ["Water the plants", "Remind me to water the plants.", "0 18 * * 0"],
    ["Weekly review", "Review what I got done this week and plan the next.", "0 17 * * 5"],
  ])
    await post(page, "/api/settings/schedules", {
      action: "create",
      title,
      prompt,
      cron,
      runAt: null,
      timezone: "Europe/Stockholm",
    });
  await post(page, "/api/settings/memory", {
    action: "import",
    text: [
      "Prefers short, direct answers",
      "Lives in Stockholm",
      "Vegetarian; loves Italian food",
      "Runs on Tuesday and Saturday mornings",
    ].join("\n"),
  });
}

const narrow = [];
for (const slide of NARROW) {
  if (slide.route === "/tasks") await seed(phone);
  narrow.push({ ...slide, image: await capture(phone, slide.route) });
}

const desktop = await signedInPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const wideImage = await capture(desktop, "chat");

// Compose on the app's own origin so the page's Geist fonts load.
const canvas = await browser.newPage();
await canvas.route(/\.js(\?|$)/, (route) => route.abort());
await canvas.goto(origin + "/_not-found-canvas");
async function compose({ width, height, file, html }) {
  await canvas.setViewportSize({ width, height });
  await canvas.evaluate((html) => {
    document.documentElement.className += " dark";
    document.body.innerHTML = html;
  }, html);
  await canvas.evaluate(() => document.fonts.ready);
  await canvas.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  );
  await canvas.screenshot({ path: resolve(output, file) });
  console.log(`Wrote public/screenshots/${file}`);
}

const MARK =
  '<svg viewBox="0 0 1254 1254" width="84" height="84" fill="none"><path fill="white" d="M278 810 L357 811 L489 642 L601 642 L602 811 L956 811 L956 758 L665 757 L666 642 L956 642 L956 589 L532 588 L627 467 L956 467 L956 416 L585 416 Z"/></svg>';
const style = `
  <style>
    body { margin: 0; background: #050505; font-family: var(--font-geist-sans), sans-serif; }
    .slide { position: relative; overflow: hidden; width: 100vw; height: 100vh; background:
      radial-gradient(120% 60% at 50% 100%, rgba(255,255,255,0.09), transparent 60%), #050505; color: #fafafa; }
    h1 { margin: 0; font-weight: 600; letter-spacing: -0.045em; line-height: 1.02; }
    p { margin: 0; color: #a3a3a3; letter-spacing: -0.01em; }
    .device { position: absolute; background: #1a1a1a; box-shadow:
      0 0 0 2px #2e2e2e, 0 40px 120px rgba(0,0,0,0.55), 0 0 90px rgba(255,255,255,0.05); }
    .device img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  </style>`;

// 390 x 844 screen below a 40px status bar, scaled to fit the canvas whole.
const STATUS_BAR = `
  <div style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 34px;background:#fff;color:#0a0a0a;font:600 21px var(--font-geist-sans),sans-serif">
    <span>9:41</span>
    <span style="display:flex;gap:8px;align-items:center">
      <svg width="26" height="16" viewBox="0 0 26 16"><rect x="0" y="10" width="4" height="6" rx="1" fill="#0a0a0a"/><rect x="7" y="7" width="4" height="9" rx="1" fill="#0a0a0a"/><rect x="14" y="4" width="4" height="12" rx="1" fill="#0a0a0a"/><rect x="21" y="0" width="4" height="16" rx="1" fill="#0a0a0a"/></svg>
      <svg width="34" height="16" viewBox="0 0 34 16"><rect x="0.5" y="0.5" width="29" height="15" rx="4" fill="none" stroke="#0a0a0a"/><rect x="3" y="3" width="21" height="10" rx="2" fill="#0a0a0a"/><rect x="31" y="5" width="2.5" height="6" rx="1" fill="#0a0a0a"/></svg>
    </span>
  </div>`;
for (const slide of narrow)
  await compose({
    width: 1080,
    height: 1920,
    file: slide.file,
    html: `${style}
      <div class="slide">
        <div style="position:absolute;top:92px;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 90px">
          ${MARK}
          <h1 style="margin-top:26px;font-size:80px;white-space:nowrap">${slide.title}</h1>
          <p style="margin-top:22px;font-size:34px;line-height:1.35;max-width:800px">${slide.text}</p>
        </div>
        <div class="device" style="left:218px;top:470px;width:644px;height:1394px;border-radius:80px;padding:16px">
          <div style="width:100%;height:100%;border-radius:64px;overflow:hidden;background:#fff;display:flex;flex-direction:column">
            ${STATUS_BAR}
            <img style="flex:1;min-height:0" src="data:image/png;base64,${slide.image}">
          </div>
        </div>
      </div>`,
  });

await compose({
  width: 1920,
  height: 1080,
  file: WIDE.file,
  html: `${style}
    <div class="slide">
      <div style="position:absolute;left:120px;top:0;bottom:0;width:580px;display:flex;flex-direction:column;justify-content:center">
        ${MARK}
        <h1 style="margin-top:32px;font-size:92px">${WIDE.title}</h1>
        <p style="margin-top:28px;font-size:34px;line-height:1.35">${WIDE.text}</p>
      </div>
      <div class="device" style="left:760px;top:150px;width:1340px;height:838px;border-radius:28px;padding:14px">
        <div style="width:100%;height:100%;border-radius:16px;overflow:hidden;background:#fff">
          <img src="data:image/png;base64,${wideImage}">
        </div>
      </div>
    </div>`,
});

await browser.close();
