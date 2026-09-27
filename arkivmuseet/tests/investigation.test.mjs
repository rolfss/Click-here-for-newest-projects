import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {freshCase, restoreCase, collectEvidence, roomEvidence, workSummary, caseReport, CASE_STORAGE} from '../src/investigation-state.ts';
const data = JSON.parse(readFileSync(new URL('../cases/investigation.json', import.meta.url)));
test('All ten clues belong to five rooms, in pairs, and are explicitly fictional', () => {
  assert.equal(data.evidence.length, 10);assert.equal(new Set(data.evidence.map(e => e.id)).size, 10);
  for (const room of data.rooms) assert.equal(data.evidence.filter(e => e.room === room.id).length, 2);
  assert.match(data.fiction, /Fiktiv/);assert.match(data.fiction, /Ikke en rekonstruksjon/);
  for (const e of data.evidence) for (const key of ['title','body','meaning','time','kind']) assert.ok(e[key]);
});
test('Collection is idempotent and rejects unknown clues', () => {
  const s = freshCase();assert.equal(collectEvidence(s, 'e1'), true);assert.equal(collectEvidence(s, 'e1'), false);
  assert.equal(collectEvidence(s, '__proto__'), false);assert.deepEqual(s.found, ['e1']);assert.equal(s.started, true);
  collectEvidence(s, 'e2');assert.equal(roomEvidence(s, 'osen'), 2);assert.equal(roomEvidence(s, 'leader'), 0);
});
test('Malformed, oversize and unknown-version storage reset safely', () => {
  for (const raw of [null, '{', 'null', '[]', '"a"', '{"version":2}', 'x'.repeat(25000)]) assert.deepEqual(restoreCase(raw), freshCase());
});
test('Storage restoration discards unexpected IDs, duplicate evidence and invalid answers', () => {
  const s = restoreCase(JSON.stringify({version:1,started:'yes',secret:1,found:['e1','e1','fake','<script>'],
    triage:{t1:'capture',t7:'capture',t2:'erase'},access:{a2:'redact',a5:'release'},redactions:{a2:'true',a4:true},crisis:[1,-1,'1',false,null,0,1],reconstruction:9}));
  assert.deepEqual(s.found,['e1']);assert.equal(s.started,false);assert.equal(s.secret,false);
  assert.deepEqual(s.triage,{t1:'capture'});assert.deepEqual(s.access,{a2:'redact'});
  assert.deepEqual(s.redactions,{a2:false,a4:true});assert.deepEqual(s.crisis,[1,null,null,null,null,0]);assert.equal(s.reconstruction,null);
});
test('A valid case survives serialization and preserves decisions', () => {
  const s = freshCase();for (const e of data.evidence) collectEvidence(s,e.id);
  s.crisis = [0,1,0,1,1,0];s.reconstruction=1;s.triage.t1='capture';s.redactions={a2:true,a4:false};
  assert.deepEqual(restoreCase(JSON.stringify(s)),s);
});
test('Redaction is an action, not just selecting the redaction answer', () => {
  const s=freshCase();for(const a of data.access)s.access[a.id]=a.answer;
  assert.equal(workSummary(s,data.triage,data.access).disclosed,2);
  s.redactions.a2=true;assert.equal(workSummary(s,data.triage,data.access).disclosed,3);
  s.redactions.a4=true;assert.equal(workSummary(s,data.triage,data.access).disclosed,4);
});
test('Completion requires evidence, casework, six considered decisions and a supported conclusion', () => {
  const s=freshCase();for(const e of data.evidence)collectEvidence(s,e.id);
  for(const t of data.triage)s.triage[t.id]=t.answer;
  for(const a of data.access)s.access[a.id]=a.answer;s.redactions={a2:true,a4:true};
  s.crisis=[0,1,0,1,0,1];assert.equal(workSummary(s,data.triage,data.access).complete,false);
  s.reconstruction=1;assert.equal(workSummary(s,data.triage,data.access).complete,true);
  assert.equal(workSummary(s,data.triage,data.access).responsibleOutcome,false,'Trying all choices is not proof of responsible leadership');
  s.crisis[5]=null;assert.equal(workSummary(s,data.triage,data.access).complete,false);
});
test('Unanswered decisions do not receive positive or negative outcomes', () => {
  const s=freshCase(),r=workSummary(s,data.triage,data.access);
  assert.equal(r.decisions,0);assert.equal(r.protectedDecisions,0);
  assert.equal(r.leadershipQuality,'unassessed');assert.equal(r.unresolvedDecisions,0);assert.equal(r.unansweredDecisions,6);assert.equal(r.responsibleOutcome,false);
  assert.match(caseReport(s,r),/ikke ferdig avklart/);
});

test('All sixty-four completed decision combinations distinguish participation from protected outcomes', () => {
  const s=freshCase();for(const e of data.evidence)collectEvidence(s,e.id);
  for(const t of data.triage)s.triage[t.id]=t.answer;
  for(const a of data.access)s.access[a.id]=a.answer;
  s.redactions={a2:true,a4:true};s.reconstruction=1;
  for(let mask=0;mask<64;mask++){
    s.crisis=Array.from({length:6},(_,i)=>(mask>>i)&1);
    const summary=workSummary(s,data.triage,data.access),protectedCount=s.crisis.reduce((sum,value)=>sum+value,0);
    assert.equal(summary.complete,true);assert.equal(summary.decisions,6);assert.equal(summary.protectedDecisions,protectedCount);
    assert.equal(summary.unresolvedDecisions,6-protectedCount);assert.equal(summary.unansweredDecisions,0);
    assert.equal(summary.responsibleOutcome,mask===63);assert.equal(summary.leadershipQuality,mask===63?'protected':'needs-follow-up');
  }
  s.found.pop();assert.equal(workSummary(s,data.triage,data.access).responsibleOutcome,false,'Good choices cannot substitute for missing evidence');
});

test('Partial leadership work distinguishes unexamined decisions from examined unsafe choices', () => {
  const s=freshCase();s.crisis=[1,0,null,1,null,null];const r=workSummary(s,data.triage,data.access);
  assert.equal(r.decisions,3);assert.equal(r.protectedDecisions,2);assert.equal(r.unresolvedDecisions,1);assert.equal(r.unansweredDecisions,3);
  assert.equal(r.leadershipQuality,'needs-follow-up');assert.equal(r.complete,false);assert.equal(r.responsibleOutcome,false);
});

test('Reports cannot make unsafe and safe completed choices look equivalent', () => {
  const s=freshCase();for(const e of data.evidence)collectEvidence(s,e.id);
  for(const t of data.triage)s.triage[t.id]=t.answer;for(const a of data.access)s.access[a.id]=a.answer;
  s.redactions={a2:true,a4:true};s.reconstruction=1;s.crisis=Array(6).fill(0);
  const unsafe=caseReport(s,workSummary(s,data.triage,data.access));
  s.crisis=Array(6).fill(1);const safe=caseReport(s,workSummary(s,data.triage,data.access));
  assert.notEqual(unsafe,safe);assert.match(unsafe,/0\/6 prøvde valg/);assert.match(safe,/6\/6 prøvde valg/);
  assert.match(unsafe,/Gjennomføring er ikke det samme som gode ledervalg/);
});

test('A premature saved conclusion is cleared instead of bypassing the ten-clue evidence requirement', () => {
  const raw={...freshCase(),found:['e1'],reconstruction:1};const restored=restoreCase(JSON.stringify(raw));
  assert.equal(restored.reconstruction,null);
  assert.match(caseReport(raw,workSummary(raw,data.triage,data.access)),/Konklusjonen er ikke ferdig avklart/);
});
test('The conclusion distinguishes missing proof from proven permanent loss', () => {
  assert.equal(data.reconstruction.answer,1);
  assert.match(data.reconstruction.explanation,/Ingen av dem bekrefter utført sluttkontroll/);
  assert.match(data.reconstruction.explanation,/manglende bekreftelse.*beviser ikke at kontrollen aldri skjedde/);
  assert.match(data.evidence.find(e=>e.id==='e4').meaning,/mislykket åpning her beviser ikke endelig tap/);
});
test('Case data has complete explanations and no blanket delete or deny action', () => {
  for(const card of [...data.triage,...data.access])assert.ok(card.explanation.length>65);
  assert.equal(data.triage.some(t=>t.answer==='delete'),false);
  assert.equal(data.access.some(t=>t.answer==='deny'),false);
  for(const c of data.crisis){assert.equal(c.options.length,2);assert.equal(c.options[1].safe,true);assert.equal(c.options[0].safe,false);}
});
test('The optional discovery is independent of case completion and storage is isolated', () => {
  assert.match(CASE_STORAGE,/case17/);assert.notEqual(CASE_STORAGE,'arkivmuseet-journey-v1');
  const a=freshCase(),b=freshCase();a.secret=true;assert.deepEqual(workSummary(a,data.triage,data.access),workSummary(b,data.triage,data.access));
});
test('The generated text version includes every clue and every task without scripts', () => {
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/make-investigation-text.mjs',import.meta.url))]);
  const html=readFileSync(new URL('../public/sak17.html',import.meta.url),'utf8');
  for(const card of [...data.evidence,...data.triage,...data.access,...data.crisis])assert.ok(html.includes(card.title));
  assert.ok(html.includes(data.reconstruction.explanation));assert.equal(html.includes('<script'),false);
});
