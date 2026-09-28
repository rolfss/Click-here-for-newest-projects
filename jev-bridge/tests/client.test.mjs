import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChoiceRequest, buildNoulRequest, buildScoreRequest, callJev } from '../jev-client.mjs';

test('builds bounded TypeSafe question shapes', () => {
  assert.equal(buildNoulRequest({ state: 'x', question: 'yes?' }).questions.decision.type, 'noul');
  assert.deepEqual(
    buildNoulRequest({ state: 'x', question: 'yes?', yesCriteria: 'yes case', noCriteria: 'no case' }).questions.decision.criteria,
    { true: 'yes case', false: 'no case' }
  );
  assert.deepEqual(buildChoiceRequest({ state: 'x', question: 'pick', options: [{ label: 'a' }, { label: 'b', description: 'B' }] }).questions.decision.criteria, { a: null, b: 'B' });
  assert.deepEqual(buildScoreRequest({ state: 'x', question: 'rate', levels: ['low', 'high'] }).questions.decision.criteria, ['low', 'high']);
});

test('rejects bad choice input', () => {
  assert.throws(() => buildChoiceRequest({ state: 'x', question: 'pick', options: [{ label: 'a' }] }), /2-100/);
  assert.throws(() => buildChoiceRequest({ state: 'x', question: 'pick', options: [{ label: 'a' }, { label: 'a' }] }), /Duplicate/);
});

test('calls the documented System One endpoint without leaking the key into output', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ model: 'jev-test', answers: { decision: { noul: 0.99 } }, usage: { input_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await callJev(buildNoulRequest({ state: 'x', question: 'yes?' }), { fetchImpl, env: { TYPESAFE_API_KEY: 'apikey_test_1234567890' } });
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.init.headers.Authorization, 'Bearer apikey_test_1234567890');
  assert.equal(result.answer.noul, 0.99);
  assert.ok(!JSON.stringify(result).includes('apikey_test'));
});
