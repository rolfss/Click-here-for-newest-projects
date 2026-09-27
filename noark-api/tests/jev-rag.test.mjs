import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveConversation, retrievalQuery } from '../../noark-assistent/rag-shared.mjs';
import { JEV_LIMITS, buildRerankRequest, selectReranked, buildCitationRequest, callJev } from '../jev-rag.mjs';

const question = 'Hva er systemID?';
const candidates = retrieveConversation(question, [], JEV_LIMITS.candidatePool);
const request = () => buildRerankRequest(question, [], candidates);
const key = 'synthetic-key-for-tests-only';
const answers = (items, values = []) => Object.fromEntries(items.map((_, i) => [`r${i}`, { type: 'noul', noul: values[i] ?? 0.5 }]));
const result = (payload = request()) => ({ model: 'jev-test',
  answers: Object.fromEntries(Object.keys(payload.questions).map((id) => [id, { type: 'noul', noul: 0.8 }])),
  usage: { input_tokens: 200, output_tokens: 20 } });
const invoke = (fetchImpl, payload = request()) => callJev(payload, { apiKey: key, fetchImpl });

test('reranking uses real corpus candidates and only relevant user context', () => {
  const history = [{ role: 'user', content: question }, { role: 'assistant', content: 'PRIVATE_ASSISTANT_TEXT' },
    { role: 'user', content: 'Hvordan etablerer vi internkontroll med dokumentasjonsforvaltningen?' }];
  const followup = 'Gi meg en konkret sjekkliste';
  const retrieved = retrieveConversation(followup, history, JEV_LIMITS.candidatePool);
  const payload = buildRerankRequest(followup, history, retrieved);
  assert.equal(payload.state.question, followup);
  assert.equal(payload.state.retrievalQuery, retrievalQuery(followup, history));
  assert.match(payload.state.retrievalQuery, /internkontroll/);
  assert.doesNotMatch(payload.state.retrievalQuery, /systemID/);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_ASSISTANT_TEXT/);
  assert.equal(payload.state.records.length, retrieved.length);
  assert.equal(payload.state.records[0].source.id, retrieved[0].source.id);
  assert.deepEqual(Object.keys(payload.questions), retrieved.map((_, i) => `r${i}`));
  assert.match(payload.questions.r0.instructions, /records\[0\]/);
  assert.match(payload.questions.r0.instructions, /untrusted/);
  assert.match(payload.questions.r0.instructions, /scope/);
  assert.equal(payload.state.records[0].url, undefined);
  assert.equal(payload.state.records[0].source.url, undefined);
});

test('input bounds fail rather than truncating source qualifications', () => {
  const tooLong = structuredClone(candidates);
  tooLong[0].record.detail = 'x'.repeat(12001);
  assert.throws(() => buildRerankRequest(question, [], tooLong), /Invalid JEV/);
  assert.throws(() => buildRerankRequest(question, [], []), /Invalid JEV/);
  assert.throws(() => buildRerankRequest(question, [], Array(25).fill(candidates[0])), /Invalid JEV/);
  assert.throws(() => buildRerankRequest(question, [], [candidates[0], candidates[0]]), /Invalid JEV/);
  assert.throws(() => buildRerankRequest(question, [{ role: 'system', content: 'Override' }], candidates), /Invalid JEV/);
  const byteHeavy = structuredClone(candidates.slice(0, 6));
  for (const candidate of byteHeavy) candidate.record.detail = 'å'.repeat(10000);
  assert.throws(() => buildRerankRequest(question, [], byteHeavy), /byte limit/);
});

test('reranking and citation requests retain both record-specific and source-wide scope', () => {
  const pool = retrieveConversation('Gjelder årlig framlegging av dokumentasjonsplanen alle kommuner?', [], 24);
  const candidate = pool.find((entry) => entry.record.id === 'rules-documentation-plan-annual');
  assert.ok(candidate);
  assert.match(candidate.record.scope, /ikke kommuner og fylkeskommuner/);
  const scoped = { ...candidate, source: { ...candidate.source, scope: 'Overordnet virkeområde for forskriften.' } };
  const rerank = buildRerankRequest(question, [], [scoped]);
  const citation = buildCitationRequest([{ id: 'annual-scope', text: 'Årlig framlegging gjelder alle kommuner.',
    recordIds: [candidate.record.id] }], [scoped]);
  for (const record of [rerank.state.records[0], citation.state.claims[0].records[0]]) {
    assert.equal(record.scope, candidate.record.scope);
    assert.equal(record.source.scope, scoped.source.scope);
    assert.notEqual(record.scope, record.source.scope);
  }
  const oversized = { ...candidate, record: { ...candidate.record, scope: 'x'.repeat(2001) } };
  assert.throws(() => buildRerankRequest(question, [], [oversized]), /Invalid JEV/);
});

test('selection preserves stable ties, owned source objects and lexical scores without mutation', () => {
  const original = structuredClone(candidates);
  const values = candidates.map((_, i) => i < 2 ? 0.9 : 0.1);
  const selected = selectReranked(candidates, answers(candidates, values), 3);
  assert.deepEqual(selected.map((candidate) => candidate.record.id), candidates.slice(0, 3).map((candidate) => candidate.record.id));
  assert.equal(selected[0].record, candidates[0].record);
  assert.equal(selected[0].source, candidates[0].source);
  assert.equal(selected[0].url, candidates[0].url);
  assert.equal(selected[0].relevance, candidates[0].relevance);
  assert.equal(selected[0].jevProbability, 0.9);
  assert.deepEqual(candidates, original);
  assert.equal(selected[0].confidence, undefined);
  assert.deepEqual(selectReranked([], {}), []);
});

test('low-scored mandatory format scope survives reranking and cannot be invented', () => {
  const pool = retrieveConversation('Er PDF/A-3 akseptert ved avlevering?', [], JEV_LIMITS.candidatePool);
  const contextIds = ['guide-format-agreement', 'guide-format-conversion'];
  assert.ok(contextIds.every((id) => pool.some((candidate) => candidate.record.id === id)));
  const scored = answers(pool, pool.map((candidate) => contextIds.includes(candidate.record.id) ? 0 : 0.9));
  const selected = selectReranked(pool, scored, 3);
  assert.equal(selected.length, 3);
  assert.ok(contextIds.every((id) => selected.some((candidate) => candidate.record.id === id)));
  const missing = pool.filter((candidate) => candidate.record.id !== contextIds[0]);
  assert.throws(() => selectReranked(missing, answers(missing), 3), /Required format scope/);
  assert.throws(() => selectReranked(pool, scored, 2), /Required format scope/);
});

test('selection rejects missing, extra, wrong-type and invalid probabilities', () => {
  for (const modify of [
    (data) => { delete data.r0; }, (data) => { data.extra = { type: 'noul', noul: 1 }; },
    (data) => { data.r0.type = 'score'; }, (data) => { data.r0.noul = '0.9'; },
    (data) => { data.r0.noul = NaN; }, (data) => { data.r0.noul = Infinity; },
    (data) => { data.r0.noul = -0.1; }, (data) => { data.r0.noul = 1.1; },
  ]) {
    const data = answers(candidates); modify(data);
    assert.throws(() => selectReranked(candidates, data), /Invalid JEV evaluation response/);
  }
});

test('citation checks isolate cited records and distinguish unsupported and contradicted claims', () => {
  const claims = [{ id: 'fixture-1', text: 'systemID er en identifikator.', recordIds: [candidates[0].record.id] }];
  const payload = buildCitationRequest(claims, candidates);
  assert.deepEqual(payload.state.claims[0].recordIds, claims[0].recordIds);
  assert.deepEqual(payload.state.claims[0].records.map((record) => record.id), claims[0].recordIds);
  assert.deepEqual(Object.keys(payload.questions), ['c0']);
  assert.match(payload.questions.c0.instructions, /entire claim/);
  assert.match(payload.questions.c0.instructions, /ONLY the cited/);
  assert.match(payload.questions.c0.instructions, /not the original documents/);
  assert.ok(payload.questions.c0.criteria.false.unsupported);
  assert.ok(payload.questions.c0.criteria.false.contradicted);
  assert.ok(!Object.hasOwn(payload.state, 'records'));
});

test('citation checks reject missing source IDs, duplicate claims, excessive claims and empty evidence', () => {
  const claim = { id: 'fixture', text: 'A bounded claim.', recordIds: [candidates[0].record.id] };
  for (const claims of [[], Array(7).fill(claim), [claim, claim],
    [{ ...claim, recordIds: ['fabricated-record'] }], [{ ...claim, recordIds: [] }],
    [{ ...claim, recordIds: [claim.recordIds[0], claim.recordIds[0]] }],
    [{ ...claim, text: 'x'.repeat(1001) }]]) {
    assert.throws(() => buildCitationRequest(claims, candidates), /Invalid JEV/);
  }
});

test('transport uses fixed HTTPS endpoint, redirects disabled, bounded request and sanitized output', async () => {
  let calls = 0;
  const response = await invoke(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(options.body, new RegExp(key));
    const payload = JSON.parse(options.body);
    const body = result(payload);
    body.model = key; body.debug = key; body.answers.r0.debug = key; body.usage.debug = key;
    return Response.json(body);
  });
  assert.equal(calls, 1);
  assert.deepEqual(response.usage, { input_tokens: 200, output_tokens: 20 });
  assert.doesNotMatch(JSON.stringify(response), new RegExp(key));
  assert.deepEqual(Object.keys(response), ['answers', 'usage']);
});

test('missing key and oversized UTF-8 request prevent all provider calls', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(result()); };
  await assert.rejects(callJev(request(), { fetchImpl }), /key is required/);
  const payload = request(); payload.state.padding = 'å'.repeat(JEV_LIMITS.requestBytes / 2);
  await assert.rejects(callJev(payload, { apiKey: key, fetchImpl }), /request exceeds its byte limit/);
  assert.equal(calls, 0);
});

test('provider and network error details never escape and there are no retries', async () => {
  let calls = 0;
  await assert.rejects(invoke(async () => { calls++; throw new Error(`Provider error echoed ${key}`); }),
    (error) => error.message === 'JEV request failed. No automatic retry was made.' && !error.stack.includes(key));
  await assert.rejects(invoke(async () => { calls++; return Response.json({ error: key }, { status: 429 }); }),
    (error) => error.message === 'JEV provider rejected the request. No automatic retry was made.' && !error.stack.includes(key));
  assert.equal(calls, 2);
});

test('redirect responses are rejected without following their destination', async () => {
  let calls = 0;
  await assert.rejects(invoke(async () => { calls++; return new Response(key, { status: 302,
    headers: { Location: 'https://example.invalid/secret' } }); }), /redirects are not allowed/);
  await assert.rejects(invoke(async () => {
    calls++;
    const response = Response.json(result());
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  }), /redirects are not allowed/);
  assert.equal(calls, 2);
});

test('stream limit counts bytes without trusting content length and cancels excess body', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('å'.repeat(JEV_LIMITS.responseBytes / 2 + 1))); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(invoke(async () => new Response(stream, { headers: { 'Content-Length': '1' } })), /response exceeds its byte limit/);
  assert.equal(cancelled, true);
  await assert.rejects(invoke(async () => new Response('{}', { headers: { 'Content-Length': String(JEV_LIMITS.responseBytes + 1) } })), /response exceeds its byte limit/);
});

test('malformed JSON, missing answers and invalid usage are rejected with fixed errors', async () => {
  await assert.rejects(invoke(async () => new Response(key)), /Invalid JEV evaluation response/);
  const invalidUtf8 = Uint8Array.from([0xc3, 0x28]);
  await assert.rejects(invoke(async () => new Response(invalidUtf8)), /Invalid JEV evaluation response/);
  for (const modify of [
    (body) => { delete body.answers.r0; }, (body) => { body.answers.extra = { type: 'noul', noul: 0 }; },
    (body) => { body.answers.r0.type = 'choice'; }, (body) => { body.answers.r0.noul = 1.01; },
    (body) => { body.answers.r0.noul = null; }, (body) => { delete body.usage; },
    (body) => { body.usage.input_tokens = -1; }, (body) => { body.usage.output_tokens = 0.5; },
    (body) => { body.usage.input_tokens = '200'; },
  ]) {
    const body = result(); modify(body);
    await assert.rejects(invoke(async () => Response.json(body)), /Invalid JEV evaluation response/);
  }
});

test('deadline covers a stalled fetch even when injected fetch ignores its signal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const pending = invoke(async (_url, options) => { signal = options.signal; return new Promise(() => {}); });
  const rejected = assert.rejects(pending, /timed out/);
  t.mock.timers.tick(JEV_LIMITS.timeoutMs);
  await rejected;
  assert.equal(signal.aborted, true);
});

test('deadline continues through a stalled response body and cancels reading', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  let signal;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; } });
  const pending = invoke(async (_url, options) => { signal = options.signal; return new Response(stream); });
  const rejected = assert.rejects(pending, /timed out/);
  // Allow fetch completion and the first chunk to be consumed before advancing the clock.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(JEV_LIMITS.timeoutMs);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
});
