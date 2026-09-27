import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLuna } from '../evals/luna-baseline.mjs';
import { buildPayload } from '../worker.mjs';
import { retrieveConversation, finalizeAnswer } from '../../noark-assistent/rag-shared.mjs';

const question = 'Hva er systemID?';
const history = [{ role: 'user', content: 'Vi undersøker identifikatorer i Noark.' }];
const candidates = retrieveConversation(question, history);
const fakeKey = 'sk-local-test-never-real-secret';
const failure = 'Local Luna comparison failed; no automatic retry was made.';
const answer = () => ({ status: 'answered',
  claims: [{ text: 'systemID er en identifikator.', recordIds: [candidates[0].record.id] }],
  limitation: '', relevance: candidates.map((r, i) => ({ recordId: r.record.id, score: 70 + i,
    reason: 'Beskriver identifikatorer.' })) });
const completed = (parsed = answer()) => ({ status: 'completed',
  usage: { input_tokens: 4500, output_tokens: 1500, total_tokens: 6000 },
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [
    { type: 'output_text', text: JSON.stringify(parsed) },
  ] }] });
const safeFailure = (error) => {
  assert.equal(error.message, failure);
  assert.equal(error.cause, undefined);
  assert.ok(!String(error.stack).includes(fakeKey));
  return true;
};

test('Luna comparison reuses the exact production payload and normalizes real candidates', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload, buildPayload(question, history, candidates).body);
    assert.equal(payload.model, 'gpt-6-luna');
    assert.deepEqual(payload.reasoning, { effort: 'medium' });
    assert.equal(payload.store, false);
    return Response.json(completed());
  };
  const result = await evaluateLuna(question, history, candidates, { apiKey: fakeKey, fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual(result, { candidates: finalizeAnswer(question, answer(), candidates).results,
    usage: { input_tokens: 4500, output_tokens: 1500 } });
  assert.equal(result.candidates[0].record.id, candidates.at(-1).record.id);
  assert.ok(result.candidates.every((r) => r.relevanceMethod === 'luna' && r.url.startsWith('https://')));
});

test('missing local key refuses before any fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error(fakeKey); };
  for (const apiKey of [undefined, null, '', '   ', 123]) {
    await assert.rejects(evaluateLuna(question, history, candidates, { apiKey, fetchImpl }), safeFailure);
  }
  assert.equal(calls, 0);
});

test('HTTP and network failures are sanitized and never retried', async () => {
  for (const makeResponse of [
    () => Response.json({ error: { message: fakeKey } }, { status: 401 }),
    () => { throw new Error(`Connection failed with ${fakeKey}`); },
    () => new Response(`Invalid JSON ${fakeKey}`),
  ]) {
    let calls = 0;
    const fetchImpl = async () => { calls++; return makeResponse(); };
    await assert.rejects(evaluateLuna(question, history, candidates, { apiKey: fakeKey, fetchImpl }), safeFailure);
    assert.equal(calls, 1);
  }
});

test('incomplete output, malformed answers, and invalid usage fail safely', async () => {
  const cases = [
    { ...completed(), status: 'incomplete', error: fakeKey },
    { ...completed(), status: 'failed', error: fakeKey },
    { ...completed(), usage: null },
    { ...completed(), usage: { input_tokens: -1, output_tokens: 1 } },
    { ...completed(), usage: { input_tokens: 1, output_tokens: 0.5 } },
    { ...completed(), usage: { input_tokens: '1', output_tokens: 0 } },
    { ...completed(), output: [] },
    { ...completed(), output: [{ type: 'message', content: [{ type: 'refusal', refusal: fakeKey }] }] },
    completed({ ...answer(), relevance: [] }),
    completed({ ...answer(), claims: [{ text: fakeKey, recordIds: ['fabricated'] }] }),
  ];
  for (const value of cases) {
    let calls = 0;
    const fetchImpl = async () => { calls++; return Response.json(value); };
    await assert.rejects(evaluateLuna(question, history, candidates, { apiKey: fakeKey, fetchImpl }), safeFailure);
    assert.equal(calls, 1);
  }
});

test('response body enforces the byte cap without trusting Content-Length', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ detail: '\u00e6'.repeat(80000) }), {
    headers: { 'Content-Length': '1' },
  });
  await assert.rejects(evaluateLuna(question, history, candidates, { apiKey: fakeKey, fetchImpl }), safeFailure);
});

test('the 85-second deadline aborts a stalled body read even when fetch ignores abort', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  let bodyStarted;
  const started = new Promise((resolve) => { bodyStarted = resolve; });
  const fetchImpl = async (_url, options) => {
    signal = options.signal;
    return { ok: true, body: { getReader: () => ({ read: () => {
      bodyStarted();
      return new Promise(() => {});
    } }) } };
  };
  let settled = false;
  const pending = evaluateLuna(question, history, candidates, { apiKey: fakeKey, fetchImpl });
  const assertion = assert.rejects(pending, safeFailure).then(() => { settled = true; });
  await started;
  t.mock.timers.tick(84999);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await assertion;
  assert.equal(signal.aborted, true);
});
