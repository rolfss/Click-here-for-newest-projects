import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { assertDeploymentHealth, checkDeployment } from '../deploy.mjs';

const health = async () => (await worker.fetch(new Request('https://test/api/health'), {
  ALLOWED_ORIGINS: 'https://rolfss.github.io', OPENAI_API_KEY: 'test-only',
  TURNSTILE_SECRET_KEY: 'test-only', TURNSTILE_SITE_KEY: 'public-test-site-key',
})).json();

test('the actual current Worker health passes deployment verification', async () => {
  assert.equal(assertDeploymentHealth(await health()).configured, true);
});

test('the deployed September 2 Worker must not be reported as successfully updated', () => {
  assert.throws(() => assertDeploymentHealth({
    configured: true, model: 'gpt-5.6-luna', reasoning: 'medium', siteKey: 'public-key',
    corpusVersion: '2026-09-02', dailyBudgetUsd: 2, monthlyBudgetUsd: 6, trialBudgetUsd: 6,
  }), /model, corpusVersion, answerVersion/);
});

test('missing configuration, wrong model and changed budget fail verification', async () => {
  const good = await health();
  for (const change of [{ configured: false }, { siteKey: '' }, { model: 'wrong-model' }, { model: 'gpt-5.6-luna' },
    { dailyBudgetUsd: 3 }, { monthlyBudgetUsd: 7 }, { trialBudgetUsd: 7 }]) {
    assert.throws(() => assertDeploymentHealth({ ...good, ...change }));
  }
});

test('verification polls health only and waits for the deployed answer version', async () => {
  const current = await health();
  const urls = [];
  await checkDeployment({ attempts: 2, pause: async () => {}, fetchImpl: async (url) => {
    urls.push(url);
    return Response.json(urls.length === 1 ? { ...current, answerVersion: 'old' } : current);
  } });
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.endsWith('/api/health')));
});

test('an unavailable deployment exits verification with an error', async () => {
  await assert.rejects(() => checkDeployment({ fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
});

test('full RAG verification requires both JEV and a live compatible Bonsai connection', async () => {
  const base = await health();
  assert.throws(() => assertDeploymentHealth(base, { requireRag: true }), /JEV eller Bonsai/);
  const full = { ...base, retrieval: { provider: 'jev', enabled: true },
    fallback: { enabled: true, available: true, model: 'Bonsai-2-27B-PQ2_0' } };
  assert.equal(assertDeploymentHealth(full, { requireRag: true }), full);
  for (const field of ['enabled', 'available']) assert.throws(() => assertDeploymentHealth({ ...full,
    fallback: { ...full.fallback, [field]: false } }, { requireRag: true }));
});
