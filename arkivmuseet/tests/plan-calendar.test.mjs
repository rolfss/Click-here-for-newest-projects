import test from 'node:test';
import assert from 'node:assert/strict';
import { planCalendar, datedPlan, validPlanDate } from '../src/journey-state.ts';
import { restoreJourney } from '../src/journey-state.ts';
const now = new Date('2026-09-26T10:00:00.000Z');
const uid = 'abcdef12-1234-1234-1234-123456789abc';
const missions = [{ id: 'one', badge: 'Gjenfinning', action: 'Prøv gjenfinning.', proof: 'En lesbar fil.', clues: [], options: [] },
  { id: 'two', badge: 'Innsyn', action: 'Kontroller.', proof: 'Dokumentasjon.', clues: [], options: [] }];
const state = () => ({ version: 1, attempts: {}, plan: { one: { selected: true, owner: 'Systemeier', due: '2026-10-15' }, two: { selected: false, owner: '', due: '2026-10-16' } } });

test('only real calendar dates are accepted, including leap days and year boundaries', () => {
  for (const value of ['2028-02-29','2026-12-31','0001-01-01','9999-12-31']) assert.equal(validPlanDate(value),true,value);
  for (const value of ['2026-02-29','2026-04-31','2026-13-01','2026-01-00','0000-01-01','26-1-1','2026-10-15\r\nATTENDEE:bad',null]) assert.equal(validPlanDate(value),false,String(value));
  const saved=state();saved.plan.one.due='2026-02-30';
  assert.equal(restoreJourney(JSON.stringify(saved),missions).plan.one.due,'');
});

test('exports selected dated actions as one-day transparent events without invitations or alarms', () => {
  const s=state();const result=planCalendar(missions,s,now,uid).replace(/\r\n /g,'');
  assert.equal((result.match(/BEGIN:VEVENT/g)||[]).length,1);
  assert.match(result,/DTSTART;VALUE=DATE:20261015\r\n/);
  assert.match(result,/DTSTAMP:20260926T100000Z/);
  assert.match(result,/Ansvarlig rolle: Systemeier\\nBestilling: Prøv gjenfinning\./);
  assert.match(result,/TRANSP:TRANSPARENT/);
  assert.doesNotMatch(result,/ATTENDEE|ORGANIZER|VALARM|METHOD:REQUEST|TZID|DTEND/);
  assert.deepEqual(s,state(),'export does not mutate exercise progress or plan');
});

test('undated and invalid actions stay in the plan but are excluded from the calendar file', () => {
  const s=state();s.plan.two.selected=true;s.plan.two.due='';
  assert.equal(datedPlan(missions,s).length,1);
  s.plan.one.due='2026-02-30';
  assert.throws(()=>planCalendar(missions,s,now,uid),/gyldig oppfølgingsdato/);
  assert.equal(s.plan.two.selected,true);
});

test('TEXT escaping prevents calendar-property injection and folds Norwegian UTF-8 safely', () => {
  const s=state();s.plan.one.owner='æøå😀'.repeat(25)+'; sjef, \\team\r\nATTENDEE:mailto:bad@example.invalid';
  const result=planCalendar(missions,s,now,uid);
  for(const line of result.split('\r\n')) assert.ok(Buffer.byteLength(line,'utf8')<=75,line);
  assert.equal(result.replace(/\r\n/g,'').includes('\n'),false);
  const unfolded=result.replace(/\r\n /g,'');
  assert.doesNotMatch(unfolded,/\r\nATTENDEE:/);
  assert.match(unfolded,/\\; sjef\\, \\\\team\\nATTENDEE:/);
  assert.match(unfolded,new RegExp('æøå😀'.repeat(25)));
});

test('identifiers are distinct for each action and each export, never influenced by free text', () => {
  const s=state();s.plan.two.selected=true;
  const first=planCalendar(missions,s,now,uid), second=planCalendar(missions,s,now,'12345678-abcd-abcd-abcd-123456789abc');
  const ids=first.match(/UID:[^\r]+/g);assert.equal(new Set(ids).size,2);
  assert.ok(ids.every(id=>!second.includes(id)));
  assert.throws(()=>planCalendar(missions,s,now,'\r\nATTENDEE:bad'),/kalenderidentifikator/);
});
