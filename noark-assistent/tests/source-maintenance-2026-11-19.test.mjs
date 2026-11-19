import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, getSource, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

function clauses(text, ...patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}

const scenarios = [
  {
    name: 'journal metadata retains all six requirements and their alternatives',
    id: 'rules-journal-metadata',
    questions: [
      'Hvilke metadata skal registreres løpende i journalen etter § 15?',
      'Hvor raskt skal journalføringspliktige saksdokumenter registreres?',
    ],
    section: /paragraf 15 forste ledd bokstav a.f/,
    scope: /journalforingspliktige saksdokumenter/,
    summary(text) {
      clauses(text, /journalforingspliktige saksdokumenter skal registreres lopende/,
        /unik identifikator som kan leses av mennesker/,
        /kontekst og hvilke andre dokumenter dokumentet horer sammen med/,
        /tittel eller andre metadata om hva dokumentet gjelder/,
        /navn pa sender eller mottaker/,
        /dokumentdato eller dato for sending eller mottak/,
        /tidspunktet for registreringen/);
      assert.doesNotMatch(text, /innen (?:\d+|en|to|tre|fire|fem|seks|sju|syv) (?:arbeids)?dag/,
        'Continuous registration must not become an invented deadline in days');
    },
    detail(text) {
      clauses(text, /vurder forst journalforingsplikten etter paragraf 14/,
        /lopende registrering er ikke en konkret frist angitt i antall dager/,
        /forutsetter ikke at et bestemt noark.system brukes/);
    },
  },
  {
    name: 'withholding a whole journal entry requires necessary protection of statutory confidentiality',
    id: 'rules-journal-access-limits',
    questions: [
      'Kan vi unnta hele journalregistreringen fra offentlig innsyn?',
      'Gir andre unntak fra innsyn adgang til å skjule hele journalregistreringen?',
    ],
    section: /paragraf 15 andre ledd/,
    scope: /innsyn i journalopplysninger/,
    summary(text) {
      clauses(text, /journalen skal gjores tilgjengelig for offentlig innsyn etter offentleglova/,
        /journalopplysninger kan unntas nar dokumentet ikke kan registreres uten at det kommer fram lovbestemt taushetsbelagte opplysninger eller opplysninger allmennheten ellers ikke kan kreve innsyn i/,
        /en hel journalregistrering kan bare unntas nar det er nodvendig for ikke a rope lovbestemt taushetsbelagte opplysninger/);
    },
    detail(text) {
      clauses(text, /unntak for opplysninger saerskilt fra unntak for hele registreringen/,
        /andre innsynsunntak gir ikke i seg selv adgang til a unnta hele journalregistreringen/,
        /angir ikke en generell plikt til a publisere journalen pa einnsyn/);
    },
  },
];

function provenance(record, scenario) {
  const source = getSource('archive-regulation');
  assert.ok(source);
  assert.equal(source.url, 'https://lovdata.no/dokument/SF/forskrift/2025-12-17-2647');
  assert.equal(source.published, '17.12.2025',
    'The November review must not replace the original regulation date');
  assert.equal(source.publisher, 'Lovdata');
  assert.equal(source.type, 'Forskrift');
  assert.equal(record.verifiedAt, '2026-11-19');
  const scope = normalize(record.recordScope ?? record.scope);
  assert.match(scope, /organer som skal fore journal etter arkivforskrifta paragraf 14 forste ledd forste punktum/);
  assert.match(scope, scenario.scope);
  assert.match(normalize(record.section), scenario.section);
  return source;
}

function modelRecords(provider, question) {
  // Use production retrieval and ordinary provider limits without forcing record IDs.
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
    test(`local retrieval and visible answer: ${scenario.name}: ${question}`, () => {
      const hits = searchRecords(question, { limit: 4 });
      const hit = hits.find(({ record }) => record.id === scenario.id);
      assert.ok(hit, `${scenario.id} must be in the first four results; got ${hits.map(({ record }) => record.id).join(', ')}`);
      assert.equal(hit.record.source, 'archive-regulation');
      const source = provenance(hit.record, scenario);
      assert.equal(hit.url, source.url);
      const answer = answerQuestion(question);
      assert.equal(answer.status, 'ok');
      const visible = normalize(answer.lead) === normalize(hit.record.summary)
        ? answer.lead : answer.points.find(({ recordId }) => recordId === scenario.id)?.text;
      assert.ok(visible, `${scenario.id} must actually appear in the visible lead or points`);
      scenario.summary(normalize(visible));
    });

    for (const provider of ['Luna', 'Bonsai']) {
      test(`${provider} serialized evidence: ${scenario.name}: ${question}`, () => {
        const records = modelRecords(provider, question);
        const record = records.find(({ id }) => id === scenario.id);
        assert.ok(record, `${provider}: ${scenario.id} must survive actual model-input serialization`);
        const source = provenance(record, scenario);
        assert.equal(record.publisher, source.publisher);
        assert.equal(record.sourceTitle, source.title);
        assert.equal(record.sourceType, source.type);
        assert.equal(record.sourceStatus, source.status ?? null);
        scenario.summary(normalize(record.summary));
        scenario.detail(normalize(record.detail));
      });
    }
  }
}
