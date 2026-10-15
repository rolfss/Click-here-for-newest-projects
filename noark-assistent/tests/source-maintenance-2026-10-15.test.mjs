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

function journalConditions(text) {
  clauses(text, /inngaende og utgaende saksdokument/, /offentleglova paragraf 4/,
    /er eller blir saksbehandlet/, /og har verdi som bekreftelse/);
}

function noarkAlternative(text) {
  clauses(text, /statlig/, /noark 5/, /saerlige grunner og avtale/, /nasjonalarkivet/);
}

function modelRecords(provider, question, history = [], options = {}) {
  const candidates = retrieveConversation(question, history);
  assert.ok(candidates.length > 0 && candidates.length <= 12);
  if (provider === 'Luna') {
    return JSON.parse(buildPayload(question, history, candidates).body.input[0].content).source_records;
  }
  const request = prepareBonsaiRequest({ question, history,
    recordIds: candidates.map(({ record }) => record.id),
    protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION }, options);
  assert.ok(request.recordIds.length <= (options.sourceLimit ?? 6));
  return JSON.parse(request.body.messages[1].content).source_records;
}

function evidence(records, id, provider) {
  const record = records.find((candidate) => candidate.id === id);
  assert.ok(record, `${provider}: ${id} must survive actual model-input serialization`);
  assert.ok(record.section && record.publisher && record.sourceTitle,
    `${provider}: provenance must accompany the guidance`);
  assert.equal(record.verifiedAt, '2026-10-15');
  assert.ok(record.recordScope ?? record.scope, `${provider}: guidance scope must survive serialization`);
  assert.match(normalize(record.sourceType), /veiledning/);
  return record;
}

const scenarios = [
  {
    name: 'external collaboration-room and inbox receipt does not alone create journal duty',
    id: 'guide-journal-received',
    question: 'Når er dokumenter fra eksterne i SharePoint eller jobbinnboksen mottatt for journalføring?',
    summary(text) {
      clauses(text, /eksterne/, /samarbeidsrom/, /jobbinnboks/, /kan vaere mottatt/,
        /ansvarsomrade/, /alle journalvilkar.{0,30}(vurderes|oppfylt)/);
    },
    context: journalConditions,
    model(text) {
      clauses(text, /saksbehandl/, /verdi som bekreftelse/, /ingen automatisk journalplikt/);
    },
  },
  {
    name: 'a telephone note remains an internal document with separate archive and journal assessments',
    id: 'guide-journal-phone-note',
    question: 'Skal et telefonnotat etter en samtale med saksopplysninger journalføres som inngående dokument?',
    summary(text) {
      clauses(text, /notat/, /normalt organinternt/, /arkivering og journalforing separat/,
        /obligatoriske interne unntak/, /enkelte tilfeller.{0,30}nedtegningsplikt/);
    },
    model(text) {
      clauses(text, /ikke automatisk en inngaende journalpost/, /forvaltningsloven paragraf 11 d/);
    },
  },
  {
    name: 'a low case-processing threshold preserves the other cumulative journal conditions',
    id: 'guide-journal-case-processing',
    question: 'Hva betyr lav terskel for saksbehandling ved journalføring?',
    summary(text) {
      clauses(text, /lav terskel/, /vurderes|brukes/, /forberede|avgjorelse/,
        /dokumentasjonsverdi/, /ovrige journalvilkar.{0,30}oppfylt/);
    },
    context: journalConditions,
    model(text) {
      clauses(text, /ikke at alle dokumenter|ikke automatisk/, /bekrefte forholdene/);
    },
  },
  {
    name: 'preservation of automated decisions connects evidence without requiring every log',
    id: 'guide-preservation-plan-properties',
    question: 'Hva bør bevaringsplanen si om automatiserte beslutninger, algoritmer og manuelle vurderinger?',
    summary(text) {
      clauses(text, /bevaringsplan/, /begrunne/, /endringer eller tap/, /regelgrunnlag/,
        /data/, /algoritm/, /manuelle vurderinger/, /beslutninger/,
        /logger.{0,30}kan vaere nodvendig/);
    },
    model(text) {
      clauses(text, /ikke en generell plikt/, /alle logger eller algoritmer/);
    },
  },
  {
    name: 'receipt of a digital transfer does not substitute for final approval',
    id: 'guide-digital-transfer-process',
    question: 'Er mottakskvittering etter digital avlevering det samme som endelig godkjenning?',
    summary(text) {
      clauses(text, /statlig/, /nasjonalarkivet/, /soknad/, /arkivbeskrivelse/, /avtale/,
        /systemdokumentasjon/, /arkade/,
        /mottakskvittering[^.]*ikke[^.]*endelig godkjenning/, /testing/, /godkjenningsbrev/);
    },
  },
  {
    name: 'system closure retains agreed access duties after transfer and approval',
    id: 'guide-transfer-system-closure',
    question: 'Når kan vi avslutte opprinnelig system etter overføring, og hvem har innsynsansvaret?',
    summary(text) {
      clauses(text, /hovedregel/, /etter overforing[^.]*endelig godkjenning/, /avslutt/,
        /innsynsansvar/, /raderett/, /folger avtalen/, /oppslag/, /viderefore|fortsatt/);
    },
    model(text) {
      clauses(text, /ikke automatisk[^.]*godkjenning|godkjenningsbrev[^.]*ikke automatisk/,
        /innsyn/, /raderett/, /avtalt overgang/);
    },
  },
  {
    name: 'authentic archival deviations and extraction-created errors require different treatment',
    id: 'guide-extract-authentic-deviations',
    question: 'Skal vi rette autentiske Noark-avvik og eksportfeil før godkjenning?',
    summary(text) {
      clauses(text, /autentiske avvik[^.]*dokumenteres og beholdes/,
        /feil[^.]*uttrekksproduksjon[^.]*rettes[^.]*nytt uttrekk/,
        /arkade-test[^.]*erstatter ikke[^.]*endelige godkjenning/);
    },
    model(text) {
      clauses(text, /ikke omskriv autentisk/, /ovrige kontroller/);
    },
  },
  {
    name: 'sysdok includes technical and administrative documentation with proportionate scope',
    id: 'guide-extract-system-documentation',
    question: 'Hva slags teknisk og administrativ systemdokumentasjon skal følge med i sysdok?',
    summary(text) {
      clauses(text, /statlig/, /nasjonalarkivet/, /teknisk og administrativ/,
        /systemdokumentasjon[^.]*sysdok/, /omfanget tilpasses/,
        /mindre omfattende[^.]*noark 5/);
    },
    model(text) {
      clauses(text, /datamodell/, /kolonnebeskrivelser/, /rutiner/,
        /migreringshistorikk/, /ikke generelt fritak/);
      assert.doesNotMatch(text, /alle noark.{0,30}godkjent/);
    },
  },
  {
    name: 'extraction planning selects preserved content and retains the Noark-specific rule',
    id: 'guide-extract-content-planning',
    question: 'Hvordan planlegger vi tabellutvalg og dokumenterer gjennomføringen av et arkivuttrekk?',
    summary(text) {
      clauses(text, /bevaringsverdig innhold og struktur/, /tabellutvalg/,
        /hel database[^.]*unntaksvis[^.]*avtale/, /statlige noark 5/,
        /arkivforskrifta paragraf 28/);
    },
    model(text) {
      clauses(text, /dokumenter vurderingene/, /uttrekksspesifikasjon/,
        /tekniske eksportgjennomforing/, /dokumentasjonen i arkivpakken/);
    },
  },
  {
    name: 'SIARD preparation includes content checks and does not waive the Noark agreement',
    id: 'guide-siard-preparation',
    question: 'Hva må vi avklare og kontrollere før vi lager SIARD-uttrekk?',
    summary(text) {
      clauses(text, /tabellutvalg/, /uttrekksmiljo/, /siard-versjon/, /verktoystotte/,
        /lob/, /eksterne filer/, /for produksjon/, /apning/, /forventet innhold/, /radantall/);
      noarkAlternative(text);
    },
    model(text) {
      clauses(text, /rapporter og logger[^.]*arkivpakken/,
        /nyeste siard-versjon[^.]*ikke[^.]*ethvert verktoy/);
    },
  },
];

for (const scenario of scenarios) {
  test(`local retrieval and visible answer: ${scenario.name}`, () => {
    const record = getRecord(scenario.id);
    assert.ok(record, `${scenario.id} must exist`);
    // Local answers expose summary only, so a qualification hidden in detail is insufficient.
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
    scenario.context?.(visibleText(answer));
  });
  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} serialized evidence: ${scenario.name}`, () => {
      const records = modelRecords(provider, scenario.question);
      const record = evidence(records, scenario.id, provider);
      scenario.summary(normalize(record.summary));
      scenario.model?.(evidenceText(record));
      scenario.context?.(records.map(evidenceText).join(' '));
    });
  }
}

test('section 5 g requires journal export rather than treating any access solution as equivalent', () => {
  const question = 'Hva krever § 5 g om journaldata og metadata etter § 15?';
  const check = (text) => {
    clauses(text, /metadata/, /paragraf 15/, /hentes ut til en journal/);
    assert.doesNotMatch(text, /journal eller annen innsynslosning/);
  };
  check(normalize(getRecord('section-5-journal').summary));
  check(visibleText(answerQuestion(question)));
  for (const provider of ['Luna', 'Bonsai']) {
    const record = modelRecords(provider, question).find(({ id }) => id === 'section-5-journal');
    assert.ok(record, `${provider}: the specific journal-export obligation must reach the model`);
    check(normalize(record.summary));
  }
});
