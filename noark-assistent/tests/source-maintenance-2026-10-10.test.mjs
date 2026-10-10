import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, searchRecords, normalize } from '../engine.mjs';
import { retrieveConversation } from '../rag-shared.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';
import { prepareBonsaiRequest, BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION } from '../../noark-api/bonsai-protocol.mjs';

const evidenceText = (record) => normalize(`${record.summary} ${record.detail}`);
const visibleText = (answer) => normalize([answer.lead, ...answer.points.map(({ text }) => text)].join(' '));

function localAnswer(question, id) {
  assert.ok(searchRecords(question, { limit: 4 }).some(({ record }) => record.id === id),
    `${question}: ${id} must be among the first four actual search results`);
  const answer = answerQuestion(question);
  assert.equal(answer.status, 'ok');
  assert.ok(answer.results.some(({ record }) => record.id === id),
    `${question}: ${id} must be available in the local answer`);
  return visibleText(answer);
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
  assert.ok(record, `${provider}: ${id} is missing from the actual model input`);
  assert.ok(record.section && record.publisher && record.sourceTitle,
    `${provider}: the factual qualification must retain its source provenance`);
  assert.equal(record.verifiedAt, '2026-10-10');
  assert.ok(record.recordScope ?? record.scope, `${provider}: the record scope must survive serialization`);
  return record;
}

function journalConditions(text) {
  assert.match(text, /inngaende og utgaende saksdokumenter/);
  assert.match(text, /offentleglova paragraf 4/);
  assert.match(text, /er eller blir saksbehandlet/);
  assert.match(text, /og har verdi som bekreftelse pa forholdene/);
}

function accessExceptions(text) {
  assert.match(text, /hovedregel.{0,25}unntatt journalforingsplikt/);
  assert.match(text, /unntaket gjelder ikke|men ikke nar|skal likevel journalfores|ma likevel journalfores/);
  assert.match(text, /naermere begrunnelse/);
  assert.match(text, /klage/);
  assert.match(text, /krav om betaling/);
  assert.match(text, /hvordan innsyn skal gis/);
}

function rayvnRetention(text) {
  assert.match(text, /anbefaler oppbevaring i rayvn fram til avlevering/);
  assert.match(text, /(?:forutsatt|hvis systemet oppfyller).{0,50}arkivforskrifta paragraf 5/);
  assert.match(text, /uttrekk/);
  assert.match(text, /under utvikling/);
  assert.match(text, /planlagt i 2026/);
  assert.match(text, /ferdigstilling er ikke bekreftet|ikke bekreftet ferdig/);
}

function rayvnJournalCases(text) {
  assert.match(text, /situasjonsrapporter pa samordningskanal/);
  assert.match(text, /beslutningsrelevante eksterne fagmeldinger/);
  assert.match(text, /formelle avtaler eller myndighetsutovelse/);
}

function rayvnOperationalBoundary(text) {
  assert.match(text, /formell etterfolgende evaluering kan vaere journalforingspliktig/);
  assert.match(text, /operativ koordinering(?: med eksterne)? er ikke automatisk journalforingspliktig/);
}

const scenarios = [
  {
    name: 'incoming and outgoing messages retain every journal-duty condition',
    id: 'rules-journal-duty',
    question: 'Når skal inngående og utgående e-post journalføres?',
    local: journalConditions,
    model(record) {
      const text = evidenceText(record);
      journalConditions(text);
      assert.match(text, /alle vilkarene ma vurderes/);
      assert.match(text, /kommunikasjonskanalen avgjor ikke plikten/);
      assert.match(text, /arkivplikt og journalforingsplikt er forskjellige vurderinger/);
      assert.equal(record.sourceType, 'Forskrift');
      assert.match(normalize(record.section), /paragraf 14 forste ledd/);
    },
  },
  {
    name: 'internal documents retain discretion and the complete mandatory exception references',
    id: 'rules-journal-internal',
    question: 'Skal organinterne dokumenter alltid journalføres?',
    local(text) {
      assert.match(text, /sa langt organet finner det hensiktsmessig/);
      assert.match(text, /men.{0,120}alltid journalfores/);
    },
    model(record) {
      const text = evidenceText(record);
      assert.match(text, /offentleglova paragraf 14 andre ledd/);
      assert.match(text, /paragraf 16 forste ledd a d andre ledd og tredje ledd forste punktum/);
      assert.match(text, /offentlegforskrifta paragraf 8/);
      assert.match(text, /endelige avgjorelser er ett eksempel ikke hele unntakslisten/);
      assert.equal(record.sourceType, 'Forskrift');
    },
  },
  {
    name: 'access cases keep all four exceptions to their journal-duty exemption',
    id: 'rules-journal-access-cases',
    question: 'Må vi journalføre innsynskrav og klager i innsynssaker?',
    local: accessExceptions,
    model(record) {
      const text = evidenceText(record);
      accessExceptions(text);
      assert.match(text, /vurder arkivplikten separat/);
      assert.equal(record.sourceType, 'Forskrift');
      assert.match(normalize(record.section), /paragraf 14 tredje ledd/);
    },
  },
  {
    name: 'RAYVN logs keep archive duties separate from journal duties',
    id: 'guide-rayvn-archive-journal',
    question: 'Har hendelseslogger i RAYVN arkivplikt og journalplikt?',
    local(text) {
      assert.match(text, /arkiv- og bevaringspliktig uten journalforingsplikt/);
      assert.match(text, /konkrete vurderinger ikke et generelt fritak/);
    },
    model(record) {
      const text = evidenceText(record);
      assert.match(text, /arkiv- og bevaringspliktig uten journalforingsplikt/);
      assert.match(text, /konkrete vurderinger ikke et generelt fritak/);
      assert.match(text, /operative logger skilles fra/);
      assert.match(text, /telefonlogger som dokumenterer beslutninger og kan vaere journalforingspliktige/);
      assert.doesNotMatch(record.sourceType, /^(Lov|Forskrift)$/);
      assert.match(normalize(record.recordScope ?? record.scope), /statsforvaltere og kommuner/);
    },
  },
  {
    name: 'RAYVN retention depends on section 5 and does not imply a completed extraction tool',
    id: 'guide-rayvn-retention-extract',
    question: 'Kan vi beholde dokumentasjonen i RAYVN fram til avlevering, og er uttrekksløsningen ferdig?',
    local: rayvnRetention,
    model(record) {
      rayvnRetention(evidenceText(record));
      assert.doesNotMatch(record.sourceType, /^(Lov|Forskrift)$/);
    },
  },
  {
    name: 'RAYVN journal examples distinguish formal evaluation and operational coordination',
    id: 'guide-rayvn-journal-exceptions',
    question: 'Hvilke situasjonsrapporter, evalueringer og meldinger fra eksterne skal journalføres i RAYVN?',
    local(text) {
      rayvnJournalCases(text);
      rayvnOperationalBoundary(text);
    },
    model(record) {
      const text = evidenceText(record);
      rayvnJournalCases(text);
      rayvnOperationalBoundary(text);
      assert.match(text, /umiddelbar evaluering er del av handteringen/);
      assert.doesNotMatch(record.sourceType, /^(Lov|Forskrift)$/);
    },
  },
];

for (const scenario of scenarios) {
  test(`local retrieval and answer: ${scenario.name}`, () => {
    scenario.local(localAnswer(scenario.question, scenario.id));
  });
  for (const provider of ['Luna', 'Bonsai']) {
    test(`${provider} model evidence: ${scenario.name}`, () => {
      scenario.model(evidence(modelRecords(provider, scenario.question), scenario.id, provider));
    });
  }
}

test('SMS and Teams do not replace the substantive conditions for journal duty', () => {
  for (const channel of ['SMS', 'Teams']) {
    const question = `Når har inngående og utgående ${channel}-meldinger journalføringsplikt?`;
    journalConditions(localAnswer(question, 'rules-journal-duty'));
    for (const provider of ['Luna', 'Bonsai']) {
      const record = evidence(modelRecords(provider, question), 'rules-journal-duty', provider);
      journalConditions(evidenceText(record));
      assert.match(evidenceText(record), /kommunikasjonskanalen avgjor ikke plikten/);
    }
  }
});

for (const provider of ['Luna', 'Bonsai']) {
  test(`${provider} follow-up retains RAYVN extraction uncertainty, including reduced Bonsai context`, () => {
    const history = [{ role: 'user', content: 'Vi bruker RAYVN og planlegger uttrekk for avlevering.' }];
    const records = modelRecords(provider, 'Er denne uttrekksløsningen ferdig i 2026?', history,
      provider === 'Bonsai' ? { sourceLimit: 3, historyLimit: 0 } : {});
    rayvnRetention(evidenceText(evidence(records, 'guide-rayvn-retention-extract', provider)));
  });
}
