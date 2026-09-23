import { chromium } from "/tmp/aegentica-browser/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
const browser=await chromium.launch();
const page=await browser.newPage();
const messages=[];
page.on('console',m=>{if(m.type()==='error')messages.push(page.url()+' '+m.text());});
page.on('pageerror',e=>messages.push(page.url()+' '+(e.stack||e.message)));
try {
  let ready=false;
  for(let n=0;n<45;n++){try{await fetch('http://localhost:3001/icon.svg',{signal:AbortSignal.timeout(2000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)throw new Error('Diagnostic server did not start.');
  await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await page.getByLabel('Username',{exact:true}).fill(process.env.EVE_CHAT_USERNAME);
  await page.getByLabel('Password',{exact:true}).fill(process.env.EVE_CHAT_PASSWORD);
  await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForFunction(async()=>(await fetch('/api/agents')).status===200);
  await page.getByLabel('Password',{exact:true}).waitFor({state:'hidden'});
  for(const path of ['/','/agents','/capabilities','/images','/tasks','/memory','/settings','/settings/voice','/settings/notifications','/settings/integrations','/library','/session','/native']){
    await page.goto('http://localhost:3001'+path,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1000);
  }
}catch(e){messages.push(String(e));}finally{
  await writeFile(process.env.QA_ARTIFACTS+'/hydration-diagnostics.json',JSON.stringify(messages,null,2));
  console.log(messages.join('\n'));
  await browser.close();
}
