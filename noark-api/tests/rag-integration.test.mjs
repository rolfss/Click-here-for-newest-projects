import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { LunaGate, LIMITS, estimatedCost, BONSAI_CONSENT, BONSAI_MODEL_ID } from '../worker.mjs';
import { BUILD_INFO } from '../../noark-assistent/data.mjs';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';
import { RAG_CONSENT, prepareRetrieval } from '../retrieval.mjs';
import { BONSAI_PROTOCOL_REVISION } from '../bonsai-protocol.mjs';

const question = 'En person ber om alle opplysningene vi har om henne. Hvordan håndterer vi dokumenter som også omtaler andre?';
const origin = 'https://rolfss.github.io';
const usage = { input_tokens: 1000, output_tokens: 200 };
const jevUsage = { input_tokens: 700, output_tokens: 160 };
const jevCharge = jevUsage.input_tokens + jevUsage.output_tokens;
const generationReserve = estimatedCost(LIMITS.promptBytes + 4096, LIMITS.outputTokens);

class Storage {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  transaction(fn) {
    const pending = this.queue.then(async () => {
      const transaction = new Storage(); transaction.data = structuredClone(this.data);
      const result = await fn(transaction); this.data = transaction.data; return result;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}

function parsedAnswer(ids) {
  return { status: 'answered', claims: [{ text: 'Kildene beskriver krav til dokumentasjonen.', recordIds: [ids[0]] }], limitation: '',
    relevance: ids.map((id, i) => ({ recordId: id, score: 95 - i, reason: 'Beskriver forholdet i spørsmålet.' })) };
}

function modelResponse(ids, overrides = {}) {
  return Response.json({ status: 'completed', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsedAnswer(ids)) }] }], ...overrides });
}

function system(options = {}) {
  const storage = new Storage(), events = [];
  const env = {
    ALLOWED_ORIGINS: origin, OPENAI_API_KEY: 'synthetic-private-openai-key',
    TURNSTILE_SECRET_KEY: 'synthetic-private-bot-secret', TURNSTILE_SITE_KEY: 'public-test-site',
    JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-private-typesafe-key',
    BONSAI_ENABLED: 'true',
    BONSAI: {
      async health() { return { available: true, model: BONSAI_MODEL_ID,
        corpusVersion: BUILD_INFO.corpusVersion, protocolRevision: BONSAI_PROTOCOL_REVISION }; },
      async answer(input) {
        events.push({ provider: 'bonsai', input });
        if (options.bonsai) return options.bonsai(input);
        return { parsed: parsedAnswer(input.recordIds), recordIds: input.recordIds, model: BONSAI_MODEL_ID,
          corpusVersion: BUILD_INFO.corpusVersion, protocolRevision: BONSAI_PROTOCOL_REVISION };
      },
    }, ...options.env,
  };
  const gate = new LunaGate({ storage }, env);
  env.LUNA_GATE = { idFromName: (name) => name, get: () => gate };
  return { storage, gate, env, events };
}

function installFetch(t, setup, { bot, jev, luna } = {}) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const payload = JSON.parse(options.body);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      setup.events.push({ provider: 'turnstile' });
      return bot ? bot(payload) : Response.json({ success: true, action: 'noark-chat', hostname: 'rolfss.github.io' });
    }
    if (url === 'https://api.typesafe.ai/v1/systemone') {
      setup.events.push({ provider: 'jev', payload });
      const ledger = await setup.storage.get('ledger');
      assert.ok(Object.values(ledger.requests).some((request) => request.pending && request.amount > 0), 'JEV dispatched before reservation');
      assert.equal(options.redirect, 'manual');
      if (jev) return jev(payload);
      return Response.json({ answers: Object.fromEntries(payload.state.records.map((record, i) => [`r${i}`, {
        type: 'noul', noul: record.id === 'req-6-13-14' ? 0.99 : 0.1,
      }])), usage: jevUsage });
    }
    if (url === 'https://api.openai.com/v1/responses') {
      setup.events.push({ provider: 'luna', payload });
      const ledger = await setup.storage.get('ledger');
      assert.ok(Object.values(ledger.requests).some((request) => request.pending && request.amount > 0), 'Luna dispatched before reservation');
      assert.equal(options.redirect, 'manual');
      const ids = JSON.parse(payload.input[0].content).source_records.map((record) => record.id);
      return luna ? luna(ids, payload) : modelResponse(ids);
    }
    throw new Error('Unexpected provider URL');
  });
}

function request(overrides = {}) {
  return new Request('https://test/api/chat', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.25' },
    body: JSON.stringify({ question, history: [], requestId: crypto.randomUUID(), turnstileToken: 'synthetic-token',
      ragConsent: RAG_CONSENT, bonsaiConsent: BONSAI_CONSENT, ...overrides }) });
}
const call = (setup, overrides) => worker.fetch(request(overrides), setup.env);
const providers = (setup) => setup.events.map((event) => event.provider);

async function exhaustBudget(setup) {
  await setup.gate.reserve('seed-budget', 'seed-ip', 0);
  await setup.gate.settle('seed-budget', 0);
  const ledger = await setup.storage.get('ledger');
  ledger.trial = LIMITS.trialMicroUsd;
  await setup.storage.put('ledger', ledger);
}

test('public chat authenticates, reserves, reranks 24 candidates, then sends only selected 12 to Luna', async (t) => {
  const setup = system(); installFetch(t, setup);
  const response = await call(setup);
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna']);
  assert.equal(answer.mode, 'luna');
  assert.deepEqual(answer.retrieval, { method: 'jev', status: 'completed' });
  const jev = setup.events[1].payload, luna = setup.events[2].payload;
  assert.equal(jev.state.records.length, 24);
  assert.ok(!retrieveConversation(question).some((entry) => entry.record.id === 'req-6-13-14'));
  const selected = JSON.parse(luna.input[0].content).source_records;
  assert.equal(selected.length, 12);
  assert.equal(selected[0].id, 'req-6-13-14');
  assert.deepEqual(luna.text.format.schema.properties.relevance.items.properties.recordId.enum, selected.map((record) => record.id));
  assert.ok(answer.results.every((entry) => /^https:\/\//.test(entry.url)));
  const ledger = await setup.storage.get('ledger');
  const totalCharge = jevCharge + estimatedCost(usage.input_tokens, usage.output_tokens);
  assert.equal(ledger.trial, totalCharge);
  assert.equal(ledger.daily, totalCharge);
  assert.equal(ledger.months[ledger.day.slice(0, 7)], totalCharge);
  assert.equal(Object.values(ledger.requests)[0].pending, false);
  const serialized = JSON.stringify(answer);
  assert.ok(!serialized.includes(setup.env.TYPESAFE_API_KEY));
  assert.ok(!serialized.includes(setup.env.OPENAI_API_KEY));
});

test('failed Turnstile never invokes JEV, Luna, Bonsai or a spending reservation', async (t) => {
  const setup = system(); installFetch(t, setup, { bot: async () => Response.json({ success: true, action: 'noark-chat', hostname: 'evil.example' }) });
  assert.equal((await call(setup)).status, 403);
  assert.deepEqual(providers(setup), ['turnstile']);
  assert.equal(await setup.storage.get('ledger'), undefined);
});

test('legacy Luna consent cannot send data to JEV or authorize local fallback', async (t) => {
  const setup = system(); installFetch(t, setup, { luna: async () => new Response('private provider error', { status: 429 }) });
  const response = await call(setup, { ragConsent: undefined, bonsaiConsent: undefined });
  assert.equal(response.status, 503);
  assert.deepEqual(providers(setup), ['turnstile', 'luna']);
  assert.equal((await setup.storage.get('ledger')).trial, 0);
});

test('Luna payload retains record-specific legal scope after JEV selection', async (t) => {
  const setup = system(); installFetch(t, setup);
  assert.equal((await call(setup, { question: 'Gjelder årlig framlegging av dokumentasjonsplanen alle kommuner?' })).status, 200);
  const source = JSON.parse(setup.events.find((event) => event.provider === 'luna').payload.input[0].content)
    .source_records.find((record) => record.id === 'rules-documentation-plan-annual');
  assert.ok(source);
  assert.match(source.recordScope, /ikke kommuner og fylkeskommuner/);
  assert.ok(Object.hasOwn(source, 'scope'));
});

test('unavailable JEV uses original lexical candidates and retains unknown JEV cost alongside Luna usage', async (t) => {
  const setup = system(); installFetch(t, setup, { jev: async () => { throw new Error(setup.env.TYPESAFE_API_KEY); } });
  const response = await call(setup);
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.deepEqual(answer.retrieval, { method: 'lexical', status: 'unavailable' });
  assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna']);
  const input = JSON.parse(setup.events[2].payload.input[0].content);
  assert.deepEqual(input.source_records.map((record) => record.id), retrieveConversation(question).map((entry) => entry.record.id));
  const reserve = prepareRetrieval(question, [], setup.env, RAG_CONSENT).reserve;
  assert.equal((await setup.storage.get('ledger')).trial, reserve + estimatedCost(usage.input_tokens, usage.output_tokens));
});

test('Luna unknown usage retains its reserve without erasing confirmed JEV cost', async (t) => {
  const setup = system(); installFetch(t, setup, { luna: async () => { throw new Error(setup.env.OPENAI_API_KEY); } });
  assert.equal((await call(setup)).status, 503);
  assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna']);
  assert.equal((await setup.storage.get('ledger')).trial, jevCharge + generationReserve);
});

test('only capacity failures trigger one consented Bonsai request and no Luna retry', async (t) => {
  for (const status of [429, 503]) await t.test(String(status), async (t) => {
    const setup = system(); installFetch(t, setup, { luna: async () => new Response('private error', { status }) });
    const response = await call(setup);
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.equal(answer.mode, 'bonsai');
    assert.equal(answer.model, BONSAI_MODEL_ID);
    assert.equal(answer.fallbackReason, 'luna_capacity');
    assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna', 'bonsai']);
    const bonsai = setup.events[3].input;
    assert.equal(bonsai.recordIds.length, 12);
    assert.equal(bonsai.recordIds[0], 'req-6-13-14');
    assert.equal(bonsai.protocolRevision, BONSAI_PROTOCOL_REVISION);
    assert.equal(bonsai.corpusVersion, BUILD_INFO.corpusVersion);
    assert.equal((await setup.storage.get('ledger')).trial, jevCharge + (status === 429 ? 0 : generationReserve));
  });
});

test('authentication, refusal, malformed data, invalid citations, and incompleteness cannot trigger another model', async (t) => {
  const cases = {
    authentication: () => new Response('private auth details', { status: 401 }),
    forbidden: () => new Response('private auth details', { status: 403 }),
    redirect: () => new Response(null, { status: 302, headers: { Location: 'https://other-provider.invalid' } }),
    refusal: () => Response.json({ status: 'completed', usage, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'refused' }] }] }),
    malformed: () => new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
    citation: (ids) => { const parsed = parsedAnswer(ids); parsed.claims[0].recordIds = ['invented-record'];
      return modelResponse(ids, { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }] }); },
    incomplete: () => Response.json({ status: 'incomplete', usage }),
  };
  for (const [name, luna] of Object.entries(cases)) await t.test(name, async (t) => {
    const setup = system(); installFetch(t, setup, { luna });
    assert.equal((await call(setup)).status, 503);
    assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna']);
    const verifiedUsage = ['refusal', 'citation', 'incomplete'].includes(name);
    assert.equal((await setup.storage.get('ledger')).trial,
      jevCharge + (verifiedUsage ? estimatedCost(usage.input_tokens, usage.output_tokens) : generationReserve));
  });
});

test('explicit Bonsai choice runs JEV under the shared cap and never calls Luna', async (t) => {
  const setup = system(); installFetch(t, setup);
  const response = await call(setup, { providerPreference: 'bonsai' });
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.equal(answer.mode, 'bonsai');
  assert.deepEqual(providers(setup), ['turnstile', 'jev', 'bonsai']);
  assert.equal((await setup.storage.get('ledger')).trial, jevCharge);
});

test('explicit Bonsai choice without matching consent cannot dispatch any provider', async (t) => {
  const setup = system(); installFetch(t, setup);
  const response = await call(setup, { providerPreference: 'bonsai', bonsaiConsent: true });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'consent');
  assert.deepEqual(providers(setup), []);
  assert.equal(await setup.storage.get('ledger'), undefined);
});

test('exhausted budget uses zero-cost Bonsai only with consent while preserving duplicate and visitor limits', async (t) => {
  // All requests exercise the same visitor minute even if the suite crosses a
  // real minute boundary. The mock is restored automatically after this test.
  t.mock.method(Date, 'now', () => Date.parse('2026-09-26T12:30:15.000Z'));
  const setup = system(); await exhaustBudget(setup); installFetch(t, setup);
  const requestId = crypto.randomUUID();
  const response = await call(setup, { requestId });
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.equal(answer.mode, 'bonsai');
  assert.equal(answer.fallbackReason, 'app_budget');
  assert.deepEqual(answer.retrieval, { method: 'lexical', status: 'unavailable' });
  assert.deepEqual(providers(setup), ['turnstile', 'bonsai']);
  const duplicate = await call(setup, { requestId });
  assert.equal(duplicate.status, 429);
  assert.equal((await duplicate.json()).error, 'duplicate');
  for (let i = 1; i < LIMITS.perMinute; i++) assert.equal((await call(setup)).status, 200);
  const limited = await call(setup);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, 'rate_limit');
  assert.equal(setup.events.filter((event) => event.provider === 'bonsai').length, LIMITS.perMinute);
  assert.ok(!providers(setup).some((provider) => ['jev', 'luna'].includes(provider)));
  assert.equal((await setup.storage.get('ledger')).trial, LIMITS.trialMicroUsd);
});

test('exhausted budget without Bonsai consent starts no paid or local model', async (t) => {
  const setup = system(); await exhaustBudget(setup); installFetch(t, setup);
  const response = await call(setup, { bonsaiConsent: undefined });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'budget');
  assert.deepEqual(providers(setup), ['turnstile']);
});

test('direct Bonsai at the spending cap remains the chosen model, not a claimed fallback', async (t) => {
  const setup = system(); await exhaustBudget(setup); installFetch(t, setup);
  const response = await call(setup, { providerPreference: 'bonsai' });
  assert.equal(response.status, 200);
  const answer = await response.json();
  assert.equal(answer.mode, 'bonsai');
  assert.equal(answer.fallbackReason, undefined);
  assert.deepEqual(providers(setup), ['turnstile', 'bonsai']);
});

test('previous reported-cost overshoot does not block zero-cost local fallback', async (t) => {
  const setup = system(); await exhaustBudget(setup); installFetch(t, setup);
  const ledger = await setup.storage.get('ledger');
  ledger.trial += 100;
  await setup.storage.put('ledger', ledger);
  assert.equal((await call(setup)).status, 200);
  assert.deepEqual(providers(setup), ['turnstile', 'bonsai']);
  assert.equal((await setup.storage.get('ledger')).trial, LIMITS.trialMicroUsd + 100);
});

test('concurrent requests stay reserved through a slow Luna-to-Bonsai fallback', async () => {
  const setup = system(), now = Date.now();
  for (let i = 0; i < LIMITS.concurrent; i++) {
    assert.equal((await setup.gate.reserve(`active-${i}`, `visitor-${i}`, 1000, now)).ok, true);
  }
  assert.equal((await setup.gate.reserve('fifth', 'other-visitor', 1000, now + 150000)).code, 'busy');
});

test('Bonsai cannot invent sources or discard mandatory format scope', async (t) => {
  for (const kind of ['unknown', 'format-context']) await t.test(kind, async (t) => {
    const setup = system({ bonsai: (input) => {
      const recordIds = kind === 'unknown' ? ['invented-record'] : [input.recordIds.find((id) => {
        const candidate = retrieveConversation('Er PDF/A-3 akseptert ved avlevering?', [], 24).find((entry) => entry.record.id === id);
        return candidate?.record.source === 'na-formats';
      })];
      return { recordIds, parsed: parsedAnswer(recordIds), model: BONSAI_MODEL_ID,
        corpusVersion: BUILD_INFO.corpusVersion, protocolRevision: BONSAI_PROTOCOL_REVISION };
    } });
    installFetch(t, setup, { luna: () => new Response('capacity', { status: 429 }) });
    assert.equal((await call(setup, { question: 'Er PDF/A-3 akseptert ved avlevering?' })).status, 503);
    assert.deepEqual(providers(setup), ['turnstile', 'jev', 'luna', 'bonsai']);
  });
});
