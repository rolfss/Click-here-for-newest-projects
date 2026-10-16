import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import questions from '../cases/score-questions.json' with {type:'json'};
const url=process.env.MUSEUM_URL||'http://127.0.0.1:4196/';
const out='qa-visit';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MUSEUM_CHROME||undefined,headless:process.env.MUSEUM_HEADED!=='1',args:['--enable-webgl','--ignore-gpu-blocklist']});
const key='arkivmuseet-top3-v1',checks=[],errors=[];
const check=(v,s)=>{assert.ok(v,s);checks.push(s);console.log('PASS: '+s);};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('[data-score-open]').first().click();
 check(!await page.locator('#score-consent').isChecked(),'Consent defaults to unchecked');
 await page.locator('#score-name').fill('No consent');await page.locator('#score-entry button[type=submit]').click();
 check((await page.locator('#score-error').innerText()).includes('samtykke'),'Named entry requires consent');
 async function play(name,correct=10,anonymous=false){
  await page.locator('#score-name').fill(name);if(anonymous)await page.locator('#score-anonymous').click();else{await page.locator('#score-consent').check();await page.locator('#score-entry button[type=submit]').click();}
  const before=await page.evaluate(k=>localStorage.getItem(k),key);check(!before?.includes(name)||!name,'Name is not persisted at entry');
  for(const [i,q] of questions.entries()){
   const value=i<correct?q.correct:(q.correct+1)%q.options.length;
   await page.locator(`input[name=score-answer][value="${value}"]`).check();await page.locator('#score-question button[type=submit]').click();
   if(i===0){check(await page.locator('#score-question').count()===0,'Confirmed answer cannot be resubmitted');check(await page.locator('.score-panel a[target="_blank"]').count()===1,'Feedback links to the primary source');}
   await page.locator('#score-next').click();
  }
  check((await page.locator('#dialog-title').innerText()).includes(`${correct*10}/100`),'Displayed score matches first answers');
 }
 await play('Test <b>Ada</b>',10);check((await page.locator('#score-result').innerText()).includes('1. plass'),'First winner saves');
 await page.locator('#score-new').click();await play('Bo',8);
 await page.locator('#score-new').click();await play('Cia',6);
 await page.locator('#score-new').click();await play('Never saved',1);check((await page.locator('#score-result').innerText()).includes('ikke lagret'),'Non-qualifier is not stored');
 await page.locator('#score-result-board').click();check(await page.locator('.score-podium li').count()===3,'Only top three are displayed');check(await page.locator('.score-podium b').count()===0,'Names are text, not HTML');
 check(!await page.evaluate(k=>localStorage.getItem(k).includes('Never saved'),key),'Non-qualifying name absent from all stored results');
 await page.locator('.score-panel summary').click();const exported=await page.locator('#score-export').inputValue();check(exported.includes('Test <b>Ada</b>')&&!exported.includes('Never saved'),'Export uses only the top three');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Test denied clipboard');}}}));await page.locator('#score-copy').click();check((await page.locator('#score-copy-status').innerText()).includes('blokkert'),'Clipboard denial provides a manual copy fallback');
 const downloadPromise=page.waitForEvent('download');await page.locator('#score-download').click();const download=await downloadPromise;check(download.suggestedFilename()==='Arkivmuseet-topp-3.txt','Text download works');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await page.waitForFunction(()=>Math.abs(document.querySelector('#world').getBoundingClientRect().width-innerWidth)<1);await page.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.3'));await page.locator('#dialog').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${out}/top3-${width}.png`});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);check(await page.locator('.score-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Score panel fits at '+width);await page.screenshot({path:`${out}/top3-${width}.png`});}
 const contrast=await page.evaluate(()=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const l=s=>rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const fg=l(getComputedStyle(document.querySelector('.score-panel .caption')).color),bg=l(getComputedStyle(document.querySelector('#dialog')).backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});check(contrast>=4.5,'Help text remains readable against the light dialog');
 await page.locator('#score-board-start').click();check(await page.locator('#dialog').evaluate(e=>e.scrollTop===0),'A new participant starts at the top, not at the prior export position');
 await page.reload();await page.locator('[data-score-open]').first().click();await page.locator('#score-show-board').click();check(await page.locator('.score-podium li').count()===3,'Leaderboard survives reload');
 await page.locator('#score-board-start').click();await play('Anonymous not stored',10,true);check((await page.locator('#score-result').innerText()).includes('Anonym'),'Anonymous play remains private');
 await page.locator('#score-result-board').click();await page.locator('[data-score-remove]').first().click();await page.locator('#score-delete-cancel').click();check(await page.locator('.score-podium li').count()===3,'Delete cancellation preserves list');
 await page.locator('[data-score-remove]').first().click();await page.locator('#score-delete-confirm').click();check(await page.locator('.score-podium li').count()===2,'Single result can be deleted');
 await page.locator('#score-clear').click();await page.locator('#score-delete-confirm').click();check(await page.evaluate(k=>localStorage.getItem(k)===null,key),'Entire leaderboard clears with confirmation');
 await page.locator('#dialog-close').click();await page.locator('#flat-enter').click();await page.locator('#menu-open').click();await page.locator('[data-score-open]').last().click();check(await page.locator('#score-entry').isVisible(),'Scoreboard accessible from museum menu');
 await page.close();
 const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));await blocked.addInitScript(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='arkivmuseet-top3-v1')throw new Error('Blocked test storage');return old.call(this,k,v);};});
 await blocked.goto(url);await blocked.locator('[data-score-open]').first().click();await blocked.locator('#score-name').fill('Not saved');await blocked.locator('#score-consent').check();await blocked.locator('#score-entry button[type=submit]').click();
 for(const q of questions){await blocked.locator(`input[name=score-answer][value="${q.correct}"]`).check();await blocked.locator('#score-question button[type=submit]').click();await blocked.locator('#score-next').click();}
 check((await blocked.locator('#score-result').innerText()).includes('ikke bekreftet lagret'),'Storage failure is visible, never reported as saved');await blocked.close();
 check(errors.length===0,'No JavaScript exceptions');await writeFile(out+'/scoreboard-results.json',JSON.stringify({checked:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
