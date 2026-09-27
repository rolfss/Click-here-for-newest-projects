import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { LunaGate, LIMITS, buildPayload, estimatedCost, readBounded } from '../worker.mjs';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';

class Storage {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k, v) { this.data.set(k, structuredClone(v)); }
  transaction(fn) {
    const p = this.queue.then(async () => {
      const copy = new Storage(); copy.data = structuredClone(this.data);
      const result = await fn(copy); this.data = copy.data; return result;
    });
    this.queue = p.catch(() => {}); return p;
  }
}
const makeGate = () => { const storage = new Storage(); return { storage, gate: new LunaGate({ storage }, { OPENAI_API_KEY: 'test-only-not-real', TURNSTILE_SECRET_KEY: 'test-bot-secret' }) }; };
const q = 'Hva er systemID?';
const env = { ALLOWED_ORIGINS: 'https://rolfss.github.io', OPENAI_API_KEY: 'dummy', TURNSTILE_SECRET_KEY: 'dummy', TURNSTILE_SITE_KEY: 'public-test-key' };

test('payload fixes Luna, medium, no storage, no tools and bounded output', () => {
  const { body, reserve } = buildPayload(q, [], retrieveConversation(q));
  assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.reasoning.effort, 'medium');
  assert.equal(body.store, false); assert.equal(body.tools, undefined);
  assert.equal(body.max_output_tokens, LIMITS.outputTokens);
  assert.equal(body.service_tier, 'default'); assert.equal(body.text.format.strict, true);
  assert.ok(reserve > estimatedCost(4500, 1500));
  assert.ok(reserve < 30000);
});
test('body reader caps actual bytes without trusting Content-Length', async () => {
  const req = new Request('https://test', { method: 'POST', body: 'x'.repeat(100), headers: { 'Content-Length': '1' } });
  await assert.rejects(() => readBounded(req, 50));
});
test('origins, method, content type and missing configuration fail closed', async () => {
  assert.equal((await worker.fetch(new Request('https://test/api/chat', { method: 'POST' }), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://test/api/chat', { headers: { Origin: 'https://rolfss.github.io' } }), env)).status, 405);
  const headers = { Origin: 'https://rolfss.github.io', 'Content-Type': 'text/plain' };
  assert.equal((await worker.fetch(new Request('https://test/api/chat', { method: 'POST', headers, body: '{}' }), env)).status, 415);
  assert.equal((await worker.fetch(new Request('https://test/api/chat', { method: 'POST', headers, body: '{}' }), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS })).status, 503);
});
test('health never leaks credentials and reports the active daily budget', async () => {
  const res = await worker.fetch(new Request('https://test/api/health'), env);
  const body = await res.json();
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /dummy|OPENAI_API_KEY|SECRET/); assert.match(text, /gpt-6-luna/);
  assert.equal(body.dailyBudgetUsd, 2);
});
test('concurrent reservations cannot cross the $2 daily budget even on separate gate instances', async () => {
  const { gate, storage } = makeGate(); const another = new LunaGate({ storage }, {});
  const outcomes = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? gate : another).reserve(`request-${i}`, `ip-${i}`, 900000)));
  assert.equal(outcomes.filter((r) => r.ok).length, 2);
  assert.equal((await storage.get('ledger')).daily, 1800000);
});
test('trial and monthly caps persist across restart and day boundary', async () => {
  const { gate, storage } = makeGate();
  const now = Date.parse('2026-09-07T12:00:00Z');
  await gate.reserve('seed', 'ip', 1000, now);
  const ledger = await storage.get('ledger'); ledger.trial = 5999900; await storage.put('ledger', ledger);
  const restarted = new LunaGate({ storage }, {});
  assert.equal((await restarted.reserve('next', 'other', 1000, now + 86400000)).code, 'budget');
  ledger.trial = 0; ledger.months['2026-09'] = 5999900; await storage.put('ledger', ledger);
  assert.equal((await restarted.reserve('next2', 'other', 1000, now + 86400000)).code, 'budget');
});
test('settlement refunds only confirmed unused tokens and is idempotent', async () => {
  const { gate, storage } = makeGate(); await gate.reserve('request', 'ip', 20000);
  await gate.settle('request', 2000); await gate.settle('request', 0);
  assert.equal((await storage.get('ledger')).trial, 2000);
});
test('unknown failures retain their entire reservation', async () => {
  const { gate, storage } = makeGate(); await gate.reserve('request', 'ip', 20000); await gate.settle('request');
  assert.equal((await storage.get('ledger')).trial, 20000);
});
test('overshoot in reported usage is recorded, not clipped', async () => {
  const { gate, storage } = makeGate(); await gate.reserve('request', 'ip', 1000); await gate.settle('request', 3000);
  assert.equal((await storage.get('ledger')).trial, 3000);
});
test('rate limits and duplicate prevention do not require browser honesty', async () => {
  const { gate } = makeGate();
  for (let i = 0; i < 5; i++) { assert.equal((await gate.reserve(`r${i}`, 'same-ip', 1000)).ok, true); await gate.settle(`r${i}`, 100); }
  assert.equal((await gate.reserve('r0', 'other-ip', 1000)).code, 'duplicate');
  assert.equal((await gate.reserve('r6', 'same-ip', 1000)).code, 'rate_limit');
});
test('ledger does not store raw IPs, questions, keys or generated answers', async () => {
  const { gate, storage } = makeGate(); await gate.reserve('id', '203.0.113.198', 1000);
  assert.doesNotMatch(JSON.stringify(await storage.get('ledger')), /203\.0\.113\.198|OPENAI|question|content/);
});
test('day rollover with in-flight calls settles against their original month', async () => {
  const { gate, storage } = makeGate();
  await gate.reserve('old', 'ip', 20000, Date.parse('2026-09-30T23:59:50Z'));
  await gate.reserve('new', 'ip', 20000, Date.parse('2026-10-01T00:00:05Z'));
  await gate.settle('old', 5000);
  const state = await storage.get('ledger');
  assert.equal(state.months['2026-09'], 5000); assert.equal(state.months['2026-10'], 20000); assert.equal(state.daily, 20000);
});

test('mocked end-to-end call validates Turnstile, charges usage and returns real source URLs', async (t) => {
  const { gate, storage } = makeGate(); const candidates = retrieveConversation(q);
  const modelResult = { status: 'answered', claims: [{ text: 'systemID er en identifikator.', recordIds: [candidates[0].record.id] }], limitation: '',
    relevance: candidates.map((r, i) => ({ recordId: r.record.id, score: 90 - i * 5, reason: 'Beskriver identifikatorer.' })) };
  let modelCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('turnstile')) return Response.json({ success: true, action: 'noark-chat', hostname: 'rolfss.github.io' });
    modelCalls++; const body = JSON.parse(options.body); assert.equal(body.model, 'gpt-6-luna');
    return Response.json({ status: 'completed', usage: { input_tokens: 4500, output_tokens: 1500 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(modelResult) }] }] });
  });
  const res = await gate.fetch(new Request('https://internal/chat', { method: 'POST', body: JSON.stringify({ question: q, history: [], requestId: 'realistic-id', ip: '127.0.0.1', origin: 'https://rolfss.github.io', turnstileToken: 'test' }) }));
  assert.equal(res.status, 200); assert.equal(modelCalls, 1);
  const a = await res.json(); assert.equal(a.mode, 'luna'); assert.ok(a.results.every((r) => r.url.startsWith('https://')));
  assert.equal((await storage.get('ledger')).trial, estimatedCost(4500, 1500));
});
test('incomplete responses keep metered cost and never trigger automatic retry', async (t) => {
  const { gate, storage } = makeGate(); let modelCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('turnstile')) return Response.json({ success: true, action: 'noark-chat', hostname: 'rolfss.github.io' });
    modelCalls++; return Response.json({ status: 'incomplete', usage: { input_tokens: 4500, output_tokens: 4096 } });
  });
  const r = await gate.fetch(new Request('https://internal/chat', { method: 'POST', body: JSON.stringify({ question: q, history: [], requestId: 'incomplete', ip: 'ip', origin: 'https://rolfss.github.io', turnstileToken: 't' }) }));
  assert.equal(r.status, 503); assert.equal(modelCalls, 1);
  assert.equal((await storage.get('ledger')).trial, estimatedCost(4500, 4096));
});
test('wrong bot-check hostname cannot make a model call or reserve spending', async (t) => {
  const { gate, storage } = makeGate(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ success: true, action: 'noark-chat', hostname: 'evil.example' }); });
  const r = await gate.fetch(new Request('https://internal/chat', { method: 'POST', body: JSON.stringify({ question: q, history: [], requestId: 'r', ip: 'ip', origin: 'https://rolfss.github.io', turnstileToken: 't' }) }));
  assert.equal(r.status, 403); assert.equal(calls, 1); assert.equal(await storage.get('ledger'), undefined);
});
