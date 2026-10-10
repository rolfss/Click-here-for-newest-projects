import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BUILD_INFO, LEGACY_CORPUS_VERSION, RECORDS, SOURCES } from '../data.mjs';
import { FORMAT_ROWS, GUIDANCE_RECORDS, GUIDANCE_SOURCES } from '../guidance-data.mjs';
import { searchRecords, answerQuestion, getRecord, sourceUrl } from '../engine.mjs';
import { retrieveConversation, finalizeAnswer } from '../rag-shared.mjs';
import { acceptedCorpus, needsUpdatedCorpus, validateUiAnswer } from '../luna-client.mjs';
import { buildPayload } from '../../noark-api/worker.mjs';

const fixtures = [
  ['Kan DOCX avleveres til Nasjonalarkivet?', 'format-docx'],
  ['Kan XLSX avleveres?', 'format-xlsx'],
  ['Er PDF/A-3 godkjent ved avlevering?', 'format-pdfa-3a'],
  ['SIARD 2.2', 'format-siard'], ['Godtar Nasjonalarkivet DWG?', 'guide-format-unlisted'],
  ['Hvordan etablere internkontroll?', 'guide-control-steps'],
  ['Kartlegg systemer HR økonomi fagsystem', 'guide-appraisal-systems'],
  ['Skanning kvalitetskontroll metadata papirarkiv', 'guide-paper-quality'],
  ['Kan papiroriginaler destrueres etter skanning?', 'guide-paper-destruction'],
  ['Kommunal mediekonvertering IKA', 'guide-paper-municipal'],
  ['Kassasjon av enkeltopplysninger søknad innstilling', 'guide-single-process'],
  ['Bevaringskriterier § 2', 'guide-preservation-criteria'],
  ['Arkade PDF/A validering 2.12.5', 'guide-arkade-pdfa'],
  ['Arkade PRONOM formatanalyse', 'guide-arkade-analysis'],
];
for (const [q, expected] of fixtures) test(`guidance retrieval: ${q}`, () => {
  assert.ok(searchRecords(q, { limit: 3 }).some((r) => r.record.id === expected));
});

test('new catalogue has section-level provenance and unique IDs', () => {
  assert.equal(RECORDS.length, 170); assert.equal(SOURCES.length, 21); assert.equal(FORMAT_ROWS.length, 65);
  assert.equal(new Set(RECORDS.map((r) => r.id)).size, RECORDS.length);
  for (const source of GUIDANCE_SOURCES) {
    assert.equal(new URL(source.url).protocol, 'https:'); assert.equal(source.verifiedAt, '2026-09-07');
    assert.ok(source.scope); assert.ok(source.status);
  }
  for (const record of GUIDANCE_RECORDS) { assert.ok(record.section); assert.ok(sourceUrl(record).startsWith('https://')); }
});
test('format rows retain specific versions and PUIDs without inventing universal acceptance', () => {
  assert.match(getRecord('format-siard').detail, /2\.2/); assert.match(getRecord('format-siard').detail, /fmt\/1777/);
  assert.match(getRecord('format-pdfa-3u').detail, /fmt\/481/);
  assert.match(getRecord('format-docx').detail, /ikke en garanti for alle versjoner/);
  assert.match(getRecord('guide-format-unlisted').summary, /ikke et dokumentert generelt forbud/);
});
test('format conditions are retained within the bounded model candidate set', () => {
  const candidates = retrieveConversation('Er PDF/A-3 akseptert ved avlevering?');
  assert.ok(candidates.length <= 12);
  assert.ok(candidates.some((r) => r.record.id === 'guide-format-agreement'));
  assert.ok(candidates.some((r) => r.record.id === 'guide-format-conversion'));
  const payload = buildPayload('Er PDF/A-3 akseptert ved avlevering?', [], candidates);
  const input = JSON.parse(payload.body.input[0].content);
  assert.ok(input.source_records.some((r) => r.scope === 'Avlevering til Nasjonalarkivet'));
  assert.equal(payload.body.max_output_tokens, 8192);
  assert.equal(payload.body.reasoning.effort, 'medium');
  assert.ok(payload.reserve < 30000);
});
test('relevance scores remain question-specific, bounded and independently sorted', () => {
  for (const [q] of fixtures) {
    const a = answerQuestion(q);
    assert.ok(a.results.every((r, i) => r.relevance >= 0 && r.relevance < 100 && (!i || a.results[i - 1].relevance >= r.relevance)));
    assert.equal(searchRecords(q, { limit: 1 })[0].relevance, searchRecords(q, { limit: 12 })[0].relevance);
  }
});
test('recognised old Worker remains usable only for its unchanged source catalogue', () => {
  assert.ok(acceptedCorpus(LEGACY_CORPUS_VERSION)); assert.ok(acceptedCorpus(BUILD_INFO.corpusVersion));
  assert.equal(acceptedCorpus('untrusted-version'), false);
  assert.equal(needsUpdatedCorpus('Hva er systemID?'), false);
  assert.equal(needsUpdatedCorpus('Er PDF/A-3 godkjent ved avlevering?'), true);
  const q = 'Hva er systemID?'; const candidates = retrieveConversation(q);
  const result = finalizeAnswer(q, { status: 'answered', claims: [{ text: 'systemID er en identifikator.', recordIds: [candidates[0].record.id] }], limitation: '',
    relevance: candidates.map((r) => ({ recordId: r.record.id, score: 90, reason: 'Relevant identifikator.' })) }, candidates);
  const checked = validateUiAnswer({ ...result, corpusVersion: LEGACY_CORPUS_VERSION });
  assert.match(checked.guidance, /eldre kildegrunnlaget/);
  result.results[0].record = getRecord('format-docx');
  assert.throws(() => validateUiAnswer({ ...result, corpusVersion: LEGACY_CORPUS_VERSION }));
});
test('text logging is a separate, unchecked, capability-gated opt-in', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const control = html.match(/<input[^>]*id="quality-consent"[^>]*>/)[0];
  assert.doesNotMatch(control, /\bchecked\b/); assert.match(control, /disabled/);
  assert.match(html, /ikke garantert anonymisering/); assert.match(html, /30 dager/);
  assert.match(html, /ikke spørsmålstekst/);
});
