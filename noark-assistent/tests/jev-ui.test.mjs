import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BUILD_INFO } from '../data.mjs';
import { MODEL_ID, retrieveConversation, finalizeAnswer, lunaFailureAnswer } from '../rag-shared.mjs';
import { BONSAI_MODEL_ID, aiDisclosure, answerModeLabel, askLuna, bonsaiEnabled, jevEnabled,
  loadLunaStatus, providerNotice, retrievalNotice, validateUiAnswer } from '../luna-client.mjs';

const question = 'Er Noark fortsatt obligatorisk?';
function answer(mode = 'luna') {
  const candidates = retrieveConversation(question);
  const parsed = { status: 'answered', claims: [{ text: 'Se veiledningen om frivillig standard.', recordIds: [candidates[0].record.id] }],
    limitation: '', relevance: candidates.map((r, i) => ({ recordId: r.record.id, score: 90 - i * 5, reason: 'Dekker deler av spørsmålet.' })) };
  const result = finalizeAnswer(question, parsed, candidates);
  return { ...result, mode, model: mode === 'bonsai' ? BONSAI_MODEL_ID : MODEL_ID,
    results: result.results.map((r) => ({ ...r, relevanceMethod: mode })), corpusVersion: BUILD_INFO.corpusVersion };
}
function health(overrides = {}) {
  return { configured: true, model: MODEL_ID, corpusVersion: BUILD_INFO.corpusVersion, siteKey: 'public-bot-check-key',
    retrieval: { provider: 'jev', enabled: true }, fallback: { enabled: true, available: true, model: BONSAI_MODEL_ID }, ...overrides };
}

test('requests send provider consent only for explicit true, independently of logging consent', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    assert.equal(options.credentials, 'omit');
    return Response.json(answer());
  });
  for (const value of [undefined, false, 'true', 1]) {
    await askLuna(question, [], 'token', undefined, { jevConsent: value, bonsaiConsent: value, qualityConsent: true });
    assert.equal(Object.hasOwn(sent.at(-1), 'ragConsent'), false);
    assert.equal(Object.hasOwn(sent.at(-1), 'bonsaiConsent'), false);
    assert.equal(sent.at(-1).qualityConsent, '2026-09-review-v1');
  }
  await askLuna(question, [], 'token', undefined, { jevConsent: true, bonsaiConsent: true });
  assert.equal(sent.at(-1).ragConsent, '2026-09-26-jev-v1');
  assert.equal(sent.at(-1).bonsaiConsent, '2026-09-26-bonsai-v1');
  assert.equal(sent.at(-1).qualityConsent, '');
  await askLuna(question, [], 'token', undefined, { jevConsent: true });
  assert.equal(Object.hasOwn(sent.at(-1), 'bonsaiConsent'), false);
  await askLuna(question, [], 'token', undefined, { bonsaiConsent: true });
  assert.equal(Object.hasOwn(sent.at(-1), 'ragConsent'), false);
});

test('health enables disclosed providers only for recognized boolean configuration', async (t) => {
  let payload = health();
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
  const enabled = await loadLunaStatus();
  assert.equal(jevEnabled(enabled), true);
  assert.equal(bonsaiEnabled(enabled), true);
  assert.match(enabled.message, /JEV kan velge kilder/);
  assert.match(enabled.message, /Bonsai er tilgjengelig/);
  for (const retrieval of [undefined, { enabled: true }, { provider: 'other', enabled: true }, { provider: 'jev', enabled: 'true' }]) {
    payload = health({ retrieval, fallback: undefined });
    const disabled = await loadLunaStatus();
    assert.equal(jevEnabled(disabled), false);
    assert.equal(bonsaiEnabled(disabled), false);
    assert.doesNotMatch(aiDisclosure(disabled).text, /TypeSafe|Bonsai/);
  }
  payload = health({ fallback: { enabled: true, available: true, model: 'unverified-model' } });
  assert.equal(bonsaiEnabled(await loadLunaStatus()), false);
  payload = health({ siteKey: '' });
  const unavailable = await loadLunaStatus();
  assert.equal(unavailable.configured, false);
  assert.equal(jevEnabled(unavailable), false);
  assert.equal(bonsaiEnabled(unavailable), false);
});

test('offline Bonsai remains disclosed when enabled because availability can change', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(health({ fallback: { enabled: true, available: false, model: BONSAI_MODEL_ID } })));
  const status = await loadLunaStatus();
  assert.equal(bonsaiEnabled(status), true);
  assert.match(status.message, /Bonsai-reserven er ikke tilgjengelig/);
  assert.match(aiDisclosure(status).text, /Bonsai/);
});

test('consent disclosure names each actual provider, its role and data destination', () => {
  const disclosure = aiDisclosure(health());
  assert.match(disclosure.label, /Luna \(OpenAI\).*Bonsai.*JEV \(TypeSafe\)/);
  assert.match(disclosure.text, /samtykker/);
  assert.match(disclosure.text, /opptil fire tidligere meldinger.*OpenAI/);
  assert.match(disclosure.text, /relevant kontekst fra dine tidligere spørsmål.*TypeSafe/);
  assert.match(disclosure.text, /privat Cloudflare-forbindelse til appens eiers PC/);
  assert.match(disclosure.text, /Lokalt kildesøk forlater ikke nettleseren/);
  const plain = aiDisclosure(health({ retrieval: { provider: 'jev', enabled: false }, fallback: { enabled: false } }));
  assert.match(plain.label, /Luna \(OpenAI\)/);
  assert.doesNotMatch(plain.text, /TypeSafe|Bonsai|eiers PC/);
});

test('direct Bonsai preference requires explicit Bonsai consent and never defaults on', async (t) => {
  let sent;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    sent = JSON.parse(options.body);
    return Response.json(answer(sent.providerPreference === 'bonsai' ? 'bonsai' : 'luna'));
  });
  for (const options of [{ providerPreference: 'bonsai' }, { bonsaiConsent: 'true', providerPreference: 'bonsai' },
    { bonsaiConsent: true, providerPreference: 'unknown' }]) {
    await assert.rejects(() => askLuna(question, [], 'token', undefined, options), /samtykke|Ukjent svarmodell/);
  }
  assert.equal(calls, 0, 'Never silently send a direct Bonsai request to OpenAI when consent is missing.');
  for (const options of [{}, { bonsaiConsent: true, providerPreference: 'luna' }]) {
    await askLuna(question, [], 'token', undefined, options);
    assert.equal(Object.hasOwn(sent, 'providerPreference'), false);
  }
  await askLuna(question, [], 'token', undefined, { bonsaiConsent: true, providerPreference: 'bonsai' });
  assert.equal(sent.providerPreference, 'bonsai');
  assert.equal(sent.bonsaiConsent, '2026-09-26-bonsai-v1');
});

test('client rejects a different writer or undisclosed provider instead of showing an AI answer', async (t) => {
  let result = answer();
  t.mock.method(globalThis, 'fetch', async () => Response.json(result));
  await assert.rejects(() => askLuna(question, [], 'token', undefined,
    { bonsaiConsent: true, providerPreference: 'bonsai' }), /ikke fra valgt Bonsai/);
  result = answer('bonsai');
  await assert.rejects(() => askLuna(question, [], 'token'), /uten samtykke/);
  result = { ...answer(), retrieval: { method: 'jev', status: 'completed' } };
  await assert.rejects(() => askLuna(question, [], 'token'), /uten samtykke/);
  assert.equal((await askLuna(question, [], 'token', undefined, { jevConsent: true })).mode, 'luna');
  result = { ...answer('bonsai'), retrieval: { method: 'jev', status: 'completed' } };
  const accepted = await askLuna(question, [], 'token', undefined,
    { jevConsent: true, bonsaiConsent: true, providerPreference: 'bonsai' });
  assert.equal(accepted.mode, 'bonsai');
});

test('stale Bonsai capability failures remain failures, never local results labeled as AI', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'consent', message: 'Bonsai krever samtykke og aktiv lokal forbindelse.' }, { status: 400 }));
  let message;
  await assert.rejects(() => askLuna(question, [], 'token', undefined,
    { bonsaiConsent: true, providerPreference: 'bonsai' }), (error) => {
    message = error.message;
    return /Bonsai krever/.test(message);
  });
  const failed = lunaFailureAnswer(question, [], message);
  assert.equal(failed.mode, 'unavailable');
  assert.equal(failed.status, 'insufficient');
  assert.equal(answerModeLabel(failed), 'KI-svar utilgjengelig');
  assert.match(failed.lead, /ikke fått en KI-vurdering/);
  assert.equal(retrievalNotice(failed), '');
  assert.deepEqual(failed.leadCitations, []);
  assert.deepEqual(failed.points, []);
});

test('retrieval metadata validates method and status pairs and accepts old Luna responses', () => {
  assert.equal(validateUiAnswer(answer()).mode, 'luna');
  for (const [method, status] of [['jev', 'completed'], ['lexical', 'unavailable'], ['lexical', 'disabled'], ['lexical', 'not_consented']]) {
    assert.deepEqual(validateUiAnswer({ ...answer(), retrieval: { method, status } }).retrieval, { method, status });
  }
  for (const retrieval of [null, [], {}, { method: 'jev', status: 'unavailable' }, { method: 'lexical', status: 'completed' },
    { method: 'jev', status: 'verified' }]) {
    assert.throws(() => validateUiAnswer({ ...answer(), retrieval }), /status for kildevalg/);
  }
});

test('actual answer and relevance provider must agree with the exact allowed model', () => {
  const cloud = validateUiAnswer(answer());
  assert.equal(cloud.model, 'gpt-6-luna');
  assert.equal(answerModeLabel(cloud), 'GPT-6 Luna · medium');
  const local = validateUiAnswer(answer('bonsai'));
  assert.equal(local.model, BONSAI_MODEL_ID);
  assert.match(answerModeLabel(local), /Bonsai/);
  assert.doesNotMatch(answerModeLabel(local), /Luna/);
  for (const invalid of [
    { ...answer(), model: 'gpt-5.6-luna' },
    { ...answer('bonsai'), model: MODEL_ID },
    { ...answer(), model: BONSAI_MODEL_ID },
    { ...answer('bonsai'), model: 'bonsai-unknown' },
    { ...answer(), mode: 'invented' },
  ]) assert.throws(() => validateUiAnswer(invalid), /Ugyldig svar/);
  const inconsistent = answer('bonsai');
  inconsistent.results[0].relevanceMethod = 'luna';
  assert.throws(() => validateUiAnswer(inconsistent), /kildehenvisninger/);
});

test('Bonsai answers retain source reconstruction and citation validation', () => {
  const result = answer('bonsai');
  result.results[0].url = 'https://untrusted.example/';
  assert.notEqual(validateUiAnswer(result).results[0].url, result.results[0].url);
  result.leadCitations = [99];
  assert.throws(() => validateUiAnswer(result), /påstandshenvisninger/);
});

test('fallback explanations use validated reasons, and direct Bonsai never invents a Luna failure', () => {
  assert.equal(providerNotice(answer('bonsai')), '');
  assert.match(providerNotice(validateUiAnswer({ ...answer('bonsai'), fallbackReason: 'luna_capacity' })), /Luna var utilgjengelig eller hadde nådd bruksgrensen/);
  assert.match(providerNotice(validateUiAnswer({ ...answer('bonsai'), fallbackReason: 'app_budget' })), /prøve- eller periodebudsjett/);
  assert.throws(() => validateUiAnswer({ ...answer('bonsai'), fallbackReason: 'remote-provider-text' }), /reservemodell/);
  assert.throws(() => validateUiAnswer({ ...answer(), fallbackReason: 'luna_capacity' }), /reservemodell/);
});

test('selection notices describe actual writer and degraded selection without claiming verification', () => {
  for (const mode of ['luna', 'bonsai']) {
    const writer = mode === 'luna' ? 'Luna' : 'Bonsai';
    const completed = retrievalNotice({ mode, retrieval: { method: 'jev', status: 'completed' } });
    assert.match(completed, new RegExp(`JEV valgte kildegrunnlaget, og ${writer} skrev svaret`));
    assert.doesNotMatch(completed, /verifisert|garantert/);
    const unavailable = retrievalNotice({ mode, retrieval: { method: 'lexical', status: 'unavailable' } });
    assert.match(unavailable, /JEV var ikke tilgjengelig/);
    assert.match(unavailable, new RegExp(`${writer} skrev svaret`));
  }
  assert.equal(retrievalNotice({ mode: 'local', retrieval: { status: 'completed' } }), '');
  assert.equal(retrievalNotice({ mode: 'luna' }), '');
});

test('UI consent is unchecked after health load and provider consent follows the opt-in control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="use-luna" aria-describedby="ai-disclosure" disabled/);
  assert.match(app, /\$\("#use-luna"\)\.checked = false;/);
  assert.match(app, /jevConsent: jevEnabled\(state\.luna\) && \$\("#use-luna"\)\.checked/);
  assert.match(app, /bonsaiConsent: bonsaiEnabled\(state\.luna\) && \$\("#use-luna"\)\.checked/);
  assert.match(app, /\$\("#answer-provider"\)\.disabled = !active \|\| !bonsaiEnabled\(state\.luna\)/);
  assert.match(app, /\$\("#answer-provider"\)\.value = "luna"/);
  assert.match(html, /id="provider-choice" hidden/);
  assert.match(html, /id="answer-provider" aria-describedby="ai-disclosure" disabled/);
  assert.match(app, /const useAI = state\.luna\.configured === true && allowAI && \$\("#use-luna"\)\.checked/);
  assert.match(app, /const selectionNotice = retrievalNotice\(answer\)/);
  assert.match(app, /allowAI: false/);
  assert.match(html, /Spørsmålsloggen|forbedringsloggen/);
  assert.match(html, /gjelder nye spørsmål sendt med KI, både Luna og Bonsai/);
  assert.doesNotMatch(html, /connect-src[^;]*typesafe/);
});
