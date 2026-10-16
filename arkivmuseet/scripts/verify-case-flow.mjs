import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import flow from '../cases/leadership-flow.json' with {type:'json'};
const url=process.env.MUSEUM_URL||'http://127.0.0.1:4196/';
const out='qa-visit';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MUSEUM_CHROME||undefined,headless:process.env.MUSEUM_HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
const results=[];
try{
 for(const width of [1280,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(url);await page.locator('#flat-enter').click();
  await page.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.3'));
  for(const [i,f] of flow.cases.entries()){
   await page.locator('#case-step-heading').waitFor();
   assert.ok((await page.locator('#story-content').innerText()).includes(f.question));
   for(let step=0;step<5;step++){
    assert.ok((await page.locator('#case-step-heading').innerText()).startsWith(String(step+1).padStart(2,'0')));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow');
    assert.ok(await page.locator('#story-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Reading panel overflow');
    if(step===2){assert.ok((await page.locator('#story-content').innerText()).includes(f.leaderConsequence));await page.locator('#story-previous').click();assert.ok((await page.locator('#case-step-heading').innerText()).startsWith('02'));await page.locator('#story-next').click();}
    if(step===4){assert.ok((await page.locator('#story-content').innerText()).includes(f.proof));assert.ok((await page.locator('#story-content').innerText()).includes(f.bridge));await page.locator('#case-plan').click();await page.locator('#action-plan').waitFor();await page.locator('#dialog-close').click();if(i===0)await page.screenshot({path:`${out}/leader-flow-${width}.png`});}
    await page.locator('#story-next').click();
   }
  }
  await page.locator('#leader-plan').waitFor();assert.equal(await page.locator('.leader-summary dt').count(),5);
  assert.equal(await page.locator('#passport-open').innerText(),'Øvelser 0/5');
  await page.locator('#leader-plan').click();await page.locator('#action-plan').waitFor();
  // Text navigation is allowed during loading; also inspect late initialization errors.
  await page.waitForFunction(()=>typeof window.museumDiagnostics==='function',null,{timeout:60000});
  assert.deepEqual(errors,[]);results.push({width,largeText:true,cases:5,chapters:25,exercisesRequired:false});await page.close();
 }
 const text=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
 await text.goto(url+'tekst.html');
 for(const f of flow.cases){const body=await text.locator('article#'+f.id).innerText();assert.ok(body.includes(f.leaderConsequence));assert.ok(body.includes(f.proof));assert.ok(body.includes(f.bridge));}
 await text.close();await writeFile(out+'/leader-flow-results.json',JSON.stringify(results,null,2));console.log('PASS: shared leadership narrative, sources, backwards/forwards navigation, no-quiz route, 320/390/1280 px and no-JavaScript edition');
}finally{await browser.close();}
