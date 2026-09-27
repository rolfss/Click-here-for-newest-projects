import test from 'node:test';
import assert from 'node:assert/strict';
import { RECORDS } from '../../noark-assistent/data.mjs';
import { cleanConversation, retrieveConversation } from '../../noark-assistent/rag-shared.mjs';
import { EVAL_CASES } from '../evals/jev-fixtures.mjs';

test('synthetic evaluation labels reference real records and include supported and unsupported claims', () => {
  const recordIds = new Set(RECORDS.map((record) => record.id));
  const caseIds = new Set();
  const claimIds = new Set();
  const labels = new Set();
  assert.equal(EVAL_CASES.length, 14);
  assert.ok(EVAL_CASES.some((fixture) => fixture.split === 'holdout'));
  assert.ok(EVAL_CASES.some((fixture) => fixture.relevantRecordIds.length === 0));
  for (const fixture of EVAL_CASES) {
    assert.equal(typeof fixture.id, 'string');
    assert.ok(fixture.id.length > 0 && !caseIds.has(fixture.id), fixture.id);
    caseIds.add(fixture.id);
    assert.ok(['development', 'holdout'].includes(fixture.split));
    assert.doesNotThrow(() => cleanConversation(fixture.question, fixture.history), fixture.id);
    assert.ok(Array.isArray(fixture.relevantRecordIds));
    assert.equal(new Set(fixture.relevantRecordIds).size, fixture.relevantRecordIds.length);
    for (const id of fixture.relevantRecordIds) assert.ok(recordIds.has(id), `${fixture.id}: unknown relevant record ${id}`);
    assert.ok(Array.isArray(fixture.claims) && fixture.claims.length <= 2);
    for (const claim of fixture.claims) {
      assert.equal(typeof claim.id, 'string');
      assert.ok(claim.id.length > 0 && !claimIds.has(claim.id), claim.id);
      claimIds.add(claim.id);
      assert.equal(typeof claim.text, 'string');
      assert.ok(claim.text.length > 0 && claim.text.length <= 1000);
      assert.equal(typeof claim.supported, 'boolean');
      labels.add(claim.supported);
      assert.ok(Array.isArray(claim.recordIds) && claim.recordIds.length >= 1 && claim.recordIds.length <= 3);
      assert.equal(new Set(claim.recordIds).size, claim.recordIds.length);
      for (const id of claim.recordIds) assert.ok(recordIds.has(id), `${claim.id}: unknown citation ${id}`);
    }
  }
  assert.ok(claimIds.size <= 6);
  assert.deepEqual(labels, new Set([true, false]));
});

for (const fixture of EVAL_CASES) {
  test(`real retrieval can evaluate synthetic fixture: ${fixture.id}`, () => {
    const candidates = retrieveConversation(fixture.question, fixture.history, 24);
    if (fixture.relevantRecordIds.length === 0) {
      assert.equal(candidates.length, 0, 'out-of-domain questions must not acquire invented sources');
      return;
    }
    const retrievedIds = new Set(candidates.map(({ record }) => record.id));
    assert.ok(fixture.relevantRecordIds.some((id) => retrievedIds.has(id)),
      `${fixture.id}: none of the labeled relevant records were retrieved`);
  });
}

test('paraphrased development labels retain their actual corpus support and scope', () => {
  const expectations = [
    ['departed-employee-history', 'req-4-5-9', /settes passive/, /oversikt over når brukere var aktive/, 'noark-v6'],
    ['procurement-vendor-exit', 'section-5-export', /eksporteres kontrollert/, /tidlig testuttrekk/, 'systems-guidance'],
    ['old-errors-before-transfer', 'noark-extract-cleanup', /dokumenteres og forklares/, /databaseopprydding/, 'noark-now'],
    ['personal-access-other-people', 'req-6-13-14', /lovbestemt innsyn/, /andre parter skjermes/, 'noark-v6'],
  ];
  for (const [fixtureId, recordId, summary, detail, source] of expectations) {
    const fixture = EVAL_CASES.find((item) => item.id === fixtureId);
    const record = RECORDS.find((item) => item.id === recordId);
    assert.equal(fixture.split, 'development');
    assert.deepEqual(fixture.relevantRecordIds, [recordId]);
    assert.equal(typeof fixture.labelRationale, 'string');
    assert.ok(fixture.labelRationale.length > 50);
    assert.match(record.summary, summary);
    assert.match(record.detail, detail);
    assert.equal(record.source, source);
    assert.ok(retrieveConversation(fixture.question, fixture.history, 24).some((item) => item.record.id === recordId));
  }
  assert.match(RECORDS.find((item) => item.id === 'noark-extract-cleanup').scope, /Nasjonalarkivet/);
});
