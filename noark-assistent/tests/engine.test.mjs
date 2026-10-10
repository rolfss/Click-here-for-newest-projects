import assert from "node:assert/strict";
import test from "node:test";

import {
  answerQuestion,
  corpusStats,
  findIntent,
  formatLocation,
  getSource,
  listRecords,
  normalize,
  requirementTypeLabel,
  searchRecords,
  sourceUrl,
  tokenize,
} from "../engine.mjs";
import { BUILD_INFO, INTENTS, RECORDS, SOURCES, TOPICS } from "../data.mjs";

test("kildebasen har forventet omfang og entydige ID-er", () => {
  const stats = corpusStats();
  assert.equal(BUILD_INFO.standardVersion, "Noark 5 versjon 6.0");
  assert.ok(stats.records >= 70);
  assert.equal(stats.sources, 21);
  assert.ok(stats.requirements >= 35);
  assert.ok(stats.topics >= 15);
  assert.equal(new Set(RECORDS.map(({ id }) => id)).size, RECORDS.length);
  assert.equal(new Set(SOURCES.map(({ id }) => id)).size, SOURCES.length);
  assert.equal(new Set(INTENTS.map(({ id }) => id)).size, INTENTS.length);
});

test("alle kildeposter peker til gyldige, sikre kilder", () => {
  const sourceIds = new Set(SOURCES.map(({ id }) => id));
  for (const source of SOURCES) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.title.length > 3);
    assert.ok(source.publisher.length > 2);
  }
  for (const record of RECORDS) {
    assert.ok(sourceIds.has(record.source), `ukjent kilde for ${record.id}`);
    assert.ok(record.title.length > 3, record.id);
    assert.ok(record.summary.endsWith("."), record.id);
    assert.ok(record.detail.endsWith("."), record.id);
    assert.ok(TOPICS.includes(record.topic), `${record.id}: ${record.topic}`);
    if (record.requirementType) assert.ok(["O", "B", "V", "M"].includes(record.requirementType));
  }
});

test("normalisering og tokenisering håndterer norsk tekst og paragraftegn", () => {
  assert.equal(normalize("Arkivforskrifta § 5 – søk og gjenfinning"), "arkivforskrifta paragraf 5 sok og gjenfinning");
  assert.deepEqual(tokenize("Hva må vi gjøre på Ås?"), ["as"]);
});

test("Noark-status etter 2026 besvares eksplisitt og kildebasert", () => {
  const answer = answerQuestion("Er Noark fortsatt obligatorisk?");
  assert.equal(answer.status, "ok");
  assert.equal(answer.intent, "mandatory");
  assert.match(answer.lead, /^Nei\./);
  assert.equal(answer.results[0].record.id, "noark-voluntary");
  assert.ok(answer.results.some(({ record }) => record.id === "rules-sections-5-7"));
});

test("kravtypene O, B og V forklares riktig", () => {
  const answer = answerQuestion("Hva betyr O, B og V?");
  assert.equal(answer.intent, "requirement-types");
  assert.match(answer.lead, /O generelt obligatorisk/);
  assert.match(answer.lead, /B obligatorisk når/);
  assert.match(answer.lead, /V valgfritt/);
  assert.equal(requirementTypeLabel("M"), "Blandede kravtyper");
});

test("kravnummer gir det relevante kravkortet", () => {
  assert.equal(searchRecords("krav 8.15", { limit: 1 })[0].record.id, "req-8-15-17");
  assert.equal(searchRecords("2.1 fysisk datamodell", { limit: 1 })[0].record.id, "req-2-1");
  assert.equal(searchRecords("krav 6.11 offentlig journal", { limit: 1 })[0].record.id, "req-6-11-12");
});

test("metadataelementer finnes direkte", () => {
  const answer = answerQuestion("Hva er systemID?");
  assert.equal(answer.intent, "metadata");
  assert.equal(answer.results[0].record.id, "meta-system-id");
  assert.equal(searchRecords("M025 offentligTittel", { limit: 1 })[0].record.id, "meta-public-title");
});

test("arkivforskrifta paragraf 5 henter alle funksjonsområdene", () => {
  const answer = answerQuestion("Hva krever arkivforskrifta § 5?");
  assert.equal(answer.intent, "section-five");
  assert.equal(answer.status, "ok");
  const ids = new Set(answer.results.map(({ record }) => record.id));
  for (const id of [
    "section-5-metadata",
    "section-5-protect",
    "section-5-trace",
    "section-5-export",
    "section-5-dispose",
    "section-5-retrieve",
    "section-5-journal",
  ]) assert.ok(ids.has(id), id);
});

test("spørsmål utenfor kildegrunnlaget avvises fremfor å gjette", () => {
  const answer = answerQuestion("Hvor mange elefanter bor på månen?");
  assert.equal(answer.status, "insufficient");
  assert.equal(answer.results.length, 0);
  assert.match(answer.lead, /ikke sikkert nok grunnlag/i);
});

test("søkemotoren støtter emne- og kravtypefilter", () => {
  const security = searchRecords("tilgang roller", { topic: "Sikkerhet", limit: 20 });
  assert.ok(security.length > 0);
  assert.ok(security.every(({ record }) => record.topic === "Sikkerhet"));

  const obligatory = listRecords({ requirementType: "O" });
  assert.ok(obligatory.length > 0);
  assert.ok(obligatory.every(({ record }) => record.requirementType === "O"));
});

test("PDF-henvisninger får sideanker og nettveiledning gjør ikke det", () => {
  const pdfRecord = RECORDS.find(({ id }) => id === "req-8-15-17");
  const webRecord = RECORDS.find(({ id }) => id === "noark-voluntary");
  assert.match(sourceUrl(pdfRecord), /\.pdf#page=35$/);
  assert.doesNotMatch(sourceUrl(webRecord), /#page=/);
  assert.match(formatLocation(pdfRecord), /8\.15–8\.17/);
  assert.equal(getSource("noark-v6").shortTitle, "Noark 5 v6.0");
});

test("kildebasen inneholder ikke utdaterte standardkilder", () => {
  const serialized = JSON.stringify({ BUILD_INFO, SOURCES, RECORDS });
  assert.doesNotMatch(serialized, /1992-12-04-126|1998-12-11-1193/);
});

test("intensjonsgjenkjenning dekker sentrale beslutningsspørsmål", () => {
  assert.equal(findIntent("Må vi bytte ut Noark-systemet?").id, "replace-system");
  assert.equal(findIntent("Må fagsystemet integreres mot Noark-kjerne?").id, "integration");
  assert.equal(findIntent("Hvilken er gjeldende versjon?").id, "version");
  assert.equal(findIntent("Hvordan lager vi arkivstruktur.xml?").id, "extract");
});
