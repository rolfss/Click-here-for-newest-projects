import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, getSource, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

function clauses(text, ...patterns) {
  for (const pattern of patterns) assert.match(normalize(text), pattern);
}

const scenarios = [
  {
    id: 'arkade-2-13-2-fagsystem',
    sourceId: 'arkade-2-13-2',
    published: '19.11.2026',
    verifiedAt: '2026-11-24',
    url: 'https://github.com/nasjonalarkivet/arkade5/releases/tag/v2.13.2',
    questions: [
      'Hvorfor viser Arkade SpecializedSystem i stedet for Fagsystem?',
      'Kan Arkade 2.13.2 lese Fagsystem-pakker laget i 2.13.0 og 2.13.1?',
      'Må vi pakke om alle Fagsystem-pakker etter oppdatering til Arkade 2.13.2?',
    ],
    summary(text) {
      clauses(text, /2\.13\.2 retter en feil fra 2\.13\.0/,
        /arkivtypen fagsystem som specializedsystem/,
        /2\.13\.2 bruker igjen fagsystem i mets testrapporter og brukergrensesnitt/);
    },
    detail(text) {
      clauses(text, /fagsystem-pakker laget i 2\.13\.0 og 2\.13\.1 kan leses inn i 2\.13\.2 med korrekt gjenkjent arkivtype/,
        /ved produksjon av nye pakker fra dem skrives fagsystem til mets/,
        /ikke en generell plikt til ompakking eller endelig godkjenning av avleveringen/);
    },
    scope(text) {
      clauses(text, /2\.13\.0 og 2\.13\.1/, /rettelsen i 2\.13\.2 for fagsystem-pakker/);
    },
  },
  {
    id: 'arkade-2-13-1-mets',
    sourceId: 'arkade-2-13-1',
    published: '23.09.2026',
    verifiedAt: '2026-09-26',
    url: 'https://github.com/nasjonalarkivet/arkade5/releases/tag/v2.13.1',
    questions: ['Hvilken feil i METS rettet Arkade 2.13.1?'],
    summary(text) {
      clauses(text, /2\.13\.1 retter en feil i 2\.13\.0/,
        /manglende filbeskrivelser i mets ved pakking av noark 5-uttrekk/);
      assert.doesNotMatch(text, /2\.13\.2|SpecializedSystem/,
        'The earlier METS correction must remain separate from the Fagsystem correction');
    },
    detail(text) {
      clauses(text, /filer utenfor dokumentfilkatalogen/,
        /filstien inneholdt et dokumentfilkatalognavn/, /pakker produsert med 2\.13\.0/);
    },
    scope(text) {
      clauses(text, /2\.13\.0 og rettelsen i 2\.13\.1/, /pakking av noark 5-uttrekk/);
    },
  },
  {
    id: 'guide-arkade-pdfa',
    sourceId: 'arkade-manual',
    published: 'Publiseringsdato ikke fastsatt her',
    verifiedAt: '2026-09-07',
    url: 'https://docs.arkade.arkivverket.no/no/latest/Brukerveiledning.html',
    questions: ['Er PDF/A-validering aktivert i Arkade?'],
    summary(text) {
      clauses(text, /pdfa-validering er deaktivert fra 2\.12\.5/, /i pavente av en losning/);
      assert.doesNotMatch(text, /2\.13\.2/,
        'The new archive-type correction must not imply restored PDF/A validation');
    },
    detail(text) {
      clauses(text, /faktisk installert versjon/,
        /eldre pdfa-listen.*erstatter ikke nasjonalarkivets aktuelle avleveringsliste/);
    },
  },
];

function provenance(record, scenario) {
  const source = getSource(scenario.sourceId);
  assert.equal(source.url, scenario.url);
  assert.equal(source.published, scenario.published,
    'Original publication dates must remain distinct from the maintenance date');
  assert.equal(source.status, 'tool-documentation');
  assert.equal(record.verifiedAt, scenario.verifiedAt);
  if (scenario.scope) scenario.scope(record.recordScope ?? record.scope);
  return source;
}

function modelRecords(provider, question) {
  // Use ordinary production retrieval and provider limits, without forcing evidence IDs.
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

for (const scenario of scenarios) {
  for (const question of scenario.questions) {
    test(`local retrieval and visible answer: ${question}`, () => {
      const hits = searchRecords(question, { limit: 4 });
      const hit = hits.find(({ record }) => record.id === scenario.id);
      assert.ok(hit, `${scenario.id} must appear in the first four results; got ${hits.map(({ record }) => record.id).join(', ')}`);
      assert.equal(hit.record.source, scenario.sourceId);
      assert.equal(hit.url, provenance(hit.record, scenario).url);
      const answer = answerQuestion(question);
      assert.equal(answer.status, 'ok');
      const visible = normalize(answer.lead) === normalize(hit.record.summary)
        ? answer.lead : answer.points.find(({ recordId }) => recordId === scenario.id)?.text;
      assert.ok(visible, `${scenario.id} must appear in the visible lead or points`);
      scenario.summary(visible);
      // These details are also presented in the answer's source card.
      const displayedSource = answer.results.find(({ record }) => record.id === scenario.id);
      assert.ok(displayedSource);
      scenario.detail(displayedSource.record.detail);
    });

    for (const provider of ['Luna', 'Bonsai']) {
      test(`${provider} serialized evidence: ${question}`, () => {
        const record = modelRecords(provider, question).find(({ id }) => id === scenario.id);
        assert.ok(record, `${provider}: ${scenario.id} must survive actual model-input serialization`);
        const source = provenance(record, scenario);
        assert.equal(record.sourceTitle, source.title);
        assert.equal(record.publisher, source.publisher);
        assert.equal(record.sourceType, source.type);
        assert.equal(record.sourceStatus, 'tool-documentation');
        scenario.summary(record.summary);
        scenario.detail(record.detail);
      });
    }
  }
}
