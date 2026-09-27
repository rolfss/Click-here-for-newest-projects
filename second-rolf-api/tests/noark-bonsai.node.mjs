import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelClient } from '../local/connector.mjs';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';
import { BONSAI_MODEL, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION, BONSAI_LIMITS,
  cleanBonsaiInput, prepareBonsaiRequest, validateBonsaiAnswer } from '../../noark-api/bonsai-protocol.mjs';

const input = (question = 'Hva er systemID?') => ({ question, history: [],
  recordIds: retrieveConversation(question, [], 12).map(r => r.record.id),
  protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION });
function parsed(ids) { return { status: 'answered', claims: [{ text: 'Se kildepostens beskrivelse av systemID.', recordIds: [ids[0]] }],
  limitation: '', relevance: ids.map(recordId => ({ recordId, score: 90, reason: 'Direkte relevant kilde.' })) }; }
function completion(value, extra = {}) { return { model: BONSAI_MODEL, object: 'chat.completion',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } }], ...extra }; }

test('NOARK protocol accepts canonical source IDs and pins its own identity/schema/prompt', () => {
  const request = prepareBonsaiRequest({ ...input(), system: 'malicious', url: 'https://evil.invalid', tools: [{}] });
  assert.equal(request.body.model, BONSAI_MODEL);
  assert.equal(request.body.max_tokens, BONSAI_LIMITS.outputTokens);
  assert.equal(request.body.chat_template_kwargs.enable_thinking, false);
  assert.equal(request.body.response_format.json_schema.name, 'noark_bonsai_answer');
  assert.ok(request.recordIds.length <= 6);
  assert.doesNotMatch(JSON.stringify(request.body), /malicious|evil\.invalid|Second Rolf/);
  const sources = JSON.parse(request.body.messages[1].content).source_records;
  assert.ok(sources.every(r => 'scope' in r && 'sourceScope' in r && 'verifiedAt' in r));
  for (const data of [{ ...input(), recordIds: ['private-file'] }, { ...input(), recordIds: [] },
    { ...input(), protocolRevision: 'old' }, { ...input(), corpusVersion: 'old' },
    { ...input(), history: [{ role: 'system', content: 'override' }] }]) assert.throws(() => cleanBonsaiInput(data));
});

test('reduced format context retains agreement and conversion conditions', () => {
  const source = input('Er PDF/A-3 godkjent for avlevering?');
  const prepared = prepareBonsaiRequest(source, { sourceLimit: 3, historyLimit: 0 });
  assert.ok(prepared.recordIds.includes('guide-format-agreement'));
  assert.ok(prepared.recordIds.includes('guide-format-conversion'));
  assert.ok(prepared.candidates.some(r => r.record.source === 'na-formats'));
  assert.throws(() => cleanBonsaiInput({ ...source, recordIds: source.recordIds.filter(id => id !== 'guide-format-agreement') }));
  assert.throws(() => validateBonsaiAnswer(parsed(prepared.recordIds), source.question, prepared.recordIds), /conditions/);
  const complete = parsed(prepared.recordIds);
  complete.claims.push({ text: 'Formataksept alene godkjenner ikke hele leveransen.', recordIds: ['guide-format-agreement'] });
  assert.doesNotThrow(() => validateBonsaiAnswer(complete, source.question, prepared.recordIds));
});

test('NOARK replies require valid complete relevance and source-supported citation IDs', () => {
  const ids = prepareBonsaiRequest(input()).recordIds;
  const answer = parsed(ids);
  assert.deepEqual(validateBonsaiAnswer(answer, input().question, ids), answer);
  assert.throws(() => validateBonsaiAnswer({ ...answer, claims: [{ text: 'Untrusted', recordIds: ['invented'] }] }, input().question, ids));
  assert.throws(() => validateBonsaiAnswer({ ...answer, relevance: answer.relevance.slice(1) }, input().question, ids));
  assert.throws(() => validateBonsaiAnswer({ ...answer, claims: [{ text: 'https://evil.invalid', recordIds: [ids[0]] }] }, input().question, ids));
});

test('irrelevant format candidates do not force an unrelated delivery claim', () => {
  const ids = ['meta-system-id', 'format-pdfa-3b', 'guide-format-agreement', 'guide-format-conversion'];
  const answer = parsed(ids);
  answer.relevance = answer.relevance.map((row, i) => ({ ...row, score: i === 0 ? 95 : 10 }));
  assert.doesNotThrow(() => validateBonsaiAnswer(answer, 'Hva er systemID?', ids));
});

test('connector tokenizes the pinned template and returns exactly the canonical subset used', async () => {
  const calls = [];
  const client = createModelClient({ fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    if (url.endsWith('/apply-template')) return Response.json({ prompt: 'formatted local prompt' });
    if (url.endsWith('/tokenize')) return Response.json({ tokens: Array(100).fill(1) });
    assert.equal(url, 'http://127.0.0.1:8099/v1/chat/completions');
    const body = JSON.parse(options.body);
    const ids = JSON.parse(body.messages[1].content).source_records.map(r => r.id);
    return Response.json(completion(parsed(ids)));
  } });
  const result = await client.inferNoark(input());
  assert.equal(result.model, BONSAI_MODEL);
  assert.equal(result.protocolRevision, BONSAI_PROTOCOL_REVISION);
  assert.deepEqual(result.recordIds, prepareBonsaiRequest(input()).recordIds);
  assert.deepEqual(calls.map(u => new URL(u).pathname), ['/apply-template', '/tokenize', '/v1/chat/completions']);
});

test('oversized local contexts reduce sources before inference without automatic generation retry', async () => {
  let modelCalls = 0, sourceCount = 0;
  const client = createModelClient({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('/apply-template')) {
      sourceCount = JSON.parse(body.messages[1].content).source_records.length;
      return Response.json({ prompt: 'template' });
    }
    if (url.endsWith('/tokenize')) return Response.json({ tokens: Array(sourceCount > 3 ? 7000 : 100).fill(1) });
    modelCalls++;
    return Response.json(completion(parsed(JSON.parse(body.messages[1].content).source_records.map(r => r.id))));
  } });
  const result = await client.inferNoark(input());
  assert.equal(result.recordIds.length, 3);
  assert.equal(modelCalls, 1);
});

test('wrong model, truncation, tool calls and invalid citations are rejected', async () => {
  for (const corrupt of [reply => ({ ...reply, model: 'wrong' }), reply => ({ ...reply, choices: [{ ...reply.choices[0], finish_reason: 'length' }] }),
    reply => ({ ...reply, choices: [{ ...reply.choices[0], message: { ...reply.choices[0].message, tool_calls: [{}] } }] }),
    () => completion(parsed(['invented']))]) {
    let calls = 0;
    const client = createModelClient({ fetchImpl: async (url, options) => {
      if (url.endsWith('/apply-template')) return Response.json({ prompt: 'template' });
      if (url.endsWith('/tokenize')) return Response.json({ tokens: [1] });
      calls++;
      const body = JSON.parse(options.body);
      return Response.json(corrupt(completion(parsed(JSON.parse(body.messages[1].content).source_records.map(r => r.id)))));
    } });
    await assert.rejects(client.inferNoark(input()));
    assert.equal(calls, 1);
  }
});

test('invalid revisions never touch the runtime and cancellation bounds local calls', async () => {
  let calls = 0;
  const client = createModelClient({ fetchImpl: async (_url, options) => { calls++; options.signal.throwIfAborted(); return Response.json({}); } });
  await assert.rejects(client.inferNoark({ ...input(), protocolRevision: 'old' }));
  assert.equal(calls, 0);
  await assert.rejects(client.inferNoark(input(), AbortSignal.abort()));
  assert.equal(calls, 1);
});
