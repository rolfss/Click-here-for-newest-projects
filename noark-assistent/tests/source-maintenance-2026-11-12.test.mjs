import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, getSource, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

const verifiedAt = '2026-11-12';
const sourcePaths = {
  'na-conversion-exemption': 'veileder-om-unntak-fra-tekniske-krav-til-konverteringen',
  'na-destruction-exemption': 'veileder-om-unntak-fra-forbudet-mot-destruksjon-etter-konvertering',
  'na-digital-transfer-exemption': 'veileder-om-unntak-fra-kravet-om-digital-avlevering-av-arkiv',
};

function clauses(text, ...patterns) {
  for (const pattern of patterns) assert.match(text, pattern);
}

const scenarios = [
  {
    name: 'paper scanning requirements retain the transfer scope and decision requirement',
    id: 'guide-conversion-technical-requirements',
    source: 'na-conversion-exemption',
    question: 'Hvilke tekniske krav gjelder for skanning av papirarkiv til Nasjonalarkivet?',
    scope: /statlige organers konvertering av avsluttede analoge arkiver/,
    summary(text) {
      clauses(text, /bevare informasjonen uten tap/, /som hovedregel i original storrelse/,
        /300 ppi/, /24.bits fargedybde/, /rgb/, /lavest mulig komprimering/,
        /papir som konverteres for avlevering til nasjonalarkivet.{0,25}skal vaere maskinleselig/,
        /unntak krever vedtak fra nasjonalarkivet/);
    },
    detail(text) {
      clauses(text, /hoyere skannekvalitet er tillatt/,
        /unntaksadgangen gjelder paragraf 16 andre og tredje ledd/,
        /kravet om a unnga informasjonstap i forste ledd bestar/);
    },
  },
  {
    name: 'handwriting or damage supports an OCR application without granting permission',
    id: 'guide-conversion-technical-exemption',
    source: 'na-conversion-exemption',
    question: 'Kan vi få OCR-unntak ved konvertering av håndskrift eller skadet papir?',
    scope: /statlige organers konvertering av avsluttede analoge arkiver/,
    summary(text) {
      clauses(text, /nasjonalarkivet kan gi unntak/, /saerlige grunner/,
        /begrunnet soknad/, /handskrift eller skader kan tale for ocr.unntak/,
        /ingen automatisk tillatelse/, /folg kravene inntil vedtak foreligger/);
    },
    detail(text) {
      clauses(text, /unntak skal ikke fore til informasjonstap eller redusert lesbarhet/);
    },
  },
  {
    name: 'an age dispensation preserves second-paragraph protection and conversion approval',
    id: 'guide-destruction-age-exemption',
    source: 'na-destruction-exemption',
    question: 'Kan vi søke om unntak fra destruksjonsforbudet for papiroriginaler fra 1950 eller før?',
    scope: /offentlige organer.{0,50}originaler fra 1950 eller tidligere etter konvertering/,
    summary(text) {
      clauses(text, /konkret vurdering/, /aldersforbudet mot destruksjon i paragraf 19 forste ledd/,
        /kan begrunne soknad/, /ikke automatisk tillatelse/,
        /vernet i andre ledd og kravene til konvertering gjelder fortsatt/);
    },
    detail(text) {
      clauses(text, /saerskilt historisk gjenstandsverdi/, /andre krav om originalformat/,
        /statlig konvertering ma vaere godkjent av nasjonalarkivet/,
        /folg gjeldende regler mens soknaden behandles og ved avslag/);
    },
  },
  {
    name: 'prior preparation supports a digital-transfer exception only after concrete assessment',
    id: 'guide-digital-transfer-exemption',
    source: 'na-digital-transfer-exemption',
    question: 'Kan et statlig organ søke om unntak fra digital avlevering når papirarkivet allerede var klargjort?',
    scope: /statlige organers avlevering til nasjonalarkivet/,
    summary(text) {
      clauses(text, /statlige organer kan soke om unntak fra digital avlevering i saerlige tilfeller/,
        /tidligere klargjoring/, /ettersending til fysisk avlevering/,
        /arkiv hovedsakelig fra 1950 eller for/, /fysisk retts. og bevisverdi kan tale for unntak/,
        /nasjonalarkivet avgjor konkret/,
        /eksemplene gir ingen automatisk adgang til papiravlevering/);
    },
    detail(text) {
      clauses(text, /som oftest arkivlister godkjent for regelendringen/,
        /folg kravene mens dere venter pa vedtak/,
        /dokumentasjon som ma bevares analogt etter paragraf 19.{0,15}er allerede unntatt digital avlevering/);
    },
  },
];

function provenance(record, sourceId, scope) {
  const source = getSource(sourceId);
  assert.ok(source);
  assert.equal(source.url, `https://www.nasjonalarkivet.no/veiledere/${sourcePaths[sourceId]}/`);
  assert.equal(source.published, 'Publiseringsdato ikke bekreftet',
    'The observation date must not become an invented publication date');
  assert.equal(source.verifiedAt, verifiedAt);
  assert.equal(record.verifiedAt, verifiedAt);
  assert.equal(source.publisher, 'Nasjonalarkivet');
  assert.equal(source.type, 'Offisiell veiledning');
  assert.equal(source.status, 'current-guidance');
  assert.match(normalize(record.recordScope ?? record.scope), scope);
  assert.ok(record.section, 'The exception must retain its original section reference');
  return source;
}

function modelRecords(provider, question) {
  // Exercise actual retrieval and both production serializers at their normal limits.
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
  test(`local retrieval and visible answer: ${scenario.name}`, () => {
    const hits = searchRecords(scenario.question, { limit: 4 });
    const hit = hits.find(({ record }) => record.id === scenario.id);
    assert.ok(hit, `${scenario.id} must be in the first four results; got ${hits.map(({ record }) => record.id).join(', ')}`);
    assert.equal(hit.record.source, scenario.source);
    const source = provenance(hit.record, scenario.source, scenario.scope);
    assert.equal(hit.url, source.url);
    const answer = answerQuestion(scenario.question);
    assert.equal(answer.status, 'ok');
    const visible = normalize(answer.lead) === normalize(hit.record.summary)
      ? answer.lead : answer.points.find(({ recordId }) => recordId === scenario.id)?.text;
    assert.ok(visible, `${scenario.id} must actually appear in the visible lead or points`);
    // Qualifications must be visible in the relevant answer, not merely stored in detail.
    scenario.summary(normalize(visible));
  });

  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} serialized evidence: ${scenario.name}`, () => {
      const records = modelRecords(provider, scenario.question);
      const record = records.find(({ id }) => id === scenario.id);
      assert.ok(record, `${provider}: ${scenario.id} must survive actual model-input serialization`);
      const source = provenance(record, scenario.source, scenario.scope);
      assert.equal(record.publisher, source.publisher);
      assert.equal(record.sourceTitle, source.title);
      assert.equal(record.sourceType, source.type);
      assert.equal(record.sourceStatus, source.status);
      scenario.summary(normalize(record.summary));
      scenario.detail(normalize(record.detail));
    });
  }
}
