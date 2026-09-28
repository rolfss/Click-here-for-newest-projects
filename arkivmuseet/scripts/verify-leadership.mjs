import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
const url=process.env.MUSEUM_URL||'http://127.0.0.1:4196/';
const out=(process.env.MUSEUM_QA_DIR||'qa-visit')+'/leadership';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MUSEUM_CHROME||undefined,
 headless:process.env.MUSEUM_HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const log=[],errors=[],missing=[];let mountServer;
const check=(value,message)=>{assert.ok(value,message);log.push(message);console.log('PASS: '+message);};
const observe=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)missing.push(r.url());});};
// Compare with the configured device width; desktop scrollbars legitimately reduce clientWidth.
const fits=page=>page.evaluate(viewportWidth=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&innerWidth<=viewportWidth+1&&[...document.querySelectorAll('#dialog[open],.dialog-header,#dialog-body,#story-content,.guide-page main')].filter(e=>e.getClientRects().length).every(e=>e.scrollWidth<=e.clientWidth+1),page.viewportSize().width);
const focusIs=(page,id)=>page.locator(id).evaluate(e=>e===document.activeElement);
const closeIsReachable=page=>page.evaluate(()=>{
 const button=document.querySelector('#dialog-close'),r=button.getBoundingClientRect();
 const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 const viewport=window.visualViewport;
 const left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0;
 const right=left+(viewport?.width??innerWidth),bottom=top+(viewport?.height??innerHeight);
 return r.x>=left&&r.y>=top&&r.right<=right&&r.bottom<=bottom&&(hit===button||button.contains(hit));
});
const readableGuide=(page,selector='#dialog .guide-kicker,#dialog .guide-boundary,#dialog .guide-references span')=>page.evaluate(selector=>{
 const luminance=value=>{
  const channels=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
 };
 const background=luminance(getComputedStyle(document.querySelector('#dialog')).backgroundColor);
 return [...document.querySelectorAll(selector)]
  .filter(e=>e.getClientRects().length).every(e=>{
   const foreground=luminance(getComputedStyle(e).color);
   return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)>=4.5;
  });
},selector);
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});observe(page);
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#enter').disabled);
 check((await page.locator('#intro').innerText()).includes('Mulighetene vi skaper'),'Entrance communicates opportunities, not only loss');
 await page.screenshot({path:out+'/desktop-entry.png'});
 await page.locator('#about').click();check(await page.locator('.benefit-card').count()===3,'Three opportunities are available before entering 3D');
 check(await readableGuide(page),'Opportunity labels and caveats meet 4.5:1 text contrast on their actual background');
 await page.locator('.benefit-card details summary').first().click();
 check(await page.locator('.benefit-card details[open]').count()===1,'Pitfalls use native keyboard-accessible disclosure');
 await page.screenshot({path:out+'/desktop-opportunities.png'});
 await page.locator('#about-law').click();check(await page.locator('.guide-duty').count()===6,'The legal guide contains six separate duties');
 check((await page.locator('#dialog-body').innerText()).includes('ikke automatisk alle private'),'Legal scope is visible before individual duties');
 await page.locator('#krav-journal>summary').click();
 check((await page.locator('#krav-journal').innerText()).includes('§ 14 tredje ledd'),'The current journal exception for access requests is explicit');
 check(await readableGuide(page),'Legal labels, source types and caveats meet 4.5:1 text contrast');
 const links=await page.locator('.guide-references a').evaluateAll(nodes=>nodes.map(a=>({url:a.href,target:a.target,rel:a.rel})));
 check(links.length>6&&links.every(a=>a.url.startsWith('https://')&&a.target==='_blank'&&a.rel.includes('noopener')),'Sources are explicit and external links are safe');
 await page.screenshot({path:out+'/desktop-law.png'});await page.keyboard.press('Escape');
 check(await focusIs(page,'#about'),'Closing a nested guide restores focus to the original trigger');
 await page.locator('#enter').click();await page.waitForFunction(()=>Math.abs(window.museumDiagnostics().position[2]-1)<.001);
 check(await page.locator('#story').isHidden(),'Leader-focused content does not interrupt free hall entry');
 await page.screenshot({path:out+'/desktop-hall.png'});
 await page.locator('#continue-journey').click();await page.locator('#case-image').click();
 check(await page.locator('.expanded-photo img').isVisible(),'The original case image can be inspected without starting an exercise');
 check(await page.locator('#dialog-body .source a').count()===1,'Image inspection also exposes the documentary source');
 await page.screenshot({path:out+'/desktop-evidence.png'});await page.locator('#dialog-close').click();
 check(await focusIs(page,'#case-image'),'Image inspection returns keyboard focus to its trigger');
 for(const id of ['osen','tokke','innsyn','hanekleiv','npe']){
  check((await page.locator('#story-content').innerText()).length>0,id+': the real story remains first');
  await page.locator('[data-step="4"]').click();
  check(await page.locator('.case-leader-lens dt').count()===2,id+': opportunity and risk are both present');
  check((await page.locator('.case-leader-lens').innerText()).includes('Ikke nye funn'),'Interpretations cannot be mistaken for additional historical findings: '+id);
  await page.locator('#case-law').click();check(await page.locator('.guide-duty[open]').count()===1,id+': the related legal topic is pre-opened');
  await page.locator('#dialog-close').click();check(await focusIs(page,'#case-law'),id+': legal reading restores focus');
  if(id==='tokke'){
   await page.screenshot({path:out+'/desktop-case-lens.png'});
   await page.locator('#case-order').click();check(await page.locator('[data-plan="tokke"]').isChecked(),'A case action can be selected without any completed quiz');
   check((await page.locator('#passport-open').innerText()).includes('0/5'),'Selecting a real action does not award fictional learning badges');
   check(await page.locator('#calendar-plan').isDisabled(),'Calendar export requires a selected action with a date');
   check(await readableGuide(page,'#plan-storage,#calendar-help'),'Calendar and storage explanations meet 4.5:1 text contrast on paper');
   await page.locator('[data-owner="tokke"]').fill('Systemeier');await page.locator('[data-due="tokke"]').fill('2026-10-15');
   const downloadEvent=page.waitForEvent('download');await page.locator('#download-plan').click();const download=await downloadEvent;
   const downloaded=await readFile(await download.path(),'utf8');
   check(downloaded.includes('Systemeier')&&downloaded.includes('2026-10-15')&&downloaded.includes('lesbarhet'),'The exported order contains the selected action, role, date and required evidence');
   check(await page.locator('#calendar-plan').isEnabled(),'Adding a follow-up date enables calendar export');
   const calendarEvent=page.waitForEvent('download');await page.locator('#calendar-plan').click();const calendarFile=await calendarEvent;
   const calendar=(await readFile(await calendarFile.path(),'utf8')).replace(/\r\n /g,'');
   check(calendarFile.suggestedFilename()==='Arkivmuseet-oppfolging.ics','Calendar download has the expected extension');
   check((calendar.match(/BEGIN:VEVENT/g)||[]).length===1&&calendar.includes('DTSTART;VALUE=DATE:20261015'),'Only the selected action is exported, on the selected date');
   check(calendar.includes('Systemeier')&&calendar.includes('lesbarhet')&&!/ATTENDEE|VALARM|METHOD:REQUEST/.test(calendar),'The calendar carries the role and evidence without invitations or alarms');
   check((await page.locator('#plan-status').innerText()).includes('Ingen kalender er endret automatisk'),'The UI does not misrepresent a download as a calendar integration');
   await page.screenshot({path:out+'/desktop-order.png'});await page.locator('#dialog-close').click();
  }
  await page.locator('#next-exhibition').click();
 }
 check(await page.locator('#leader-plan').isVisible(),'The full case route reaches the practical ending without quizzes');
 check((await page.locator('#leader-extras').getAttribute('open'))===null,'Extra fictional choices remain optional');
 await page.screenshot({path:out+'/desktop-ending.png'});
 await page.locator('#leader-law').click();check(await page.locator('.guide-duty').count()===6,'Leader room opens an explanatory guide, not merely a list of URLs');
 await page.locator('#dialog-close').click();await page.close();

 for(const [width,height,scale] of [[320,568,1.3],[390,760,1],[430,932,1],[844,390,1]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const p=await context.newPage();observe(p);await p.goto(url);await p.locator('#about').click();
  await p.evaluate(scale=>document.documentElement.style.setProperty('--text-scale',String(scale)),scale);
  check(await fits(p),`${width}×${height}, text ${scale}: opportunity guide and background fit the device layout viewport`);
  await p.locator('#about-law').click();await p.locator('#krav-control>summary').click();
  check(await fits(p),`${width}×${height}, text ${scale}: expanded legal content remains readable`);
  await p.locator('#krav-control').scrollIntoViewIfNeeded();
  check(await closeIsReachable(p),`${width}×${height}, text ${scale}: the close button stays directly touchable after scrolling`);
  await p.screenshot({path:out+`/mobile-law-${width}.png`});
  await p.locator('#dialog-close').click();await p.locator('#flat-enter').click();await p.locator('[data-step="4"]').click();
  check(await fits(p),`${width}×${height}: case leadership view has no horizontal overflow`);
  if(width===390)await p.screenshot({path:out+'/mobile-case-lens.png'});
  await p.locator('#case-order').click();check(await p.locator('[data-plan="osen"]').isChecked(),`${width}×${height}: case-to-action route works by touch`);
  check(await p.locator('#calendar-plan').isDisabled(),`${width}×${height}: an undated action cannot create a calendar event`);
  check(await readableGuide(p,'#plan-storage,#calendar-help'),`${width}×${height}: calendar and privacy instructions have readable contrast`);
  await p.locator('[data-due="osen"]').fill('2026-10-20');
  check(await p.locator('#calendar-plan').isEnabled(),`${width}×${height}: dated action enables calendar export by touch`);
  await p.locator('#calendar-plan').scrollIntoViewIfNeeded();
  check(await fits(p),`${width}×${height}: calendar controls and explanation fit the phone`);
  await context.close();
 }
 // No-JavaScript route: actual browser interaction, not just HTML string inspection.
 const textContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:760}});
 const text=await textContext.newPage();await text.goto(url+'leder.html');
 check(await text.locator('.benefit-card').count()===3&&await text.locator('.guide-duty').count()===6,'All opportunities and legal duties work with JavaScript disabled');
 await text.locator('#krav-retention>summary').click();check(await text.locator('#krav-retention .duty-content').isVisible(),'Native legal disclosures work without JavaScript');
 check(await fits(text),'The no-JavaScript route fits a phone');
 await text.locator('#krav').scrollIntoViewIfNeeded();await text.screenshot({path:out+'/mobile-text-guide.png'});
 await text.goto(url+'tekst.html');check(await text.locator('.case-leader-lens').count()===5,'All five leadership lenses also appear in the full no-JavaScript exhibition');
 check(await text.locator('#leder details').count()===8,'Existing static scenario alternatives are retained');await textContext.close();
 // Simulate an unavailable graphics API and unavailable storage explicitly.
 const fallback=await browser.newContext({viewport:{width:390,height:760},reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{
  const get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:get.call(this,type,...args);};
  Storage.prototype.getItem=function(){throw new DOMException('Storage unavailable','SecurityError');};
  Storage.prototype.setItem=function(){throw new DOMException('Storage unavailable','SecurityError');};
 });
 const flat=await fallback.newPage();await flat.goto(url);await flat.locator('#flat-enter').click();await flat.locator('[data-step="4"]').click();
 await flat.locator('#case-order').click();
 check(await flat.locator('[data-plan="osen"]').isChecked(),'Action selection works with both WebGL and storage unavailable');
 check((await flat.locator('#plan-storage').innerText()).includes('ikke tilgjengelig'),'Unavailable storage is explained rather than silently promising persistence');
 await flat.locator('#dialog-close').click();await flat.locator('#case-law').click();check(await flat.locator('.guide-duty').count()===6,'The legal guide remains usable after graphics failure');await fallback.close();

 // Serve the actual compiled dist at the renamed repository path, without SPA fallbacks.
 const dist=resolve('dist'),prefix='/Click-here-for-newest-projects/arkivmuseet/';
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.glb':'model/gltf-binary','.wasm':'application/wasm'};
 mountServer=createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const suffix=pathname.slice(prefix.length)||'index.html',file=resolve(dist,suffix);
  if(!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(content);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>mountServer.listen(0,'127.0.0.1',r));
 const alternate=`http://127.0.0.1:${mountServer.address().port}${prefix}`;
 const relocated=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),relocationMissing=[];
 relocated.on('response',r=>{if(r.status()>=400)relocationMissing.push(r.url());});observe(relocated);
 await relocated.goto(alternate);await relocated.waitForFunction(()=>!document.querySelector('#enter').disabled);
 check((await relocated.evaluate(()=>window.museumDiagnostics().triangles))>30000,'The same build renders the real museum beneath the renamed repository path');
 await relocated.locator('#enter').click();await relocated.locator('#continue-journey').click();
 await relocated.waitForFunction(()=>document.querySelector('.case-photo img')?.complete&&document.querySelector('.case-photo img').naturalWidth>0);
 check(relocationMissing.length===0,'Renamed-path JavaScript, CSS, 3D assets and case images all load without redirects');
 await relocated.goto(alternate+'leder.html');check(await relocated.locator('.benefit-card').count()===3,'The relative static guide also works under the renamed path');
 check(relocationMissing.length===0,'The relocated static guide has no missing stylesheet');await relocated.close();
 check(errors.length===0,'No unexpected JavaScript errors in the normal leadership journeys');
 check(missing.length===0,'No missing application assets in the normal leadership journeys');
 await writeFile(out+'/results.json',JSON.stringify({checked:new Date().toISOString(),passed:log.length,log,errors,missing,physicalDeviceTesting:false},null,2));
 console.log(JSON.stringify({passed:log.length,errors,missing}));
}catch(error){
 await writeFile(out+'/failure.json',JSON.stringify({error:String(error),log,errors,missing},null,2));
 let i=0;for(const context of browser.contexts())for(const page of context.pages()){
  const n=++i;
  await writeFile(out+`/failure-viewport-${n}.json`,JSON.stringify(await page.evaluate(()=>({innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,viewport:window.visualViewport?{x:visualViewport.offsetLeft,y:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null})),null,2)).catch(()=>{});
  await page.screenshot({path:out+`/failure-${n}.png`,timeout:5000}).catch(()=>{});
 }
 throw error;
}finally{await browser.close();if(mountServer)await new Promise(r=>mountServer.close(r));}
