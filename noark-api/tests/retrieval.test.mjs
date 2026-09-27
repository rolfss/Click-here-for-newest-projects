import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';
import { JEV_LIMITS } from '../jev-rag.mjs';
import { RAG_CONSENT, JEV_BUDGET, retrievalEnabled, prepareRetrieval, runRetrieval } from '../retrieval.mjs';

const question = 'En person ber om alle opplysningene vi har om henne. Hvordan håndterer vi dokumenter som også omtaler andre?';
const env = { JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-private-key-never-a-real-key' };
const prepare = (text = question, consent = RAG_CONSENT, settings = env) => prepareRetrieval(text, [], settings, consent);
const noFetch = () => { throw new Error('Unexpected network call'); };
const ids = (items) => items.map(({ record }) => record.id);
function response(plan, overrides = {}) {
  return { answers: Object.fromEntries(plan.payload.state.records.map((record, i) => [`r${i}`, {
    type: 'noul', noul: record.id === 'req-6-13-14' ? 0.99 : 0.1,
  }])), usage: { input_tokens: 700, output_tokens: 160 }, ...overrides };
}

test('JEV must be explicitly enabled with a valid server key', () => {
  for (const settings of [undefined, {}, { TYPESAFE_API_KEY: env.TYPESAFE_API_KEY },
    { ...env, JEV_ENABLED: true }, { ...env, JEV_ENABLED: 'TRUE' },
    { ...env, TYPESAFE_API_KEY: '' }, { ...env, TYPESAFE_API_KEY: 'tiny' },
    { ...env, TYPESAFE_API_KEY: 'secret contains spaces' }, { ...env, TYPESAFE_API_KEY: 'x'.repeat(4097) }]) {
    assert.equal(retrievalEnabled(settings), false);
  }
  assert.equal(retrievalEnabled(env), true);
});

test('old or absent consent never prepares or sends data to TypeSafe', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('Unexpected network call'); };
  for (const consent of [undefined, null, false, true, '', '2026-09-08-context-v2']) {
    const plan = prepareRetrieval(question, [], env, consent);
    assert.equal(plan.status, 'not_consented');
    assert.equal(plan.payload, null);
    assert.equal(plan.reserve, 0);
    assert.deepEqual(await runRetrieval(plan, env, { fetchImpl }), {
      candidates: plan.candidates, retrieval: { method: 'lexical', status: 'not_consented' }, charged: 0,
    });
  }
  const disabled = prepare(question, RAG_CONSENT, {});
  assert.equal((await runRetrieval(disabled, env, { fetchImpl })).retrieval.status, 'disabled');
  assert.equal(calls, 0);
});

test('preparation preserves lexical fallback, scope, and relevant user context with no credential', () => {
  const history = [{ role: 'user', content: 'Gjelder årlig framlegging av dokumentasjonsplanen alle kommuner?' },
    { role: 'assistant', content: 'PRIVATE_ASSISTANT_OUTPUT' }];
  const plan = prepareRetrieval('Kan du utdype?', history, env, RAG_CONSENT);
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.candidates, retrieveConversation('Kan du utdype?', history));
  assert.equal(plan.payload.state.records.length, 24);
  const source = plan.payload.state.records.find((record) => record.id === 'rules-documentation-plan-annual');
  assert.match(source.scope, /ikke kommuner og fylkeskommuner/);
  assert.match(plan.payload.state.retrievalQuery, /årlig framlegging/);
  const serialized = JSON.stringify(plan);
  assert.ok(!serialized.includes(env.TYPESAFE_API_KEY));
  assert.ok(!serialized.includes('PRIVATE_ASSISTANT_OUTPUT'));
  const bytes = new TextEncoder().encode(JSON.stringify(plan.payload)).byteLength;
  assert.equal(plan.reserve, (bytes + JEV_BUDGET.inputHeadroom + JEV_LIMITS.responseBytes) * JEV_BUDGET.microUsdPerToken);
  assert.throws(() => { plan.payload.state.question = 'Altered after reservation'; }, TypeError);
  assert.throws(() => { plan.reserve = 0; }, TypeError);
});

test('successful JEV ranking promotes candidates outside the old 12 while retaining corpus identities', async () => {
  const plan = prepare();
  assert.equal(plan.status, 'ready');
  assert.ok(!ids(plan.candidates).includes('req-6-13-14'));
  const pool = retrieveConversation(question, [], JEV_LIMITS.candidatePool);
  const original = pool.find((candidate) => candidate.record.id === 'req-6-13-14');
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${env.TYPESAFE_API_KEY}`);
    assert.deepEqual(JSON.parse(options.body), plan.payload);
    return Response.json(response(plan));
  };
  const [result, duplicate] = await Promise.all([runRetrieval(plan, env, { fetchImpl }), runRetrieval(plan, env, { fetchImpl })]);
  assert.equal(calls, 1);
  assert.equal(duplicate, result);
  assert.equal(result.candidates.length, 12);
  assert.deepEqual(result.retrieval, { method: 'jev', status: 'completed' });
  assert.equal(result.charged, 860);
  assert.equal(result.candidates[0].record, original.record);
  assert.equal(result.candidates[0].source, original.source);
  assert.equal(result.candidates[0].url, original.url);
  assert.equal(result.candidates[0].rank, 1);
  assert.equal(result.candidates[0].jevProbability, 0.99);
  assert.deepEqual(plan.candidates, retrieveConversation(question, []));
  assert.ok(!JSON.stringify(result).includes(env.TYPESAFE_API_KEY));
});

test('JEV failure preserves exact lexical results and the full unknown-usage reservation, without retry or secrets', async () => {
  for (const kind of ['network', 'provider', 'redirect', 'invalid-answer', 'missing-usage', 'unsafe-usage']) {
    const plan = prepare();
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (kind === 'network') throw new Error(`Provider echoed ${env.TYPESAFE_API_KEY}`);
      if (kind === 'provider') return new Response(env.TYPESAFE_API_KEY, { status: 429 });
      if (kind === 'redirect') return new Response(env.TYPESAFE_API_KEY, { status: 302, headers: { Location: 'https://example.invalid' } });
      const body = response(plan);
      if (kind === 'invalid-answer') body.answers.r0.noul = '0.99';
      if (kind === 'missing-usage') delete body.usage;
      if (kind === 'unsafe-usage') body.usage = { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 };
      return Response.json(body);
    };
    const result = await runRetrieval(plan, env, { fetchImpl });
    assert.equal(calls, 1, kind);
    assert.equal(result.candidates, plan.candidates, kind);
    assert.deepEqual(result.retrieval, { method: 'lexical', status: 'unavailable' });
    assert.equal(result.charged, plan.reserve, kind);
    assert.ok(!JSON.stringify(result).includes(env.TYPESAFE_API_KEY), kind);
  }
});

test('a server-side disable between preparation and execution cancels dispatch without charge', async () => {
  const plan = prepare();
  const result = await runRetrieval(plan, { ...env, JEV_ENABLED: 'false' }, { fetchImpl: noFetch });
  assert.deepEqual(result.retrieval, { method: 'lexical', status: 'disabled' });
  assert.equal(result.charged, 0);
});

test('format acceptance conditions survive low JEV scores and are the original corpus records', async () => {
  const plan = prepare('Er PDF/A-3 akseptert ved avlevering?');
  const required = ['guide-format-agreement', 'guide-format-conversion'];
  const data = response(plan);
  plan.payload.state.records.forEach((record, i) => { data.answers[`r${i}`].noul = required.includes(record.id) ? 0 : 0.9; });
  const result = await runRetrieval(plan, env, { fetchImpl: async () => Response.json(data) });
  for (const id of required) {
    const candidate = result.candidates.find((entry) => entry.record.id === id);
    assert.ok(candidate);
    assert.equal(candidate.record, plan.candidates.find((entry) => entry.record.id === id).record);
  }
});

test('verified usage above the conservative allowance is never silently undercharged', async () => {
  const plan = prepare();
  const data = response(plan, { usage: { input_tokens: plan.reserve + 10, output_tokens: 2 } });
  const result = await runRetrieval(plan, env, { fetchImpl: async () => Response.json(data) });
  assert.equal(result.charged, plan.reserve + 12);
});

test('untrusted fabricated plans cannot bypass preparation or consent', async () => {
  await assert.rejects(runRetrieval({ ...prepare() }, env, { fetchImpl: noFetch }), /Invalid retrieval plan/);
});
