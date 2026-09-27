import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const url=process.env.MUSEUM_URL||'http://127.0.0.1:4196/';
const out=process.env.MUSEUM_QA_DIR||'qa-learning';await mkdir(out,{recursive:true});
const missions=JSON.parse(await readFile(new URL('../cases/missions.json',import.meta.url)));
const investigation=JSON.parse(await readFile(new URL('../cases/investigation.json',import.meta.url)));
const checks=[],errors=[],missing=[];
let entryScript='';
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
const browser=await chromium.launch({executablePath:process.env.MUSEUM_CHROME||undefined,
 headless:process.env.MUSEUM_HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('arkivmuseet-journey-v1')));
const action=(page,name,value)=>page.locator(`[data-c17="${name}"]${value===undefined?'':`[data-value="${value}"]`}`).first();
async function observe(page){
 page.on('pageerror',error=>errors.push(error.stack||error.message));
 page.on('response',response=>{if(response.url().startsWith(url)&&response.status()>=400)missing.push(response.url());});
 page.setDefaultTimeout(15000);
}
async function enter(page){await page.goto(url);await page.locator('#flat-enter').click();await expect(page.locator('#story')).toBeVisible();}
async function closeDialog(page){if(await page.locator('#dialog').isVisible())await page.locator('#dialog-close').click();}
async function mission(page,id){await closeDialog(page);await page.locator('#passport-open').click();await page.locator(`[data-passport="${id}"]`).click();await expect(page.locator('#mission-title')).toBeVisible();}
async function evidence(page,m){for(const clue of m.clues)await page.locator(`[data-clue="${clue.id}"]`).setChecked(clue.relevant);await page.locator('#check-evidence').click();await expect(page.locator('[data-decision]')).toHaveCount(3);}
async function branch(page,choice){await page.locator(`[data-decision="${choice}"]`).click();await page.locator('#advance-time').click();await page.locator('#advance-time').click();await expect(page.locator('#finish-mission')).toBeVisible();}
async function download(page,locator){const pending=page.waitForEvent('download');await locator.click();const file=await pending;return readFile(await file.path(),'utf8');}
async function profile(page){await closeDialog(page);await page.locator('#passport-open').click();await expect(page.locator('.learning-profile')).toBeVisible();await expect(page.locator('#dialog-title')).toBeFocused();assert.ok(await page.locator('#dialog').evaluate(dialog=>dialog.scrollTop<=1),'A newly opened profile starts at the heading');}

try{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce',acceptDownloads:true});await observe(page);await enter(page);
 entryScript=await page.locator('script[type="module"][src]').first().getAttribute('src');
 await profile(page);await expect(page.locator('.learning-profile>.lead')).toHaveText('Ingen ledervalg er vurdert ennå');
 await expect(page.locator('.learning-results>details')).toHaveCount(5);pass('Unplayed missions are unassessed, not scored as failed or completed');
 const first=missions[0],partial=first.options.findIndex(o=>!o.protected&&o.assessment.decision+o.assessment.followUp>0);
 assert.ok(partial>=0,'A meaningful partial leader choice exists');
 const partialValue=2+first.options[partial].assessment.decision+first.options[partial].assessment.followUp;
 await mission(page,first.id);await expect(page.locator('.learning-goal')).toContainText(first.learningGoal);
 await page.locator('.case-context>summary').click();await expect(page.locator('.case-context')).toContainText(first.historicalBoundary);
 await page.locator('#mission-read').click();await expect(page.locator('#case-sources')).toBeVisible();await page.locator('#return-mission').click();
 pass('An exercise explains its learning goal and historical boundary while keeping the sourced exhibition accessible');
 for(const clue of first.clues)await page.locator(`[data-clue="${clue.id}"]`).check();
 await page.locator('#check-evidence').click();await expect(page.locator('#evidence-feedback')).toContainText('Velg akkurat to');
 assert.equal((await stored(page)).attempts[first.id].firstReview,null);await expect(page.locator('[data-decision]')).toHaveCount(0);
 await evidence(page,first);assert.deepEqual((await stored(page)).attempts[first.id].firstEvidence,first.clues.map(c=>c.id));
 pass('Selecting every clue cannot pass; correcting evidence preserves the genuine first attempt');
 await page.locator(`[data-decision="${partial}"]`).click();await page.locator('#advance-time').click();
 assert.equal((await stored(page)).attempts[first.id].latestReview,null);
 await page.locator('#advance-time').click();await expect(page.locator('.learning-feedback')).toContainText(`${partialValue} av 6 poeng`);
 await page.locator('.learning-feedback').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/learning-debrief-desktop.png',fullPage:true});
 const firstReview=(await stored(page)).attempts[first.id].firstReview;assert.equal(firstReview.choice,partial);assert.deepEqual(firstReview.selected,first.clues.map(c=>c.id));
 pass('A complete partial branch earns transparent partial feedback; opening or half-reading it earns no review');
 const beforeCompare=await stored(page);await page.locator('#compare-paths').click();await expect(page.locator('.path-comparison>section')).toHaveCount(3);
 for(const option of first.options)await expect(page.locator('.path-comparison')).toContainText(option.assessment.nextStep);
 await page.screenshot({path:out+'/learning-comparison-desktop.png',fullPage:true});
 await closeDialog(page);assert.deepEqual(await stored(page),beforeCompare);pass('All three branches can be compared without changing answers or farming points');
 await page.locator('#finish-mission').click();assert.equal((await stored(page)).attempts[first.id].completed,false);
 await branch(page,first.options.findIndex(o=>o.protected));await page.locator('#finish-mission').click();
 await expect(page.locator('.mission-earned')).toBeVisible();await expect(page.locator('#passport-open')).toHaveText('Øvelser 1/5');
 assert.deepEqual((await stored(page)).attempts[first.id].firstReview,firstReview);
 pass('Improving the leader decision earns one badge and replaces the latest score while preserving first feedback');
 for(const m of missions.slice(1)){
  await mission(page,m.id);await evidence(page,m);await branch(page,m.options.findIndex(o=>o.protected));await page.locator('#finish-mission').click();
  await expect(page.locator('.mission-earned')).toBeVisible();
  const a=(await stored(page)).attempts[m.id];assert.equal(a.completed,true);assert.deepEqual(a.latestReview,a.completedReview);
  pass(`${m.id}: evidence, all three consequences, rubric and earned completion work through the UI`);
 }
 await expect(page.locator('#passport-open')).toHaveText('Øvelser 5/5');await profile(page);
 await expect(page.locator('.learning-profile>.lead')).toHaveText('30 av 30 mulige poeng i vurderte øvelser');
 const expectedFirst=first.options[partial].assessment.decision+first.options[partial].assessment.followUp+24;
 await expect(page.locator('.learning-profile')).toContainText(`Første gjennomgang: ${expectedFirst} av 30 poeng`);
 await page.screenshot({path:out+'/learning-profile-desktop.png',fullPage:true});
 pass('The final profile distinguishes first learning from the latest maximum score with an explicit denominator');
 await mission(page,first.id);await page.locator('#replay-mission').click();await branch(page,partial);
 await expect(page.locator('#passport-open')).toHaveText('Øvelser 5/5');await profile(page);
 await expect(page.locator('.learning-profile>.lead')).toHaveText(`${24+partialValue} av 30 mulige poeng i vurderte øvelser`);
 pass('A weaker replay changes current feedback while keeping the previously earned badge');
 await page.reload();await page.locator('#flat-enter').click();await profile(page);
 await expect(page.locator('#passport-open')).toHaveText('Øvelser 5/5');await expect(page.locator('.learning-profile>.lead')).toHaveText(`${24+partialValue} av 30 mulige poeng i vurderte øvelser`);
 assert.deepEqual((await stored(page)).attempts[first.id].firstReview,firstReview);
 await mission(page,first.id);await page.locator('#finish-mission').click();await branch(page,first.options.findIndex(o=>o.protected));await page.locator('#finish-mission').click();
 await profile(page);await expect(page.locator('.learning-profile>.lead')).toHaveText('30 av 30 mulige poeng i vurderte øvelser');
 pass('Reload preserves replay, scores and first evidence; improvement never adds a duplicate badge or exceeds30');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:900});await page.locator('.learning-results>details').first().locator('summary').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: no page overflow`);
  const panel=await page.locator('#dialog').boundingBox();assert.ok(panel.x>=-1&&panel.x+panel.width<=width+1);
  await page.locator('#dialog').evaluate(dialog=>{dialog.scrollTop=0;});
  await page.screenshot({path:`${out}/learning-profile-${width}.png`,fullPage:true});pass(`${width}px learning profile and rubric remain inside the viewport`);
 }
 await page.setViewportSize({width:1440,height:960});await closeDialog(page);await mission(page,missions.at(-1).id);await page.locator('#next-mission').click();
 await expect(page.locator('#leader-profile')).toBeVisible();await page.locator('#leader-profile').click();await expect(page.locator('.learning-profile')).toBeVisible();await closeDialog(page);
 await page.locator('#leader-extras>summary').click();await page.locator('[data-choice="0"]').focus();await page.keyboard.press('Space');await expect(page.locator('[data-choice="0"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#leader-next').focus();await page.keyboard.press('Enter');await expect(page.locator('#leader-scenario-title')).toBeFocused();await expect(page.locator('.scenario>.eyebrow')).toContainText('VALG 2');
 pass('Reopened profiles focus their heading at the top and keyboard scenario navigation focuses the next question');
 await page.locator('#leader-plan').click();await page.locator(`[data-plan="${first.id}"]`).check();await page.locator(`[data-owner="${first.id}"]`).fill('Systemeier');await page.locator(`[data-due="${first.id}"]`).fill('2026-10-15');
 await page.locator(`[data-plan="${missions.at(-1).id}"]`).check();
 const order=await download(page,page.locator('#download-plan'));assert.ok(order.includes(first.action)&&order.includes(first.proof));assert.ok(order.includes('Systemeier')&&order.includes('2026-10-15'));assert.ok(!order.includes(missions[1].action));
 const savedPlan=(await stored(page)).plan;await page.reload();await page.locator('#flat-enter').click();await page.locator('#leader-plan').click();
 await expect(page.locator(`[data-owner="${first.id}"]`)).toHaveValue('Systemeier');assert.deepEqual((await stored(page)).plan,savedPlan);
 pass('Leader ending connects to the profile and exports only selected actions with owner, follow-up and required evidence');
 await closeDialog(page);await page.locator('#story-close').click();

 // The independent fictional case must not turn participation into a positive leadership outcome.
 await page.locator('#menu-open').click();await page.locator('#menu-investigation').click();await action(page,'start').click();
 for(const room of investigation.rooms){await action(page,'room',room.id).click();for(const clue of investigation.evidence.filter(e=>e.room===room.id)){await action(page,'evidence',clue.id).click();await action(page,'collect',clue.id).click();}await action(page,'board').click();}
 await action(page,'triage').click();for(const card of investigation.triage){await action(page,'classify',card.answer).click();await action(page,'triage-next').click();}
 for(const card of investigation.access){await action(page,'disclose',card.answer).click();if(card.answer==='redact'){
  const redaction=action(page,'redaction',card.id),visibleText=await redaction.innerText();
  await expect(redaction).toHaveAttribute('aria-label',`Marker for sladding: ${visibleText}`);
  await redaction.focus();await page.keyboard.press('Space');await expect(action(page,'redaction',card.id)).toHaveAttribute('aria-pressed','true');
 }await action(page,'access-next').click();}
 pass('Visible sensitive text is included in the accessible redaction name and can be redacted with the keyboard');
 for(let i=0;i<6;i++){await action(page,'decision','0').click();await action(page,'crisis-next').click();}
 await action(page,'conclude','1').click();
 const unsafe=await page.evaluate(()=>window.museumCaseDiagnostics().summary);
 assert.equal(unsafe.complete,true);assert.equal(unsafe.responsibleOutcome,false);assert.equal(unsafe.protectedDecisions,0);
 await expect(page.locator('#case17-focus>h3')).toHaveText('Undersøkelsen er ferdig. Ledergrep gjenstår.');
 await expect(page.locator('.case17-lead')).toContainText('0 av 6');await expect(page.locator('.case17-complete')).toContainText('ikke at alle ledervalg er gode');
 const report=await download(page,action(page,'report'));assert.match(report,/0\/6 prøvde valg/);assert.match(report,/uavklart oppfølging: 6/);
 await page.screenshot({path:out+'/investigation-unsafe-ending.png',fullPage:true});
 assert.equal((await stored(page)).attempts[first.id].completed,true);assert.deepEqual((await stored(page)).plan,savedPlan);
 pass('All-unsafe Aurora completion is honestly labelled, exported with unresolved choices and independent of the museum badges');
 await action(page,'board').click();await action(page,'crisis').click();for(let i=0;i<6;i++){await action(page,'decision','1').click();await action(page,'crisis-next').click();}
 assert.equal((await page.evaluate(()=>window.museumCaseDiagnostics().summary)).responsibleOutcome,true);
 await expect(page.locator('#case17-focus>h3')).toHaveText('Du har lagt et etterprøvbart grunnlag.');
 pass('Reconsidering all six fictional leader choices changes the outcome without restarting the investigation');
 await page.close();
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);pass('Learning and scoring flows produce no browser exceptions or missing resources');
 await writeFile(out+'/results.json',JSON.stringify({checked:new Date().toISOString(),entryScript,passed:checks.length,checks,errors,missing},null,2));
 console.log(JSON.stringify({passed:checks.length,errors,missing}));
}catch(error){
 await writeFile(out+'/failure.json',JSON.stringify({message:String(error),entryScript,checks,errors,missing},null,2));
 let index=0;for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`${out}/failure-${++index}.png`,fullPage:true,timeout:5000}).catch(()=>{});
 throw error;
}finally{await browser.close();}
