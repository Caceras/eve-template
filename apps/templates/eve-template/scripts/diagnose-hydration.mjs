import { chromium } from "/tmp/aegentica-browser/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage();
const messages = [];
page.on('console', message => { if(message.type()==='error') messages.push(message.text()); });
page.on('pageerror', error => messages.push(error.stack || error.message));
try {
  for (const path of ['/', '/agents']) {
    await page.goto('http://localhost:3001'+path, {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(4000);
  }
} catch(error) { messages.push(String(error)); }
finally {
  await writeFile(process.env.QA_ARTIFACTS+'/hydration-diagnostics.json', JSON.stringify(messages,null,2));
  console.log(messages.join('\n'));
  await browser.close();
}
