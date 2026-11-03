import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

const recordId = 'rules-digital-delivery';
const scenarios = [
  ['the age exception is limited to section 19 first paragraph',
    'Kan Nasjonalarkivet gjøre unntak fra aldersregelen i § 19 første ledd?'],
  ['an original from before 1951 retains its protected status',
    'Kan et statlig papirarkiv fra 1948 avleveres på papir?'],
  ['historical value as an object is not covered by the age dispensation',
    'Kan Nasjonalarkivet gi unntak for originaler med særskilt historisk verdi som gjenstand?'],
  ['another law requiring the original format is not covered by the age dispensation',
    'Kan Nasjonalarkivet gi unntak når annet regelverk krever at originalformatet bevares?'],
  ['an application under section 20 concerns a different exception',
    'Må statlige arkiver alltid avleveres digitalt, eller kan vi søke om unntak etter § 20?'],
];

function safeVisibleSummary(text) {
  // The local overview need not repeat every detail, but must keep the rule and exceptions.
  assert.match(text, /statlige arkiver.{0,35}hovedregel digitalt/);
  assert.match(text, /analoge originaler vernet av paragraf 19.{0,65}unntatt/);
  assert.match(text, /andre unntak.{0,35}soknad/);
  assert.doesNotMatch(text, /(?:alle|enhver).{0,25}originaler?.{0,30}(?:kan destrueres|kan kasseres)/);
}

function qualifiedEvidence(record) {
  const text = normalize(`${record.summary} ${record.detail}`);
  assert.match(text, /kan gjore unntak fra aldersregelen i paragraf 19 forste ledd.{0,25}1950 eller tidligere/);
  assert.match(text, /unntaksadgangen omfatter ikke vernet i andre ledd/);
  assert.match(text, /paragraf 19 verner.{0,30}originaler med saerskilt historisk verdi som gjenstand/);
  assert.match(text, /originalformat som annet regelverk krever bevart/);
  assert.match(text, /soknadsbaserte unntak fra digital avlevering etter paragraf 20 krever saerlige tilfeller/);
  assert.match(normalize(record.recordScope ?? record.scope), /statlige virksomheters avlevering til nasjonalarkivet/);
  assert.match(normalize(record.sourceType), /forskrift/);
  assert.ok(record.section && record.publisher && record.sourceTitle,
    'The legal qualifications must be accompanied by source provenance');
}

function serializedRecords(provider, question) {
  const candidates = retrieveConversation(question, []);
  assert.ok(candidates.length > 0 && candidates.length <= 12);
  if (provider === 'Luna') {
    const payload = buildPayload(question, [], candidates);
    return JSON.parse(payload.body.input[0].content).source_records;
  }
  const request = prepareBonsaiRequest({ question, history: [],
    recordIds: candidates.map(({ record }) => record.id),
    protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION });
  assert.ok(request.recordIds.length <= 6);
  return JSON.parse(request.body.messages[1].content).source_records;
}

for (const [name, question] of scenarios) {
  test(`local retrieval and visible answer: ${name}`, () => {
    const hits = searchRecords(question, { limit: 4 });
    const source = hits.find(({ record }) => record.id === recordId)?.record;
    assert.ok(source, `${recordId} must be in the first four results for: ${question}`);
    const answer = answerQuestion(question);
    assert.equal(answer.status, 'ok');
    const visible = normalize(answer.lead) === normalize(source.summary)
      ? answer.lead : answer.points.find((point) => point.recordId === recordId)?.text;
    assert.ok(visible, `${recordId} must appear in the visible lead or points`);
    safeVisibleSummary(normalize(visible));
  });

  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} serialized legal distinctions: ${name}`, () => {
      // Use the actual retrieval and serializers without forcing the required record or raising limits.
      const records = serializedRecords(provider, question);
      const evidence = records.find(({ id }) => id === recordId);
      assert.ok(evidence, `${provider}: ${recordId} must survive serialization for: ${question}`);
      qualifiedEvidence(evidence);
    });
  }
}
