import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {renderBenefits,renderCaseLens,renderLegalGuide,guideReferences,validateLeaderGuide} from '../src/leader-guide.ts';
import {emptyJourney,selectPlanItem,planText,restoreJourney} from '../src/journey-state.ts';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const guide=JSON.parse(read('cases/leader-guide.json'));
const cases=JSON.parse(read('cases/cases.json'));
const missions=JSON.parse(read('cases/missions.json'));
const ids=cases.map(c=>c.id);

test('Leadership material has three opportunities, five case lenses and six sourced duties',()=>{
 assert.equal(validateLeaderGuide(guide,ids),true);
 assert.equal(guide.benefits.length,3);assert.equal(guide.duties.length,6);
 assert.deepEqual(guide.lenses.map(l=>l.caseId),ids);
});
test('All duties and benefits carry resolvable primary-source or official-guidance references',()=>{
 for(const part of [...guide.benefits,...guide.duties]){
  assert.ok(part.sourceIds.length>0);assert.match(guideReferences(guide,part.sourceIds),/https:\/\//);
 }
 const broken=structuredClone(guide);broken.duties[0].sourceIds=['invented'];
 assert.throws(()=>validateLeaderGuide(broken,ids),/Unknown guide source/);
});
test('Missing provenance, duplicate entries and missing case coverage block generation',()=>{
 const a=structuredClone(guide);a.duties[0].sourceIds=[];assert.throws(()=>validateLeaderGuide(a,ids),/provenance/);
 const b=structuredClone(guide);b.lenses.pop();assert.throws(()=>validateLeaderGuide(b,ids),/exactly one/);
 const c=structuredClone(guide);c.sources.push(c.sources[0]);assert.throws(()=>validateLeaderGuide(c,ids),/Duplicate/);
 const d=structuredClone(guide);d.lenses[0].dutyId='unknown';assert.throws(()=>validateLeaderGuide(d,ids),/Unknown case or duty/);
 const e=structuredClone(guide);e.scope='';assert.throws(()=>validateLeaderGuide(e,ids),/Missing guide context/);
});
test('Scope, commencement, municipal distinction and journal exceptions remain explicit',()=>{
 assert.match(guide.scope,/ikke automatisk alle private/);
 assert.match(guide.commencement,/§ 11.*særskilt ikraftsetting/);
 assert.match(guide.duties.find(d=>d.id==='control').requirement,/kommuneloven § 25-1/);
 assert.match(guide.duties.find(d=>d.id==='journal').distinction,/§ 14 tredje ledd/);
 assert.match(guide.duties.find(d=>d.id==='access').requirement,/ikke i taushetsbelagte/);
 assert.match(guide.boundary,/Historiske funn vurderes etter datidens regler/);
});
test('Guide rendering escapes editorial text and rejects non-HTTPS source schemes',()=>{
 const g=structuredClone(guide);g.benefits[0].title='<img src=x onerror=alert(1)>';
 assert.doesNotMatch(renderBenefits(g),/<img src=x/);assert.match(renderBenefits(g),/&lt;img/);
 g.sources[0].url='javascript:alert(1)';assert.throws(()=>validateLeaderGuide(g,ids),/HTTPS/);
 assert.doesNotMatch(renderCaseLens({...guide.lenses[0],question:'<script>x</script>'}),/<script>/);
});
test('A contextual legal view opens only the relevant requirement',()=>{
 const html=renderLegalGuide(guide,'systems');
 assert.match(html,/id="krav-systems" open/);
 assert.equal((html.match(/class="guide-duty"[^>]+ open/g)||[]).length,1);
 assert.equal((html.match(/class="guide-duty"/g)||[]).length,6);
 assert.match(html,/MUSEETS FORSLAG TIL LEDERGREP/);
 assert.match(html,/RETTSLIG HOVEDTREKK/);
});
test('Selecting a case action requires no completed quiz and leaves exercise state untouched',()=>{
 const s=emptyJourney();const before=structuredClone(s.attempts);
 assert.equal(selectPlanItem(s,missions,'tokke'),true);
 assert.equal(s.plan.tokke.selected,true);assert.deepEqual(s.attempts,before);
 assert.match(planText(missions,s),/prøve av gjenfinning/);
 assert.equal(restoreJourney(JSON.stringify(s),missions).plan.tokke.selected,true);
});
test('Selecting the same action preserves role and date; unknown IDs are inert',()=>{
 const s=emptyJourney();s.plan.osen={selected:false,owner:'Arkivleder',due:'2026-10-15'};
 selectPlanItem(s,missions,'osen');selectPlanItem(s,missions,'osen');
 assert.deepEqual(s.plan.osen,{selected:true,owner:'Arkivleder',due:'2026-10-15'});
 const before=structuredClone(s);assert.equal(selectPlanItem(s,missions,'__proto__'),false);
 assert.deepEqual(s,before);
});
test('The generated leader route needs no scripts and uses the same legal and benefit renderer',()=>{
 execFileSync(process.execPath,['--experimental-strip-types','scripts/make-leader-version.mjs'],{cwd:root});
 const html=read('public/leder.html');assert.doesNotMatch(html,/<script\b|<canvas\b/i);
 assert.ok(html.includes(renderBenefits(guide)));assert.ok(html.includes(renderLegalGuide(guide)));
 for(const id of ids)assert.ok(html.includes(`./tekst.html#${id}`));
 assert.equal(read('public/leader-guide.css'),read('src/leader-guide.css'));
});
test('Full-text generator and browser use the same case-lens and legal presentation',()=>{
 const generator=read('scripts/make-text-version.mjs');const app=read('src/main.ts');
 for(const name of ['renderCaseLens','renderLegalGuide']){assert.ok(generator.includes(name));assert.ok(app.includes(name));}
 // pnpm content regenerates these pages before tests, development and production builds.
 const text=read('public/tekst.html');
 for(const lens of guide.lenses)assert.ok(text.includes(renderCaseLens(lens)));
 assert.ok(text.includes(renderLegalGuide(guide)));
});
test('The compiled-site base is relative and every preview test uses the local root',()=>{
 assert.match(read('vite.config.ts'),/base:'\.\/'/);
 assert.doesNotMatch(JSON.parse(read('package.json')).scripts.preview,/--base/);
 for(const script of ['verify-browser.mjs','verify-investigation.mjs','verify-visit-ui.mjs','verify-leadership.mjs']) assert.match(read('scripts/'+script),/127\.0\.0\.1:4196\/['"]/);
});
