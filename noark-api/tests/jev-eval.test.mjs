import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { evaluate, rankingMetrics, parseArgs, main } from '../evals/evaluate-jev.mjs';
import { EVAL_CASES } from '../evals/jev-fixtures.mjs';

const apiKey = 'synthetic-test-secret-not-a-real-key';
const inDomain = EVAL_CASES.find(x => x.claims.length);
const outside = EVAL_CASES.find(x => !x.relevantRecordIds.length);
const fakeFetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  assert.doesNotMatch(options.body, /"relevantRecordIds"|"supported"\s*:/);
  return Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map((key, i) =>
    [key, { type: 'noul', noul: i ? 0.7 : 0.9 }])), usage: { input_tokens: 100, output_tokens: 20 } });
};

test('offline evaluation uses real retrieval, reports holdouts and never calls a provider even with keys', async () => {
  const result = await evaluate({ apiKey, openaiKey: apiKey,
    fetchImpl: () => assert.fail('Offline evaluation attempted network access') });
  assert.equal(result.mode, 'offline');
  assert.equal(result.requestsMade, 0);
  assert.equal(result.status, 'live_not_run');
  assert.equal(result.cases.length, EVAL_CASES.length);
  assert.equal(result.summary.lexical.count, EVAL_CASES.filter(x => x.relevantRecordIds.length).length);
  assert.equal(result.summary.jevVsLexical.jev.count, 0);
  assert.equal(result.splits.holdout.lexical.count, 2);
  assert.equal(result.cases.find(x => x.id === outside.id).jev.status, 'no_candidates');
  assert.ok(result.plan.requests > 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
});

test('missing keys and request ceiling stop live mode before any network call', async () => {
  const fetchImpl = () => assert.fail('Preflight dispatched a request');
  await assert.rejects(evaluate({ live: true, fetchImpl }), /TYPESAFE_API_KEY/);
  await assert.rejects(evaluate({ live: true, apiKey, maxRequests: 1, fetchImpl }), /max-requests/);
  await assert.rejects(evaluate({ live: true, compareLuna: true, apiKey, maxRequests: 60, fetchImpl }), /OPENAI_API_KEY/);
  await assert.rejects(evaluate({ compareLuna: true, fetchImpl }), /explicit live/);
});

test('successful simulated run reports calls, usage, rankings, and citation judgments separately', async () => {
  const result = await evaluate({ cases: [inDomain, outside], live: true, apiKey, fetchImpl: fakeFetch });
  assert.equal(result.status, 'completed');
  assert.equal(result.requestsMade, 2);
  assert.deepEqual(result.usage.typesafe, { input_tokens: 200, output_tokens: 40 });
  assert.deepEqual(result.usage.openai, { input_tokens: 0, output_tokens: 0 });
  assert.equal(result.calls.length, 2);
  assert.ok(result.calls.every(x => x.status === 'completed' && x.elapsedMs >= 0));
  assert.equal(result.cases[0].jev.status, 'completed');
  assert.equal(result.summary.citations.count, inDomain.claims.length);
  assert.equal(result.cases[1].jev.status, 'no_candidates');
  assert.equal(result.summary.jevVsLuna.luna.count, 0);
});

test('provider failure stops paid work without retry, exposing no raw message or fake credential', async () => {
  let calls = 0;
  const result = await evaluate({ live: true, apiKey, fetchImpl: async () => {
    calls++; throw new Error(`Provider echoed ${apiKey}`);
  } });
  assert.equal(result.status, 'incomplete');
  assert.equal(calls, 1);
  assert.equal(result.requestsMade, 1);
  assert.equal(result.calls[0].status, 'failed');
  assert.equal(result.errors.length, 1);
  assert.equal(result.usageIsComplete, false);
  assert.ok(result.cases.slice(1).some(x => x.jev.status === 'not_run'));
  assert.doesNotMatch(JSON.stringify(result), /Provider echoed|synthetic-test-secret/);
});

test('metrics count missed evidence and duplicate IDs correctly instead of normalizing the best hit', () => {
  const value = rankingMetrics(['wrong', 'a', 'a', 'b'], ['a', 'b', 'absent']);
  assert.equal(value.hitAt1, 0);
  assert.equal(value.recallAt3, 1 / 3);
  assert.equal(value.recallAt5, 2 / 3);
  assert.equal(value.reciprocalRank, 0.5);
  assert.equal(rankingMetrics([], ['missing']).reciprocalRank, 0);
  assert.equal(rankingMetrics([], []), null);
});

test('argument parser defaults to offline and rejects unrecognized, secret, and incomplete flags', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['--live', '--split', 'holdout', '--max-requests', '4']),
    { live: true, split: 'holdout', maxRequests: 4 });
  for (const args of [['--api-key', apiKey], ['--model'], ['--split', 'private'], ['--output']])
    assert.throws(() => parseArgs(args));
});

test('out-of-domain-only live run makes no calls', async () => {
  const result = await evaluate({ cases: [outside], live: true, apiKey,
    fetchImpl: () => assert.fail('Out-of-domain query caused paid work') });
  assert.equal(result.plan.requests, 0);
  assert.equal(result.requestsMade, 0);
});

test('unsafe run settings are rejected', async () => {
  for (const options of [{ threshold: NaN }, { threshold: 1.1 }, { maxRequests: 0 },
    { maxRequests: 61 }, { maxRequests: 1.5 }, { model: 'https://alternate.test' }])
    await assert.rejects(evaluate(options));
});

test('optional Luna comparison reports only paired completed rankings and combined request count', async () => {
  const result = await evaluate({ cases: [inDomain], live: true, compareLuna: true, apiKey, openaiKey: apiKey,
    fetchImpl: async (url, options) => {
      if (url.includes('typesafe.ai')) return fakeFetch(url, options);
      const request = JSON.parse(options.body);
      const sources = JSON.parse(request.input[0].content).source_records;
      const parsed = { status: 'insufficient', claims: [], limitation: apiKey,
        relevance: sources.map((x, i) => ({ recordId: x.id, score: 90 - i, reason: 'Relevant kildepost.' })) };
      return Response.json({ status: 'completed', usage: { input_tokens: 200, output_tokens: 40 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }] });
    } });
  assert.equal(result.requestsMade, 3);
  assert.equal(result.summary.jevVsLuna.jev.count, 1);
  assert.equal(result.summary.jevVsLuna.luna.count, 1);
  assert.deepEqual(result.usage.openai, { input_tokens: 200, output_tokens: 40 });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
});

test('CLI rejects an existing output or missing parent before any live provider request', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-eval-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('jev-eval-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  const existing = join(directory, 'existing.json');
  await writeFile(existing, 'preserve');
  let error = '';
  t.mock.method(console, 'error', value => { error = value; });
  t.mock.method(globalThis, 'fetch', () => assert.fail('Output preflight triggered paid work'));
  assert.equal(await main(['--live', '--output', existing]), 1);
  assert.match(error, /already exists/);
  assert.equal(await main(['--live', '--output', join(directory, 'missing', 'report.json')]), 1);
  assert.match(error, /directory is missing/);
});
