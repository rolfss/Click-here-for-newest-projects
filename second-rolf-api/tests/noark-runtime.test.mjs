import { it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { LunaGate, estimatedCost } from '../../noark-api/worker.mjs';
import { RAG_CONSENT } from '../../noark-api/retrieval.mjs';

const syntheticEnv = { OPENAI_API_KEY: 'synthetic-openai-key', TURNSTILE_SECRET_KEY: 'synthetic-bot-secret' };
const origin = 'https://rolfss.github.io';
afterEach(() => vi.restoreAllMocks());

function parsed(ids) {
  return { status: 'answered', claims: [{ text: 'systemID er en identifikator.', recordIds: [ids[0]] }], limitation: '',
    relevance: ids.map((recordId, index) => ({ recordId, score: 95 - index, reason: 'Kilden beskriver spørsmålet.' })) };
}

// Run LunaGate with actual workerd Durable Object storage and native Request /
// Response objects. Only provider replies are synthetic. In particular, do not
// let a plain fetch mock hide unsupported workerd RequestInit values: the former
// redirect:'error' setting threw here before any provider could be contacted.
async function chat(settings = {}, options = {}) {
  const stub = env.LOCAL_RELAY.getByName(`noark-runtime-${crypto.randomUUID()}`);
  return runInDurableObject(stub, async (_relay, state) => {
    const gate = new LunaGate(state, { ...syntheticEnv, ...settings });
    const result = await gate.fetch(new Request('https://internal/chat', { method: 'POST', body: JSON.stringify({
      question: 'Hva er systemID?', history: [], requestId: crypto.randomUUID(),
      ip: '203.0.113.30', origin, turnstileToken: 'synthetic-token', ...options,
    }) }));
    return { status: result.status, body: await result.json(), ledger: await state.storage.get('ledger') };
  });
}

function interceptProviders({ jevStatus = 200, lunaStatus = 200 } = {}) {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    // This constructor is workerd's actual parser, not Node's implementation.
    const outgoing = new Request(url, init);
    const body = await outgoing.json();
    calls.push({ url: outgoing.url, redirect: outgoing.redirect, body });
    if (outgoing.url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return Response.json({ success: true, action: 'noark-chat', hostname: 'rolfss.github.io' });
    }
    expect(outgoing.redirect).toBe('manual');
    if (outgoing.url === 'https://api.typesafe.ai/v1/systemone') {
      if (jevStatus !== 200) return new Response('synthetic error', { status: jevStatus, headers: { Location: 'https://example.invalid/never-follow' } });
      return Response.json({ answers: Object.fromEntries(body.state.records.map((_record, i) => [`r${i}`, { type: 'noul', noul: 0.8 }])),
        usage: { input_tokens: 700, output_tokens: 160 } });
    }
    expect(outgoing.url).toBe('https://api.openai.com/v1/responses');
    if (lunaStatus !== 200) return new Response('synthetic error', { status: lunaStatus, headers: { Location: 'https://example.invalid/never-follow' } });
    const ids = JSON.parse(body.input[0].content).source_records.map(record => record.id);
    return Response.json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 200 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed(ids)) }] }] });
  });
  return calls;
}

it('legacy NOARK chat succeeds in workerd with JEV disabled and no new consent', async () => {
  const calls = interceptProviders();
  const result = await chat();
  expect(result.status).toBe(200);
  expect(result.body.mode).toBe('luna');
  expect(result.body.retrieval).toEqual({ method: 'lexical', status: 'disabled' });
  expect(calls.map(call => new URL(call.url).host)).toEqual(['challenges.cloudflare.com', 'api.openai.com']);
  expect(result.ledger.trial).toBe(estimatedCost(1000, 200));
  expect(Object.values(result.ledger.requests)[0].pending).toBe(false);
});

it('consented JEV and Luna request options both parse in workerd and settle the actual shared ledger', async () => {
  const calls = interceptProviders();
  const result = await chat({ JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-typesafe-key' }, {
    ragConsent: RAG_CONSENT,
    question: 'En person ber om alle opplysningene vi har om henne. Hvordan håndterer vi dokumenter som også omtaler andre?',
  });
  expect(result.status).toBe(200);
  expect(result.body.retrieval).toEqual({ method: 'jev', status: 'completed' });
  expect(calls.map(call => new URL(call.url).host)).toEqual(['challenges.cloudflare.com', 'api.typesafe.ai', 'api.openai.com']);
  expect(calls[1].body.state.records).toHaveLength(24);
  expect(JSON.parse(calls[2].body.input[0].content).source_records).toHaveLength(12);
  expect(result.ledger.trial).toBe(860 + estimatedCost(1000, 200));
});

it('runtime-compatible manual redirects are rejected and never forward a credential to the Location host', async () => {
  const calls = interceptProviders({ jevStatus: 302, lunaStatus: 302 });
  const result = await chat({ JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-typesafe-key' }, { ragConsent: RAG_CONSENT });
  expect(result.status).toBe(503);
  expect(result.body.error).toBe('provider');
  expect(calls.map(call => new URL(call.url).host)).toEqual(['challenges.cloudflare.com', 'api.typesafe.ai', 'api.openai.com']);
  expect(calls.slice(1).every(call => call.redirect === 'manual')).toBe(true);
  expect(JSON.stringify(result.body)).not.toContain('synthetic');
});
