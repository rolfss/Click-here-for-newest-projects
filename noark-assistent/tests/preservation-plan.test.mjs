import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESERVATION_PLAN_RECORDS, PRESERVATION_PLAN_SOURCES } from '../preservation-plan-data.mjs';
import { RECORDS, SOURCES } from '../data.mjs';
import { answerQuestion, searchRecords, sourceUrl } from '../engine.mjs';

test('preservation-plan source metadata separates verification from publication', () => {
  const [source] = PRESERVATION_PLAN_SOURCES;
  assert.equal(source.id, 'na-preservation-plan');
  assert.equal(source.verifiedAt, '2026-10-15');
  assert.equal(source.published, '08.09.2026');
  assert.equal(source.updated, '14.10.2026');
  assert.equal(new URL(source.url).hostname, 'www.nasjonalarkivet.no');
  assert.match(source.scope, /Statlige/);
  assert.equal(new Set(PRESERVATION_PLAN_RECORDS.map((r) => r.id)).size, PRESERVATION_PLAN_RECORDS.length);
  for (const entry of PRESERVATION_PLAN_RECORDS) {
    assert.equal(entry.source, source.id);
    assert.equal(entry.verifiedAt, entry.id === 'guide-preservation-plan-properties' ? '2026-10-15' : '2026-09-17');
    assert.equal(entry.scope, source.scope);
    assert.ok(entry.section);
    assert.equal(entry.page, null);
    assert.equal(entry.requirement, null);
  }
});

test('preservation-plan records are integrated once with their official source', () => {
  assert.equal(SOURCES.filter((s) => s.id === 'na-preservation-plan').length, 1);
  for (const entry of PRESERVATION_PLAN_RECORDS) {
    assert.equal(RECORDS.filter((r) => r.id === entry.id).length, 1);
    assert.equal(sourceUrl(entry), PRESERVATION_PLAN_SOURCES[0].url);
  }
});

const questions = [
  ['Hvem godkjenner bevaringsplanen for statlige fagsaker?', 'guide-preservation-plan-approval', /Nasjonalarkivet.*godkjenner/],
  ['Hvilke skjemaer bruker vi til bevaringsplanen?', 'guide-preservation-plan-forms', /skjema 1.*skjema 2/],
  ['Hvordan lager vi en funksjonsbasert bevaringsplan?', 'guide-preservation-plan-method', /funksjoner og prosesser/],
  ['Må bevaringsplanen revideres før avlevering?', 'guide-preservation-plan-revision', /revidert plan dersom endringer/],
];

for (const [question, expectedId, expectedClaim] of questions) {
  test(`preservation-plan answer: ${question}`, () => {
    const result = searchRecords(question, { limit: 3 }).find((r) => r.record.id === expectedId);
    assert.ok(result, `Expected ${expectedId} among the first three results`);
    const answer = answerQuestion(question);
    assert.equal(answer.status, 'ok');
    assert.match([answer.lead, ...answer.points.map((point) => point.text)].join(' '), expectedClaim);
    assert.equal(sourceUrl(result.record), PRESERVATION_PLAN_SOURCES[0].url);
  });
}
