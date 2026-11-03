import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';

const visibleText = (answer) => normalize([answer.lead, ...answer.points.map((point) => point.text)].join(' '));

function localAnswer(question, expectedId) {
  const hits = searchRecords(question, { limit: 4 });
  assert.ok(hits.some(({ record }) => record.id === expectedId),
    `${question}: relevant source is missing from the first four search results`);
  const answer = answerQuestion(question);
  assert.equal(answer.status, 'ok');
  assert.ok(answer.results.some(({ record }) => record.id === expectedId),
    `${question}: relevant source is missing from the local answer`);
  return answer;
}

function modelEvidence(question, expectedId, history = []) {
  const candidates = retrieveConversation(question, history);
  assert.ok(candidates.length <= 12);
  const payload = buildPayload(question, history, candidates);
  const input = JSON.parse(payload.body.input[0].content);
  const evidence = input.source_records.find(({ id }) => id === expectedId);
  assert.ok(evidence, `${question}: required evidence is missing from the actual model input`);
  assert.ok(evidence.section && evidence.publisher && evidence.sourceTitle,
    'The model must receive provenance with the factual qualification');
  return normalize(`${evidence.summary} ${evidence.detail}`);
}

test('a SIARD question retains the special-reasons and agreement conditions for Noark 5', () => {
  const question = 'Kan vi velge SIARD når vi avleverer fra Noark 5?';
  const answer = localAnswer(question, 'noark-siard-alternative');
  const text = visibleText(answer);
  assert.match(text, /siard/);
  assert.match(text, /saerlige grunner/);
  assert.match(text, /avtal/);
  const evidence = modelEvidence(question, 'noark-siard-alternative');
  assert.match(evidence, /noark 5/);
  assert.match(evidence, /saerlige grunner/);
  assert.match(evidence, /avtal/);
});

test('a Noark 4 SIARD question preserves agreement instead of suggesting unconditional acceptance', () => {
  const question = 'Kan et eldre Noark 4-system avleveres med SIARD?';
  const answer = localAnswer(question, 'noark-siard-alternative');
  const text = visibleText(answer);
  assert.match(text, /noark 4/);
  assert.match(text, /avtal/);
  assert.match(modelEvidence(question, 'noark-siard-alternative'), /noark 4/);
});

test('unresolved extraction errors lead to documentation and explanation, not a blanket cleanup requirement', () => {
  const question = 'Kan vi ta uttrekk selv om arkivet har feil som ikke lar seg rydde?';
  const answer = localAnswer(question, 'noark-extract-cleanup');
  const text = visibleText(answer);
  assert.match(text, /dokumenter/);
  assert.match(text, /forklar/);
  const evidence = modelEvidence(question, 'noark-extract-cleanup');
  assert.match(evidence, /lopende/);
  assert.match(evidence, /database/);
  assert.match(evidence, /komplett|all informasjon/);
});

test('physical security of digital archives reaches the server and its supporting infrastructure', () => {
  const question = 'Hva innebærer fysisk sikring for digitale arkiver i et serverrom?';
  const answer = localAnswer(question, 'guide-physical-security');
  assert.match(visibleText(answer), /digital/);
  const evidence = modelEvidence(question, 'guide-physical-security');
  assert.match(evidence, /server/);
  assert.match(evidence, /strom/);
  assert.match(evidence, /kjol/);
});

test('the section 11 commencement question does not become a section 5 system-requirements answer', () => {
  const question = 'Er arkivlova § 11 om utførsel satt i kraft, eller gjelder tidligere regler?';
  const answer = localAnswer(question, 'rules-section-11-commencement');
  assert.notEqual(answer.intent, 'section-five');
  const text = visibleText(answer);
  assert.match(text, /11/);
  assert.match(text, /ikke.{0,45}(kraft|iverksatt)/);
  assert.match(text, /9/);
  assert.match(text, /bokstav b/);
  const evidence = modelEvidence(question, 'rules-section-11-commencement');
  assert.match(evidence, /innlei|innled/);
  assert.match(evidence, /bokstav b/);
});

test('a general 2026 commencement answer preserves the exception to full commencement', () => {
  const question = 'Når trådte den nye arkivlova i kraft?';
  const answer = localAnswer(question, 'rules-effective');
  const text = visibleText(answer);
  assert.match(text, /2026/);
  assert.match(text, /hovedsak|enkelte|unntak|11.{0,35}ikke/);
  const evidence = modelEvidence(question, 'rules-section-11-commencement');
  assert.match(evidence, /ikke.{0,45}(kraft|iverksatt)/);
});

test('digital delivery distinguishes protected originals from exceptions requiring an application', () => {
  const question = 'Må statlige arkiver alltid avleveres digitalt?';
  const answer = localAnswer(question, 'rules-digital-delivery');
  const text = visibleText(answer);
  assert.match(text, /hovedregel/);
  assert.match(text, /originaler.{0,50}19.{0,70}unntatt/);
  assert.match(text, /andre unntak.{0,40}soknad/);
  assert.doesNotMatch(text, /(?:alt|all|alle).{0,25}papir.{0,35}(?:ma|krever).{0,20}soknad/);
  const evidence = modelEvidence(question, 'rules-digital-delivery');
  assert.match(evidence, /avtal/);
  assert.match(evidence, /19/);
  assert.match(evidence, /20/);
  assert.match(evidence, /soknadsbaserte unntak.{0,75}saerlige tilfeller/);
});

test('older paper material is not covered by an absolute digital-delivery statement', () => {
  const question = 'Kan et statlig papirarkiv fra 1948 avleveres på papir?';
  const answer = localAnswer(question, 'rules-digital-delivery');
  const text = visibleText(answer);
  assert.match(text, /1950/);
  assert.match(text, /analoge originaler/);
  assert.match(text, /1950 eller tidligere.{0,35}unntatt/);
  const evidence = modelEvidence(question, 'rules-digital-delivery');
  assert.match(evidence, /1950 eller tidligere/);
  assert.match(evidence, /kan gjore unntak fra aldersregelen i paragraf 19 forste ledd/);
  assert.match(evidence, /unntaksadgangen omfatter ikke vernet i andre ledd/);
});

test('the section 28 extraction answer keeps its exception even without opening source details', () => {
  const question = 'Kan det avtales unntak fra Noark 5-uttrekk etter § 28?';
  const answer = localAnswer(question, 'noark-extract-section-28');
  const text = visibleText(answer);
  assert.match(text, /hovedregel/);
  assert.match(text, /saerlige grunner/);
  assert.match(text, /avtal/);
  const evidence = modelEvidence(question, 'noark-extract-section-28');
  assert.match(evidence, /saerlige grunner/);
  assert.match(evidence, /avtal/);
});

test('a SIARD follow-up receives the Noark conditions together with the format catalogue', () => {
  const history = [{ role: 'user', content: 'Vi skal avlevere arkivet fra et Noark 5-system.' }];
  const evidence = modelEvidence('Og hva med SIARD?', 'noark-siard-alternative', history);
  assert.match(evidence, /saerlige grunner/);
  assert.match(evidence, /avtal/);
});

test('the documentation-plan frequency answer shows annual presentation to top management with its scope', () => {
  const question = 'Hvor ofte må dokumentasjonsplanen legges fram for ledelsen?';
  const answer = localAnswer(question, 'rules-documentation-plan-annual');
  const text = visibleText(answer);
  assert.match(text, /minst en gang i aret|arlig|hvert ar/);
  assert.match(text, /overste ledelse/);
  assert.match(text, /andre organer enn kommuner og fylkeskommuner/);
  const evidence = modelEvidence(question, 'rules-documentation-plan-annual');
  assert.match(evidence, /minst en gang i aret|arlig|hvert ar/);
  assert.match(evidence, /andre organer enn kommuner og fylkeskommuner/);
});

test('a municipality question does not apply the other-organs annual duty to local government', () => {
  const question = 'Må kommunen legge dokumentasjonsplanen fram for ledelsen hvert år?';
  const answer = localAnswer(question, 'rules-documentation-plan-annual');
  assert.match(visibleText(answer), /andre organer enn kommuner og fylkeskommuner/);
  const evidence = modelEvidence(question, 'rules-documentation-plan-annual');
  assert.match(evidence, /kommuner og fylkeskommuner/);
  assert.match(evidence, /kommuneloven paragraf 25-1/);
});
