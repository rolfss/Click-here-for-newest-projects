import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, getRecord, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

const evidenceText = (record) => normalize(`${record.summary} ${record.detail}`);
const visibleText = (answer) => normalize([answer.lead, ...answer.points.map(({ text }) => text)].join(' '));

function clauses(text, ...patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}

function responsibility(text) {
  clauses(text, /organ.{0,20}avtaler/, /rettssubjekt utenfor arkivloven/,
    /organets lovpalagte oppgaver/, /skal organet sorge for/,
    /pliktene etter arkivloven folges opp/, /organet ma ta imot dokumentasjonen/,
    /utforeren ikke lenger trenger eller har rettmessig krav/);
}

function followup(text) {
  clauses(text, /anbefaler.{0,25}samarbeid/, /arkiv/, /innkjop/, /fagansvarlige/,
    /dokumentasjon/, /metadata/, /mottakstidspunkt/, /overforing/, /oppfolging/,
    /opplysninger om avtalene skal innga i dokumentasjonsplanen/);
}

function statutoryScope(text) {
  clauses(text, /organer underlagt arkivlova/, /avtaler/,
    /rettssubjekt utenfor loven/, /deres lovpalagte oppgaver/);
}

function modelRecords(provider, question) {
  const candidates = retrieveConversation(question, []);
  assert.ok(candidates.length > 0 && candidates.length <= 12);
  if (provider === 'Luna') {
    return JSON.parse(buildPayload(question, [], candidates).body.input[0].content).source_records;
  }
  const request = prepareBonsaiRequest({ question, history: [],
    recordIds: candidates.map(({ record }) => record.id),
    protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION });
  assert.ok(request.recordIds.length <= 6);
  return JSON.parse(request.body.messages[1].content).source_records;
}

function evidence(records, id, provider) {
  const record = records.find((candidate) => candidate.id === id);
  assert.ok(record, `${provider}: ${id} must survive actual model-input serialization`);
  assert.ok(record.section && record.publisher && record.sourceTitle,
    `${provider}: guidance provenance must accompany the responsibility and advice`);
  assert.equal(record.verifiedAt, '2026-10-24');
  assert.match(normalize(record.sourceType), /veiledning/);
  statutoryScope(normalize(record.recordScope ?? record.scope ?? ''));
  return record;
}

const scenarios = [
  {
    name: 'outsourcing statutory tasks retains the public body responsibility and conditional receipt duty',
    id: 'guide-outsourced-statutory-responsibility',
    question: 'Hvem har arkivansvaret når private utfører lovpålagte oppgaver på organets vegne, og når må organet ta imot dokumentasjonen?',
    summary: responsibility,
    model(text) {
      clauses(text, /avtalt oppgavelosning pa organets vegne/,
        /ikke ethvert privat tjenestetilbud/,
        /ikke hele den private virksomheten til arkivlovens virkeomrade/);
    },
  },
  {
    name: 'outsourcing follow-up distinguishes practical contract advice from the documentation-plan obligation',
    id: 'guide-outsourced-statutory-followup',
    question: 'Hva bør arkiv, innkjøp og fagansvarlige avtale om metadata, mottak og oppfølging når lovpålagte oppgaver settes ut, og hva skal inn i dokumentasjonsplanen?',
    summary: followup,
    model(text) {
      clauses(text, /praktiske rad/, /ikke en lovbestemt standardavtale/,
        /folg opp dokumentasjonen underveis/, /kompletthet/, /informasjonstap ved mottak/);
    },
  },
];

for (const scenario of scenarios) {
  test(`local retrieval and visible answer: ${scenario.name}`, () => {
    const record = getRecord(scenario.id);
    assert.ok(record, `${scenario.id} must exist`);
    assert.equal(record.source, 'na-outsourced-statutory');
    statutoryScope(normalize(record.scope));
    // Local answers expose summary only: core conditions and requirement strength must be visible there.
    scenario.summary(normalize(record.summary));
    const topFour = searchRecords(scenario.question, { limit: 4 });
    assert.ok(topFour.some(({ record: candidate }) => candidate.id === scenario.id),
      `${scenario.id} must be in the first four results; got ${topFour.map(({ record: r }) => r.id).join(', ')}`);
    const answer = answerQuestion(scenario.question);
    assert.equal(answer.status, 'ok');
    assert.ok(normalize(answer.lead) === normalize(record.summary)
      || answer.points.some(({ recordId }) => recordId === scenario.id),
    `${scenario.id} must actually appear in the visible lead or points`);
    scenario.summary(visibleText(answer));
  });

  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} serialized evidence: ${scenario.name}`, () => {
      const records = modelRecords(provider, scenario.question);
      const record = evidence(records, scenario.id, provider);
      scenario.summary(normalize(record.summary));
      scenario.model(evidenceText(record));
    });
  }
}
