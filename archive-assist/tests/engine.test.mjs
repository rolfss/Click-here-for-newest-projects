import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAiAnalysis, applyCommonDefaults, calculateDisposalYear, createMetadata, csvCell, deriveTitle, detectSensitiveData,
  duplicateHashes, extractDateFromName, extractLabeledMetadata, inferDocumentType, inferLanguage,
  manifestCsv, metadataScore, proposeFilename, suggestDocumentTitle, validateMetadata
} from '../engine.mjs';
import { createZip, safeZipPath } from '../zip.mjs';

test('henter ISO-dato fra vanlige filnavn', () => {
  assert.equal(extractDateFromName('2026-08-28_referat.pdf'), '2026-08-28');
  assert.equal(extractDateFromName('referat_28.08.2026.docx'), '2026-08-28');
  assert.equal(extractDateFromName('2026-02-31_feil.txt'), '');
});

test('lager lesbar reserve-tittel av filnavn', () => {
  assert.equal(deriveTitle('2026-08-28_motereferat_anskaffelse_v2_endelig.pdf'), 'Motereferat anskaffelse');
});

test('lager saksdokumenttittel fra dokumentets overskrift fremfor filnavnet', () => {
  const suggestion = suggestDocumentTitle({
    filename: 'scan_00493.txt',
    text: '# Prosedyre for dokumentfangst\n\nFormålet er å sikre riktig registrering.',
    documentType: 'Prosedyre eller rutine'
  });
  assert.equal(suggestion.title, 'Prosedyre for dokumentfangst');
  assert.equal(suggestion.method, 'Lokal innholdsanalyse');
  assert.ok(suggestion.confidence >= 80);
});

test('bruker emne og dokumenttype til presis tittel', () => {
  const suggestion = suggestDocumentTitle({
    filename: 'brev.txt',
    text: 'Emne: Ny løsning for sikker digital post\n\nVi viser til tidligere dialog.',
    documentType: 'Brev'
  });
  assert.equal(suggestion.title, 'Ny løsning for sikker digital post');
});

test('fjerner unødvendige kontaktopplysninger fra tittelforslag', () => {
  const suggestion = suggestDocumentTitle({
    filename: 'henvendelse.txt',
    text: 'Tittel: Henvendelse om byggesak fra kari@example.no 999 88 777\n\nSaken gjelder fasadeendring.',
    documentType: 'Brev'
  });
  assert.equal(suggestion.title, 'Henvendelse om byggesak');
  assert.doesNotMatch(suggestion.title, /@|999/);
});

test('henter uttrykkelige metadata fra dokumentinnhold', () => {
  const metadata = extractLabeledMetadata('Forfatter: Kari Nordmann\nAvdeling: Digital forvaltning\nEmne: Nytt sakssystem\nDato: 28.08.2026');
  assert.deepEqual(metadata, {
    subject: 'Nytt sakssystem', creator: 'Kari Nordmann', organizationalUnit: 'Digital forvaltning',
    documentDate: '2026-08-28', explicitTitle: ''
  });
});

test('createMetadata setter innholdsbasert forslag og kontrollstatus', () => {
  const file = { name: 'ukjent_42.txt', type: 'text/plain', size: 20, lastModified: Date.UTC(2026, 7, 28) };
  const { metadata } = createMetadata(file, 'Vedtak om etablering av nytt dokumentmottak. Saken ble enstemmig vedtatt.', 'a'.repeat(64), {}, new Date('2026-09-02T10:00:00Z'), { extractionMethod: 'Direkte lokal tekstlesing' });
  assert.equal(metadata.title, 'Vedtak om etablering av nytt dokumentmottak');
  assert.equal(metadata.titleSuggestion, metadata.title);
  assert.equal(metadata.titleReviewStatus, 'Ikke gjennomgått');
  assert.equal(metadata.contentExtractionMethod, 'Direkte lokal tekstlesing');
});

test('uttrykkelig dokumentdato prioriteres foran et annet datert filnavn', () => {
  const { metadata } = createMetadata(
    { name: '2040-01-02_brev.txt', size: 50, lastModified: Date.UTC(2040, 0, 2) },
    'Emne: Forespørsel om avleveringsplan\nDato: 14.09.2026\nFrist: 30.11.2026',
    'a'.repeat(64), {}, new Date('2041-03-04T12:00:00Z')
  );
  assert.equal(metadata.documentDate, '2026-09-14');
  assert.ok(metadata.suggestionBasis.includes('dato i dokumentinnhold'));
  assert.ok(!metadata.suggestionBasis.includes('dato i filnavn'));
});

test('kassasjonsår krever en fullstendig gyldig dokumentdato', () => {
  for (const date of ['', '2026', '2026-02', '2026-02-30', '14.09.2026', 'ukjent']) {
    assert.equal(calculateDisposalYear(date, 'Kasseres etter angitt tid', '5'), '', date || 'manglende dato');
  }
  assert.equal(calculateDisposalYear('2026-09-14', 'Kasseres etter angitt tid', '5'), '2031');
  assert.equal(calculateDisposalYear('2026-09-14', 'Bevares', '5'), '');
  const { metadata } = createMetadata({ name: 'udatert.txt' }, 'Brev om avlevering', '', { retentionDecision: 'Kasseres etter angitt tid', retentionYears: '5' });
  assert.equal(metadata.documentDate, '');
  assert.equal(metadata.disposalYear, '');
});

test('AI-forslag erstatter åpent forslag, men ikke menneskeredigert tittel', () => {
  const open = applyAiAnalysis({
    title: 'Gammelt forslag', titleSuggestion: 'Gammelt forslag', titleReviewStatus: 'Ikke gjennomgått',
    originalFileName: 'a.pdf', documentDate: '2026-01-01', keywords: []
  }, { title: 'Vedtak om ny arkivstruktur', rationale: 'Vedtaket er dokumentets hovedhandling.', confidence: 0.91, keywords: ['arkiv'] }, new Date('2026-09-02T10:00:00Z'));
  assert.equal(open.title, 'Vedtak om ny arkivstruktur');
  assert.equal(open.titleSuggestionMethod, 'GPT-6 Luna (medium) · ChatGPT');
  assert.equal(open.aiAnalysisStatus, 'Fullført med GPT-6 Luna (medium) via ChatGPT');
  assert.equal(open.titleSuggestionConfidence, 91);

  const edited = applyAiAnalysis({
    title: 'Min kontrollerte tittel', titleSuggestion: 'Gammelt forslag', titleReviewStatus: 'Redigert av bruker',
    originalFileName: 'a.pdf', documentDate: '2026-01-01', keywords: []
  }, { title: 'Alternativt AI-forslag', rationale: 'Et mulig alternativ.', confidence: 0.7 }, new Date('2026-09-02T10:00:00Z'));
  assert.equal(edited.title, 'Min kontrollerte tittel');
  assert.equal(edited.titleSuggestion, 'Alternativt AI-forslag');
});

test('gjenkjenner dokumenttype fra navn og innhold', () => {
  assert.equal(inferDocumentType('rutine_dokumentfangst.docx', '', ''), 'Prosedyre eller rutine');
  assert.equal(inferDocumentType('slides.pptx', '', ''), 'Presentasjon');
});

test('overordnet sammenheng kan foreslås uten å erstatte en allerede oppgitt relasjon', () => {
  const base = { title:'Lokalt forslag',titleReviewStatus:'Ikke gjennomgått',originalFileName:'a.txt',keywords:[] };
  assert.equal(applyAiAnalysis(base,{title:'Forslag om avlevering',relation:'Sak TEST/2026'}).relation,'Sak TEST/2026');
  assert.equal(applyAiAnalysis({...base,relation:'Kontrollert sak'},{title:'Forslag om avlevering',relation:'Annen sak'}).relation,'Kontrollert sak');
});

test('skiller grovt mellom norsk og engelsk', () => {
  assert.equal(inferLanguage('Dette er et dokument som skal brukes til kontroll og videre arbeid.'), 'nb');
  assert.equal(inferLanguage('This is a document that will be used for review and further work.'), 'en');
});

test('fanger e-post og telefon som mulige personopplysninger', () => {
  const signals = detectSensitiveData('Kontakt kari@example.no eller 999 88 777.');
  assert.ok(signals.includes('E-postadresse'));
  assert.ok(signals.includes('Mulig telefonnummer'));
});

test('validering krever menneskelig kontroll av saksdokumenttittel', () => {
  const findings = validateMetadata({
    title: 'A', creator: 'B', organizationalUnit: 'C', documentDate: '2026-01-01', documentType: 'Notat',
    subject: 'Sak', accessLevel: 'Åpen', retentionDecision: 'Bevares', sha256: 'a'.repeat(64),
    keywords: ['sak'], description: 'Beskrivelse', titleReviewStatus: 'Ikke gjennomgått'
  });
  assert.ok(findings.some(item => item.field === 'titleReviewStatus'));
});

test('validering krever hjemmel ved unntatt offentlighet', () => {
  const findings = validateMetadata({ title: 'A', creator: 'B', organizationalUnit: 'C', documentDate: '2026-01-01', documentType: 'Notat', subject: 'Sak', accessLevel: 'Unntatt offentlighet', retentionDecision: 'Bevares', sha256: 'a'.repeat(64), keywords: ['sak'], description: 'Beskrivelse', titleReviewStatus: 'Godkjent' });
  assert.ok(findings.some(item => item.field === 'accessBasis'));
});

test('felles metadata kan brukes uten å overskrive eksisterende verdi', () => {
  const result = applyCommonDefaults({ creator: 'Eksisterende', accessLevel: 'Ikke vurdert', originalFileName: 'a.pdf', documentDate: '2026-01-01' }, { creator: 'Ny', accessLevel: 'Intern' }, false);
  assert.equal(result.creator, 'Eksisterende');
  assert.equal(result.accessLevel, 'Intern');
});

test('poengsum øker når sentrale felt fylles', () => {
  const low = metadataScore({ title: 'Tittel' });
  const high = metadataScore({ title: 'Tittel', description: 'Beskrivelse', creator: 'Kari', organizationalUnit: 'Arkiv', documentDate: '2026-01-01', documentType: 'Notat', subject: 'Sak', keywords: ['arkiv'], classificationCode: '041', accessLevel: 'Åpen', retentionDecision: 'Bevares', sha256: 'a'.repeat(64) });
  assert.ok(high > low);
  assert.equal(high, 100);
});

test('foreslått filnavn er plattformvennlig', () => {
  assert.equal(proposeFilename({ title: 'Årsrapport – økonomi', documentDate: '2026-03-01' }, 'PDF'), '2026-03-01_arsrapport-okonomi.pdf');
});

test('CSV inkluderer tittelkontroll og nøytraliserer formelstart', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  const csv = manifestCsv([{ metadata: { title: 'A, B', titleReviewStatus: 'Godkjent' } }]);
  assert.match(csv, /"A, B"/);
  assert.match(csv, /"Tittelkontroll"/);
  assert.match(csv, /"Godkjent"/);
});

test('duplikater grupperes etter SHA-256', () => {
  const groups = duplicateHashes([{ metadata: { sha256: 'a'.repeat(64) } }, { metadata: { sha256: 'a'.repeat(64) } }, { metadata: { sha256: 'b'.repeat(64) } }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0][1].length, 2);
});

test('ZIP-bygger lager gyldige ZIP-signaturer og renser sti', async () => {
  assert.equal(safeZipPath('../metadata/a?.json'), 'metadata/a_.json');
  const blob = await createZip([{ name: 'test.txt', data: 'hei' }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});
