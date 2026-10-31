import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

function clauses(text, ...patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}

function identicalConditions(text) {
  clauses(text, /allerede.{0,25}sikret.{0,25}forvaltet som arkiv/,
    /egenskaper.{0,25}funksjon.{0,25}kontekst/,
    /like filer.{0,25}ulike saker.{0,35}forskjellig dokumentasjon/);
  assert.doesNotMatch(text, /(?:duplikater|like filer|samme pdf).{0,25}(?:kan alltid slettes|kan fritt slettes)/);
}

function sharedSolution(text) {
  clauses(text, /annet organ.{0,35}avtalt felles oppgavelosning/, /paragraf 8/);
}

function appealConditions(text) {
  clauses(text, /registrerte.{0,15}behandlingsansvarlige organet.{0,20}klage/,
    /nasjonalarkivets vedtak.{0,25}kassasjon av enkeltopplysninger/,
    /tre uker fra mottak av vedtaket/,
    /klagen sendes nasjonalarkivet.{0,25}ny vurdering/,
    /departementet.{0,20}klageorgan.{0,35}ikke tas til folge/);
  assert.doesNotMatch(text, /klagen sendes (?:direkte til )?datatilsynet/);
}

function identicalModel(record) {
  const text = normalize(`${record.summary} ${record.detail}`);
  identicalConditions(normalize(record.summary));
  sharedSolution(normalize(record.summary));
  clauses(text, /strukturerte data kan ikke erstattes/,
    /mister viktige egenskaper eller koblinger/,
    /ulike funksjoner og sammenhenger.{0,35}metadata/,
    /forvaltes samlet med avtalt ansvar/);
  clauses(normalize(record.recordScope ?? record.scope),
    /arkivforskrifta paragraf 1 c/, /avtalt felles oppgavelosning etter paragraf 8/);
}

function appealModel(record) {
  appealConditions(normalize(record.summary));
  clauses(normalize(record.detail), /saksnummer/, /begrunn/,
    /nasjonalarkivet kan omgjor/, /kultur-? og likestillingsdepartementet/,
    /ikke en generell klageordning for sletting etter gdpr/);
  clauses(normalize(record.recordScope ?? record.scope),
    /kassasjon av enkeltopplysninger/, /arkivlova paragraf 13/,
    /arkivforskrifta paragraf 43/, /ikke generell gdpr/);
}

const scenarios = [
  {
    name: 'one archival copy retains the documentation properties and context',
    id: 'guide-appraisal-identical',
    question: 'Må samme dokumentasjon arkiveres i to systemer?',
    visible: identicalConditions,
    model: identicalModel,
  },
  {
    name: 'duplicate archiving is found when the user names the case system and specialist system',
    id: 'guide-appraisal-identical',
    question: 'Må vi arkivere dokumentet to ganger når det ligger i både fagsystemet og sakarkivet?',
    visible: identicalConditions,
    model: identicalModel,
  },
  {
    name: 'identical PDF files in separate cases do not grant a blanket deletion permission',
    id: 'guide-appraisal-identical',
    question: 'Kan vi slette samme PDF fra to forskjellige saker?',
    visible: identicalConditions,
    model: identicalModel,
  },
  {
    name: 'another public body only substitutes through an agreed shared solution',
    id: 'guide-appraisal-identical',
    question: 'Kan innhold i et annet organs system erstatte vårt arkiv?',
    visible(text) { identicalConditions(text); sharedSolution(text); },
    model: identicalModel,
  },
  {
    name: 'another agency holding the document does not alone discharge the archive duty',
    id: 'guide-appraisal-identical',
    question: 'Er det nok at en annen etat har arkivert dokumentasjonen?',
    visible(text) { identicalConditions(text); sharedSolution(text); },
    model: identicalModel,
  },
  {
    name: 'an appeal on a disposal decision gives standing deadline and the correct route',
    id: 'guide-single-appeal',
    question: 'Hvordan klage på Nasjonalarkivets kassasjonsvedtak?',
    visible: appealConditions,
    model: appealModel,
  },
  {
    name: 'a personal-information appeal retains the disposal scope rather than becoming a GDPR claim',
    id: 'guide-single-appeal',
    question: 'Hvor lang tid har jeg på å klage på vedtak om kassasjon av personopplysninger?',
    visible: appealConditions,
    model: appealModel,
  },
];

function modelRecords(provider, question) {
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

for (const scenario of scenarios) {
  test(`local retrieval and visible answer: ${scenario.name}`, () => {
    const topFour = searchRecords(scenario.question, { limit: 4 });
    assert.ok(topFour.some(({ record }) => record.id === scenario.id),
      `${scenario.id} must be in the first four results; got ${topFour.map(({ record }) => record.id).join(', ')}`);
    const answer = answerQuestion(scenario.question);
    assert.equal(answer.status, 'ok');
    const source = topFour.find(({ record }) => record.id === scenario.id).record;
    const visible = normalize(answer.lead) === normalize(source.summary)
      ? answer.lead : answer.points.find(({ recordId }) => recordId === scenario.id)?.text;
    assert.ok(visible, `${scenario.id} must appear in the visible lead or points`);
    // A condition present only in hidden detail does not protect a local answer.
    scenario.visible(normalize(visible));
  });

  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} serialized evidence: ${scenario.name}`, () => {
      // Exercise retrieval and the real serializer; no forced record IDs or enlarged limits.
      const records = modelRecords(provider, scenario.question);
      const record = records.find(({ id }) => id === scenario.id);
      assert.ok(record, `${provider}: ${scenario.id} must survive actual model-input serialization`);
      assert.ok(record.section && record.publisher && record.sourceTitle,
        `${provider}: provenance must accompany the conditions`);
      assert.match(normalize(record.sourceType), /veiledning/);
      scenario.model(record);
    });
  }
}
