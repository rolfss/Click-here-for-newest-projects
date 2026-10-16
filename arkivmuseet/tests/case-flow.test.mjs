import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import flow from '../cases/leadership-flow.json' with {type:'json'};
import {flowFor,flowBoundary,stageNames,renderCaseStep,renderLeaderSummary} from '../src/case-flow.mjs';
const expected=['osen','tokke','innsyn','hanekleiv','npe'];
function fixture(id='osen'){
 const sourceId=flowFor(id).sourceId;
 const claim=text=>({text,sourceIds:[sourceId],locator:'Side 1',kind:'fact'});
 return {id,organization:'Testorgan',sources:[{id:sourceId,institution:'Testkilde',url:'https://example.org/source'}],shortNarrative:claim('Hendelsen'),documentedFacts:[claim('Funn én'),claim('Funn to')],consequence:[claim('Avgrenset konsekvens')],authorityFindings:[claim('Myndighetens funn')]};
}
test('Fem ulike lederforløp dekker den eksisterende museumsruten',()=>{
 assert.deepEqual(flow.cases.map(c=>c.id),expected);
 assert.equal(new Set(flow.cases.map(c=>c.leaderConsequence)).size,5);
 for(const c of flow.cases){assert.equal(c.kind,'interpretation');for(const key of ['theme','question','opening','control','leaderConsequence','response','action','proof','reflection','bridge','sourceId','locator'])assert.ok(c[key]?.trim(),`${c.id}.${key}`);}
});
test('Fem fortellingsdeler beholder historiske funn foran ledertolkningen',()=>{
 assert.equal(stageNames.length,5);
 for(const id of expected){const c=fixture(id);for(let i=0;i<5;i++)assert.ok(renderCaseStep(c,i).includes('Grunnlag:'));
 const html=renderCaseStep(c,2);assert.ok(html.indexOf('Avgrenset konsekvens')<html.indexOf(flowFor(id).leaderConsequence));assert.match(html,/Mulig følge, ikke dokumentert hendelsesforløp/);}
});
test('Alle kildefunn vises, ikke bare første element',()=>{const html=renderCaseStep(fixture(),1);assert.ok(html.includes('Funn én'));assert.ok(html.includes('Funn to'));});
test('Ukjente saker, manglende kilder og ugyldige trinn avvises',()=>{
 assert.throws(()=>flowFor('ukjent'));
 for(const n of [-1,5,1.5,NaN])assert.throws(()=>renderCaseStep(fixture(),n),RangeError);
 const c=fixture();c.sources=[];assert.throws(()=>renderCaseStep(c,0),/Mangler kilde/);
});
test('Kildelenker er sikre og tekst blir HTML-escapet',()=>{
 const c=fixture();c.shortNarrative.text='<script>alert("x")</script>';const html=renderCaseStep(c,0);
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test('Avslutningen samler fem lederoppgaver uten krav om øvelser',()=>{
 const html=renderLeaderSummary(expected.map(id=>fixture(id)));assert.equal((html.match(/<dt>/g)||[]).length,5);
 assert.ok(html.includes(flowBoundary));assert.match(flowBoundary,/ikke personlige sanksjoner/);
});
test('App og tekstgenerator bruker samme kapitler og ledertekst',()=>{
 for(const file of ['src/main.ts','scripts/make-text-version.mjs']){const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(text.includes('renderCaseStep(c,'));assert.ok(text.includes('renderLeaderSummary(cases)'));assert.ok(text.includes('stageNames'));}
});
test('Datakobling: ledertolkninger peker på primærkilder i virkelige saker',()=>{
 const cases=JSON.parse(readFileSync(new URL('../cases/cases.json',import.meta.url),'utf8'));
 assert.deepEqual(cases.map(c=>c.id),expected);
 for(const c of cases){const f=flowFor(c.id);assert.ok(c.sources.some(s=>s.id===f.sourceId&&s.type==='primary'));for(let i=0;i<5;i++)assert.ok(renderCaseStep(c,i).length>100);}
 const npe=cases.find(c=>c.id==='npe'),tokke=cases.find(c=>c.id==='tokke'),tunnel=cases.find(c=>c.id==='hanekleiv');
 assert.ok(renderCaseStep(npe,2).includes('Rapporten dokumenterer ikke feil i erstatningsvedtak'));
 assert.ok(renderCaseStep(tokke,2).includes('Rapporten fastslår ikke at alt innhold var tapt'));
 assert.ok(renderCaseStep(tunnel,2).includes('fastslår ikke at arkivtap alene utløste raset'));
});
