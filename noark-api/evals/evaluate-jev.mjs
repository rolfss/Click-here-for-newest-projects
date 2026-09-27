import { access, lstat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILD_INFO } from '../../noark-assistent/data.mjs';
import { getRecord, getSource, sourceUrl } from '../../noark-assistent/engine.mjs';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';
import { JEV_LIMITS, buildRerankRequest, buildCitationRequest, selectReranked, callJev } from '../jev-rag.mjs';
import { evaluateLuna } from './luna-baseline.mjs';
import { EVAL_CASES } from './jev-fixtures.mjs';

export class EvaluationSetupError extends Error {}

export function rankingMetrics(ids, relevantIds) {
  const gold = new Set(relevantIds);
  if (!gold.size) return null;
  const recall = k => new Set(ids.slice(0, k).filter(id => gold.has(id))).size / gold.size;
  const first = ids.findIndex(id => gold.has(id));
  return { hitAt1: first === 0 ? 1 : 0, recallAt3: recall(3), recallAt5: recall(5),
    recallAt12: recall(12), reciprocalRank: first < 0 ? 0 : 1 / (first + 1) };
}

function aggregate(values) {
  const rows = values.filter(Boolean);
  if (!rows.length) return { count: 0 };
  return { count: rows.length, ...Object.fromEntries(Object.keys(rows[0]).map(key =>
    [key, rows.reduce((sum, row) => sum + row[key], 0) / rows.length])) };
}

function citationSources(claims) {
  return [...new Set(claims.flatMap(claim => claim.recordIds))].map(id => {
    const record = getRecord(id);
    if (!record) throw new EvaluationSetupError('A fixture cites a record outside the curated corpus.');
    return { record, source: getSource(record.source), url: sourceUrl(record) };
  });
}

function summarize(rows) {
  const reranked = rows.filter(row => row.jev?.metrics);
  const compared = rows.filter(row => row.jev?.metrics && row.luna?.metrics);
  const claims = rows.flatMap(row => row.citations?.results ?? []);
  return {
    lexical: aggregate(rows.map(row => row.lexical.metrics)),
    jevVsLexical: { lexical: aggregate(reranked.map(row => row.lexical.metrics)),
      jev: aggregate(reranked.map(row => row.jev.metrics)) },
    jevVsLuna: { jev: aggregate(compared.map(row => row.jev.metrics)),
      luna: aggregate(compared.map(row => row.luna.metrics)) },
    citations: { count: claims.length,
      truePositive: claims.filter(x => x.expectedSupported && x.predictedSupported).length,
      trueNegative: claims.filter(x => !x.expectedSupported && !x.predictedSupported).length,
      falsePositive: claims.filter(x => !x.expectedSupported && x.predictedSupported).length,
      falseNegative: claims.filter(x => x.expectedSupported && !x.predictedSupported).length },
  };
}

export async function evaluate({ cases = EVAL_CASES, live = false, compareLuna = false,
  apiKey, openaiKey, maxRequests = 20, threshold = 0.8, model = 'jev-latest', fetchImpl = fetch } = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 60)
    throw new EvaluationSetupError('max-requests must be an integer from 1 to 60.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new EvaluationSetupError('threshold must be a number from 0 to 1.');
  if (!/^jev-[a-zA-Z0-9._-]{1,64}$/.test(model)) throw new EvaluationSetupError('Use a valid JEV model identifier.');
  if (compareLuna && !live) throw new EvaluationSetupError('compare-luna requires explicit live mode.');

  // Prepare the entire bounded plan before any network call or credential use.
  const plans = cases.map(item => {
    const baseline = retrieveConversation(item.question, item.history, JEV_LIMITS.selected);
    const pool = retrieveConversation(item.question, item.history, JEV_LIMITS.candidatePool);
    const rankPayload = pool.length ? buildRerankRequest(item.question, item.history, pool, { model }) : null;
    const citationPayload = item.claims.length ? buildCitationRequest(item.claims, citationSources(item.claims), { model }) : null;
    return { item, baseline, pool, rankPayload, citationPayload };
  });
  const planned = plans.reduce((sum, p) => sum + Number(Boolean(p.rankPayload)) + Number(Boolean(p.citationPayload)) +
    Number(compareLuna && p.baseline.length > 0), 0);
  if (live && planned > maxRequests) throw new EvaluationSetupError('Planned requests exceed max-requests; no calls were made.');
  if (live && (typeof apiKey !== 'string' || apiKey.trim().length < 12))
    throw new EvaluationSetupError('Live evaluation needs TYPESAFE_API_KEY in the local process environment. Never put it in chat or command arguments.');
  if (compareLuna && (typeof openaiKey !== 'string' || openaiKey.trim().length < 12))
    throw new EvaluationSetupError('Luna comparison also needs OPENAI_API_KEY in the local process environment.');

  const rows = plans.map(({ item, baseline, pool, rankPayload, citationPayload }) => {
    const ids = baseline.map(x => x.record.id);
    const poolIds = pool.map(x => x.record.id);
    return { id: item.id, split: item.split ?? 'development',
      relevantRecordIds: item.relevantRecordIds, candidatePoolIds: poolIds,
      missingFromPool: item.relevantRecordIds.filter(id => !poolIds.includes(id)),
      lexical: { ids, metrics: rankingMetrics(ids, item.relevantRecordIds) },
      jev: { status: rankPayload ? 'not_run' : 'no_candidates' },
      citations: { status: citationPayload ? 'not_run' : 'no_claims' },
      luna: { status: compareLuna && baseline.length ? 'not_run' : 'not_requested' } };
  });
  const report = { schemaVersion: 1, mode: live ? 'live' : 'offline', corpusVersion: BUILD_INFO.corpusVersion,
    configuredJevModel: model, citationThreshold: threshold,
    note: 'Synthetic corpus checks only. Retrieval metrics and claim probabilities do not establish legal accuracy or production answer quality.',
    plan: { cases: plans.length, requests: planned, maxRequests, compareLuna },
    requestsMade: 0, usage: { typesafe: { input_tokens: 0, output_tokens: 0 },
      openai: { input_tokens: 0, output_tokens: 0 } }, calls: [], errors: [], cases: rows };

  async function measured(provider, caseId, stage, task) {
    // Increment before dispatch. Failures are never retried or hidden as success.
    report.requestsMade++;
    const started = performance.now();
    const call = { provider, caseId, stage, status: 'failed', elapsedMs: 0 };
    report.calls.push(call);
    try {
      const result = await task();
      for (const key of ['input_tokens', 'output_tokens']) report.usage[provider][key] += result.usage[key];
      call.status = 'completed';
      return result;
    } finally { call.elapsedMs = Math.round(performance.now() - started); }
  }

  if (live) for (const [index, p] of plans.entries()) {
    const row = rows[index];
    let stage = 'rerank';
    try {
      if (p.rankPayload) {
        const result = await measured('typesafe', p.item.id, stage, () => callJev(p.rankPayload, { apiKey, fetchImpl }));
        const ranked = selectReranked(p.pool, result.answers);
        const ids = ranked.map(x => x.record.id);
        row.jev = { status: 'completed', ids, metrics: rankingMetrics(ids, p.item.relevantRecordIds),
          scores: ranked.map(x => ({ recordId: x.record.id, probability: x.jevProbability })) };
      }
      stage = 'citations';
      if (p.citationPayload) {
        const result = await measured('typesafe', p.item.id, stage, () => callJev(p.citationPayload, { apiKey, fetchImpl }));
        row.citations = { status: 'completed', results: p.item.claims.map((claim, i) => ({
          id: claim.id, expectedSupported: claim.supported, probability: result.answers[`c${i}`].noul,
          predictedSupported: result.answers[`c${i}`].noul >= threshold })) };
      }
      stage = 'luna';
      if (compareLuna && p.baseline.length) {
        const result = await measured('openai', p.item.id, stage, () =>
          evaluateLuna(p.item.question, p.item.history, p.baseline, { apiKey: openaiKey, fetchImpl }));
        const ids = result.candidates.map(x => x.record.id);
        row.luna = { status: 'completed', ids, metrics: rankingMetrics(ids, p.item.relevantRecordIds) };
      }
    } catch {
      row[stage === 'rerank' ? 'jev' : stage] = { status: 'failed' };
      report.errors.push({ caseId: p.item.id, stage, message: 'Provider call or response validation failed. No automatic retry; later cases were not run.' });
      break;
    }
  }
  report.status = report.errors.length ? 'incomplete' : live ? 'completed' : 'live_not_run';
  report.usageIsComplete = report.errors.length === 0;
  report.summary = summarize(rows);
  report.splits = Object.fromEntries(['development', 'holdout'].map(split =>
    [split, summarize(rows.filter(row => row.split === split))]));
  return report;
}

export function parseArgs(args) {
  const options = {};
  const values = new Map([['--output', 'output'], ['--model', 'model'], ['--max-requests', 'maxRequests'],
    ['--threshold', 'threshold'], ['--split', 'split']]);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') options.live = true;
    else if (args[i] === '--compare-luna') options.compareLuna = true;
    else if (args[i] === '--help') options.help = true;
    else if (values.has(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = values.get(args[i]);
      options[key] = ['maxRequests', 'threshold'].includes(key) ? Number(args[++i]) : args[++i];
    } else throw new EvaluationSetupError('Unknown option or missing value. Use --help.');
  }
  if (options.split && !['development', 'holdout', 'all'].includes(options.split))
    throw new EvaluationSetupError('split must be development, holdout, or all.');
  return options;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log('node noark-api/evals/evaluate-jev.mjs [--live] [--compare-luna] [--split development|holdout|all] [--model jev-latest] [--max-requests 20] [--threshold 0.8] [--output report.json]\nDefault: offline, no network or credentials. --live sends synthetic fixtures to TypeSafe; --compare-luna additionally calls the existing Luna model. Keys only from process environment. Requests are bounded and never retried; this is not a dollar budget.');
      return 0;
    }
    if (options.output) {
      const destination = resolve(options.output);
      try {
        await lstat(destination);
        throw new EvaluationSetupError('Output file already exists. Choose a new filename; no calls were made.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await access(dirname(destination), constants.W_OK); }
      catch { throw new EvaluationSetupError('Output directory is missing or not writable; no calls were made.'); }
    }
    const cases = options.split && options.split !== 'all' ? EVAL_CASES.filter(x => x.split === options.split) : EVAL_CASES;
    const report = await evaluate({ ...options, cases, apiKey: process.env.TYPESAFE_API_KEY,
      openaiKey: process.env.OPENAI_API_KEY });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    // Preserve the sanitized report even if the destination becomes unwritable mid-run.
    console.log(json);
    if (options.output) await writeFile(resolve(options.output), json, { encoding: 'utf8', flag: 'wx' });
    return report.errors.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof EvaluationSetupError ? error.message :
      'Evaluation could not complete or save its report. Check fixtures and use a new output filename. No credentials or provider error bodies were printed.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
