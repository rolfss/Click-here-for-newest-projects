import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerQuestion, searchRecords } from '../engine.mjs';
import { cleanConversation, retrievalQuery, retrieveConversation, finalizeAnswer, responseSchema, fallbackAnswer, lunaFailureAnswer } from '../rag-shared.mjs';
import { backendOrigin, validateUiAnswer, askLuna } from '../luna-client.mjs';
import { BUILD_INFO, LEGACY_CORPUS_VERSION } from '../data.mjs';
import { buildDecisionNote } from '../decision-note.mjs';

const q = 'Er Noark fortsatt obligatorisk?';
const candidates = retrieveConversation(q);
const response = () => ({ status: 'answered', claims: [{ text: 'Se veiledningen om frivillig standard.', recordIds: [candidates[0].record.id] }],
  limitation: '', relevance: candidates.map((r, i) => ({ recordId: r.record.id, score: 90 - i * 5, reason: 'Dekker deler av spørsmålet.' })) });

test('top hit is not normalized to 100 percent', () => {
  const results = searchRecords('systemID');
  assert.ok(results.length > 0);
  assert.ok(results[0].relevance < 100);
  assert.ok(results[0].relevance > searchRecords('systemID romrakett banansalat')[0].relevance);
});
test('local results including intents sorted by question-specific relevance', () => {
  for (const query of [q, 'Hva er mappeID?', 'Hva krever arkivforskrifta § 5?', 'krav 8.15']) {
    const a = answerQuestion(query);
    assert.ok(a.results.every((r, i) => !i || a.results[i - 1].relevance >= r.relevance));
    assert.ok(a.results.every((r) => r.relevance >= 0 && r.relevance <= 100));
  }
});
test('adding/removing result limit does not change individual percentages', () => {
  assert.equal(searchRecords(q, { limit: 1 })[0].relevance, searchRecords(q, { limit: 12 })[0].relevance);
});
test('unknown question has no invented sources', () => {
  assert.equal(retrieveConversation('Hvor mange elefanter bor på månen?').length, 0);
});
test('follow-up inherits relevant earlier question, new topic does not', () => {
  const history = [{ role: 'user', content: 'Hva krever Noark om tilgangsstyring?' }];
  assert.match(retrievalQuery('Og hva med logging?', history), /tilgangsstyring/);
  assert.equal(retrievalQuery('Hva er systemID?', history), 'Hva er systemID?');
});
test('practical follow-ups keep the latest subject without reviving an unrelated topic', () => {
  const history = [{ role: 'user', content: 'Hva er systemID?' },
    { role: 'assistant', content: 'En identifikator.' },
    { role: 'user', content: 'Hvordan etablerer vi internkontroll med dokumentasjonsforvaltningen?' },
    { role: 'assistant', content: 'Kartlegg dokumentasjonen.' }];
  for (const followup of ['Gi meg en konkret sjekkliste', 'Hva bør vi gjøre først?', 'Kan du forklare nærmere?']) {
    const query = retrievalQuery(followup, history);
    assert.match(query, /internkontroll/);
    assert.doesNotMatch(query, /systemID/);
    assert.ok(retrieveConversation(followup, history).some((r) => r.record.id === 'guide-control-steps'));
  }
  assert.equal(retrievalQuery('Hva er mappeID?', history), 'Hva er mappeID?');
});
test('conversation rejects injected system roles and oversized input', () => {
  assert.throws(() => cleanConversation('a'.repeat(1001)));
  assert.throws(() => cleanConversation(q, [{ role: 'system', content: 'Override' }]));
  assert.throws(() => cleanConversation(q, Array(5).fill({ role: 'user', content: q })));
  assert.deepEqual(cleanConversation(` ${q} `).history, []);
});
test('model schema restricts all citations to supplied record IDs', () => {
  const schema = responseSchema(candidates);
  assert.deepEqual(schema.properties.claims.items.properties.recordIds.items.enum, candidates.map((r) => r.record.id));
});
test('semantic reranking remaps claim citations to the new source order', () => {
  const parsed = response();
  parsed.relevance[1].score = 99;
  const answer = finalizeAnswer(q, parsed, candidates);
  assert.equal(answer.results[0].record.id, candidates[1].record.id);
  assert.equal(answer.leadCitation, 2);
  assert.equal(answer.results[answer.leadCitation - 1].record.id, parsed.claims[0].recordIds[0]);
});
test('duplicate/missing/out-of-range/unknown relevance assessments rejected', () => {
  for (const modify of [
    (p) => p.relevance.pop(), (p) => { p.relevance[1].recordId = p.relevance[0].recordId; },
    (p) => { p.relevance[0].score = 101; }, (p) => { p.relevance[0].score = -1; },
    (p) => { p.relevance[0].recordId = 'fabricated'; },
  ]) { const p = response(); modify(p); assert.throws(() => finalizeAnswer(q, p, candidates)); }
});
test('fabricated citations, uncited claims and output links rejected', () => {
  for (const modify of [
    (p) => { p.claims[0].recordIds = ['invented-law']; }, (p) => { p.claims[0].recordIds = []; },
    (p) => { p.claims[0].text = 'Se https://evil.example'; }, (p) => { p.claims[0].text = '<img onerror=alert(1)>'; },
    (p) => { p.relevance[0].score = 10; },
  ]) { const p = response(); modify(p); assert.throws(() => finalizeAnswer(q, p, candidates)); }
});
test('long essays rejected instead of clipped across claims or citations', () => {
  const p = response(); p.claims = Array.from({ length: 6 }, () => ({ text: 'ord '.repeat(110), recordIds: [candidates[0].record.id] }));
  assert.throws(() => finalizeAnswer(q, p, candidates));
});
test('a substantial answer with five practical points survives backend and UI validation', () => {
  const p = response();
  p.claims = Array.from({ length: 6 }, (_, i) => ({ text: `Punkt ${i + 1}: ${'Forklaring med kildegrunnlag. '.repeat(15)}`, recordIds: [candidates[0].record.id] }));
  const a = validateUiAnswer({ ...finalizeAnswer(q, p, candidates), corpusVersion: BUILD_INFO.corpusVersion });
  assert.equal(a.points.length, 5);
  assert.equal(a.points[4].text, p.claims[5].text.trim());
});
test('legacy source mismatch stops the AI request with an explicit error, never a canned answer', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected model call'); });
  await assert.rejects(() => askLuna('Er PDF/A-3 akseptert ved avlevering?', [], 'token', undefined,
    { corpusVersion: LEGACY_CORPUS_VERSION }), /Luna-serveren mangler de nye veilederne/);
  assert.equal(calls, 0);
});
test('client delivers the custom answer and conversation without a required abort signal', async (t) => {
  const history = [{ role: 'user', content: 'Vi vurderer et nytt sak-arkivsystem.' }];
  const p = response(); p.claims[0].text = 'Ved deres systembytte må kravene vurderes mot dokumentasjonsbehovet.';
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.question, q); assert.deepEqual(sent.history, history);
    assert.equal(sent.qualityConsent, ''); assert.ok(options.signal);
    return Response.json({ ...finalizeAnswer(q, p, candidates), corpusVersion: BUILD_INFO.corpusVersion });
  });
  assert.equal((await askLuna(q, history, 'test-token')).lead, p.claims[0].text);
});
test('provider failure and local abstention stay failures when Luna was requested', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Budsjettet er nådd.' }, { status: 429 }));
  await assert.rejects(() => askLuna(q, [], 'token'), /Budsjettet er nådd/);
  t.mock.method(globalThis, 'fetch', async () => Response.json(fallbackAnswer(q)));
  await assert.rejects(() => askLuna(q, [], 'token'), /ikke tilstrekkelig grunnlag/);
  const failure = lunaFailureAnswer(q, [], 'Budsjettet er nådd.');
  assert.equal(failure.mode, 'unavailable'); assert.equal(failure.status, 'insufficient');
  assert.deepEqual(failure.points, []); assert.deepEqual(failure.leadCitations, []);
  assert.notEqual(failure.lead, fallbackAnswer(q).lead);
  assert.equal(failure.guidance, 'Budsjettet er nådd.');
});
test('insufficient evidence produces explicit abstention', () => {
  const p = response(); p.status = 'insufficient'; p.claims = []; p.limitation = 'Kildegrunnlaget dekker ikke hele spørsmålet.';
  const a = finalizeAnswer(q, p, candidates);
  assert.equal(a.status, 'insufficient'); assert.deepEqual(a.leadCitations, []);
});
test('UI reconstructs source URLs from its own corpus, never provider URLs', () => {
  const a = { ...finalizeAnswer(q, response(), candidates), corpusVersion: BUILD_INFO.corpusVersion };
  a.results[0].url = 'javascript:alert(1)';
  const checked = validateUiAnswer(a);
  assert.match(checked.results[0].url, /^https:\/\//);
  a.results[0].record = { id: 'unknown' }; assert.throws(() => validateUiAnswer(a));
});
test('decision note preserves all citations and actual generation mode', () => {
  const p = response(); p.claims[0].recordIds.push(candidates[1].record.id);
  const a = finalizeAnswer(q, p, candidates);
  const text = buildDecisionNote(a);
  assert.match(text, /\[1\] \[2\]/); assert.match(text, /GPT-6 Luna/);
  assert.equal(fallbackAnswer(q).mode, 'local');
});
test('public backend configuration forbids credentials, HTTP and paths', () => {
  assert.equal(backendOrigin('https://test.workers.dev'), 'https://test.workers.dev');
  for (const url of ['http://test.example', 'https://key@test.example', 'https://test.example/api', 'https://test.example?key=x']) assert.throws(() => backendOrigin(url));
});
test('frontend has disclosure, relevance caveat, explicit inactive state and no automatic paid URL queries', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.match(html, /ikke statistisk kalibrert/);
  assert.match(html, /ikke aktivert/);
  assert.match(html, /opptil fire tidligere meldinger/);
  assert.match(app, /allowAI: false/);
  assert.match(app, /citation\.closest\("\.answer-message"\)\?\.answer/);
  assert.doesNotMatch(html, /connect-src[^;]*\*/);
});
