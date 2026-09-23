import { chromium } from "/tmp/aegentica-browser/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage();
const messages = [];
page.on("console", message => { if (message.type() === "error") messages.push(message.text()); });
page.on("pageerror", error => messages.push(error.stack || error.message));
try {
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      await fetch("http://localhost:3001/icon.svg", { signal: AbortSignal.timeout(2000) });
      ready = true;
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("Diagnostic dev server did not start.");
  for (const path of ["/", "/agents"]) {
    await page.goto("http://localhost:3001" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
  }
} catch (error) { messages.push(String(error)); }
finally {
  await writeFile(process.env.QA_ARTIFACTS + "/hydration-diagnostics.json", JSON.stringify(messages, null, 2));
  console.log(messages.join("\n"));
  await browser.close();
}
