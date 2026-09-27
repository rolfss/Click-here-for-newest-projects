import test from 'node:test';
import assert from 'node:assert/strict';
import { emailToText, extractOfficeText, extractPdfText, extractTextFromBytes, listZipEntries, markupToText, readZipEntry } from '../extract.mjs';
import { createZip } from '../zip.mjs';
import { createMetadata, extractLabeledMetadata } from '../engine.mjs';

test('HTML gjøres om til lesbart innhold', () => {
  assert.match(markupToText('<h1>Rapport om arkiv</h1><p>Dette er innholdet.</p>'), /Rapport om arkiv[\s\S]*Dette er innholdet/);
});

test('EML gir emne og lesbar meldingstekst', () => {
  const text = emailToText('From: Kari <kari@example.no>\r\nSubject: Svar på henvendelse\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nVi viser til saken.');
  assert.match(text, /Emne: Svar på henvendelse/);
  assert.match(text, /Vi viser til saken/);
});

test('ZIP-leseren henter XML fra en Office-lignende pakke', async () => {
  const zip = await createZip([
    { name: 'docProps/core.xml', data: '<cp:coreProperties><dc:title>Prosedyre for journalføring</dc:title><dc:creator>Kari Nordmann</dc:creator></cp:coreProperties>' },
    { name: 'word/document.xml', data: '<w:document><w:body><w:p><w:r><w:t>Kontroller dokumenttittel før registrering.</w:t></w:r></w:p></w:body></w:document>' }
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const entries = listZipEntries(bytes);
  assert.equal(entries.length, 2);
  assert.match(new TextDecoder().decode(await readZipEntry(bytes, entries[1])), /Kontroller dokumenttittel/);
  const extracted = await extractOfficeText(bytes, 'docx');
  assert.match(extracted.text, /Tittel: Prosedyre for journalføring/);
  assert.match(extracted.text, /Kontroller dokumenttittel før registrering/);
});

test('grunnleggende PDF-leser finner tekstoperatorer', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Length 55 >> stream\nBT /F1 12 Tf 72 720 Td (Vedtak om nytt arkivdepot) Tj ET\nendstream\nendobj\n%%EOF';
  const extracted = await extractPdfText(new TextEncoder().encode(source));
  assert.match(extracted.text, /Vedtak om nytt arkivdepot/);
});

test('tekstformat leses direkte fra byteinnhold', async () => {
  const extracted = await extractTextFromBytes(new TextEncoder().encode('# Rapport om dokumentfangst'), 'rapport.md', 'text/markdown');
  assert.equal(extracted.extractionMethod, 'Direkte lokal tekstlesing');
  assert.match(extracted.text, /Rapport om dokumentfangst/);
});

test('Excel sharedStrings leses bare ved cellereferanser, med tomme kolonner bevart', async () => {
  const zip = await createZip([
    { name: 'xl/sharedStrings.xml', data: '<sst><si><t>TEST-P01</t></si><si><r><t>God</t></r><r><t>kjent</t></r></si><si><t>IKKE BRUKT I ARKET</t></si></sst>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>TEST-P02</t></is></c><c r="C2" t="inlineStr"><is><t>Mangler vedlegg</t></is></c></row></sheetData></worksheet>' }
  ]);
  const extracted = await extractOfficeText(new Uint8Array(await zip.arrayBuffer()), 'xlsx');
  assert.deepEqual(extracted.text.split('\n'), ['TEST-P01\t12\tGodkjent', 'TEST-P02\t\tMangler vedlegg']);
  assert.equal(extracted.text.split('TEST-P01').length - 1, 1);
  assert.doesNotMatch(extracted.text, /IKKE BRUKT I ARKET/);
});

test('MIME respekterer oppgitt Windows-1252 i kodet emne og meldingstekst', () => {
  const source = 'From: arkiv@example.invalid\nSubject: =?windows-1252?Q?=C5rlig_gjennomgang_av_arkivn=F8kler?=\nContent-Type: text/plain; charset=windows-1252\nContent-Transfer-Encoding: quoted-printable\n\nKontroller bl=E5b=E6r, =F8velse og =C5s.';
  const extracted = emailToText(source);
  assert.match(extracted, /Emne: Årlig gjennomgang av arkivnøkler/);
  assert.match(extracted, /Kontroller blåbær, øvelse og Ås\./);
});

test('MIME alternative velger én lesbar del, mens vedlegg ikke blir meldingstekst', () => {
  const source = 'Content-Type: multipart/mixed; boundary="outer"\n\n--outer\nContent-Type: multipart/alternative; boundary="inner"\n\n--inner\nContent-Type: text/plain\n\nVedlegg V-03 mangler.\n--inner\nContent-Type: text/html\n\n<p>Vedlegg V-03 mangler.</p>\n--inner--\n--outer\nContent-Type: text/plain\nContent-Disposition: attachment; filename="note.txt"\n\nDETTE ER ET VEDLEGG\n--outer--';
  const extracted = emailToText(source);
  assert.equal(extracted.trim(), 'Vedlegg V-03 mangler.');
});

test('XLSX støtter prefikserte XML-navn og begge typer attributtsitater', async () => {
  const zip = await createZip([
    { name: 'xl/sharedStrings.xml', data: '<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>Viktig dokumenttekst</x:t></x:si><x:si><x:r><x:t>God</x:t></x:r><x:r><x:t>kjent</x:t></x:r></x:si></x:sst>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r='1'><x:c r='A1' t='s'><x:v>0</x:v></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>Bevares i ti år</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="s"><x:v>1</x:v></x:c><x:c r='B2'><x:v>12</x:v></x:c></x:row></x:sheetData></x:worksheet>` }
  ]);
  const extracted = await extractOfficeText(new Uint8Array(await zip.arrayBuffer()), 'xlsx');
  assert.deepEqual(extracted.warnings, []);
  assert.deepEqual(extracted.text.split('\n'), ['Viktig dokumenttekst\t\tBevares i ti år', 'Godkjent\t12']);
});

test('inline videresendt EML beholder meldingens hoder og innhold, også base64', () => {
  const forwarded = 'From: sender@example.invalid\nSubject: Vedtak om depot\nDate: Mon, 14 Sep 2026 10:00:00 +0200\nContent-Type: text/plain; charset=utf-8\n\nNytt depot skal etableres innen 1. november.';
  for (const transfer of ['', 'base64']) {
    const body = transfer ? Buffer.from(forwarded).toString('base64') : forwarded;
    const source = `Subject: Videresender vedtak\nContent-Type: multipart/mixed; boundary="outer"\n\n--outer\nContent-Type: text/plain\n\nSe videresendt vedtak nedenfor.\n--outer\nContent-Type: message/rfc822\nContent-Disposition: inline\n${transfer ? 'Content-Transfer-Encoding: base64\n' : ''}\n${body}\n--outer--`;
    const extracted = emailToText(source);
    assert.match(extracted, /Emne: Videresender vedtak/);
    assert.match(extracted, /Emne: Vedtak om depot/);
    assert.match(extracted, /Dato: Mon, 14 Sep 2026/);
    assert.match(extracted, /Nytt depot skal etableres innen 1\. november\./);
    assert.doesNotMatch(extracted, /Content-Type:|Content-Disposition:|--outer/);
  }
});

test('CSV-kolonneoverskrifter blir ikke feilaktige emne- eller forfatterverdier', async () => {
  for (const source of ['Emne,Dato\nInnsyn i møtereferat,2026-09-02\n', 'Forfatter;Emne;Dato\nKari Nordmann;Innsyn i møtereferat;2026-09-02\n']) {
    const extracted = await extractTextFromBytes(new TextEncoder().encode(source), 'register.csv');
    const labeled = extractLabeledMetadata(extracted.text);
    assert.equal(labeled.subject, '');
    assert.equal(labeled.creator, '');
    const { metadata } = createMetadata({ name: 'register.csv' }, extracted.text);
    assert.ok(metadata.title.toLocaleLowerCase('nb').includes('innsyn i møtereferat'));
    assert.notEqual(metadata.titleSuggestionConfidence, 92);
  }
  const labeledRows = await extractTextFromBytes(new TextEncoder().encode('Emne;Kontroll av avlevering\nDato;14.09.2026\n'), 'metadata.csv');
  assert.equal(extractLabeledMetadata(labeledRows.text).subject, 'Kontroll av avlevering');
  assert.equal(extractLabeledMetadata(labeledRows.text).documentDate, '2026-09-14');
});

test('Office opprettelsesdato fortrenger ikke dokumentdato fra innhold eller filnavn', async () => {
  for (const bodyDate of ['Dato: 14.09.2026', '']) {
    const zip = await createZip([
      { name: 'docProps/core.xml', data: '<cp:coreProperties><dcterms:created>2040-01-02</dcterms:created></cp:coreProperties>' },
      { name: 'word/document.xml', data: `<w:document><w:p><w:r><w:t>Vedtak om depot</w:t></w:r></w:p><w:p><w:r><w:t>${bodyDate}</w:t></w:r></w:p></w:document>` }
    ]);
    const extracted = await extractOfficeText(new Uint8Array(await zip.arrayBuffer()), 'docx');
    assert.match(extracted.text, /Teknisk opprettelsesdato: 2040-01-02/);
    const expected = bodyDate ? '2026-09-14' : '2025-02-03';
    const { metadata } = createMetadata({ name: '2025-02-03_brev.docx' }, extracted.text);
    assert.equal(metadata.documentDate, expected);
    assert.equal(metadata.title, 'Vedtak om depot');
    assert.equal(createMetadata({ name: 'udatert.docx' }, extracted.text).metadata.documentDate, bodyDate ? '2026-09-14' : '');
  }
});

test('PDF opprettelsesdato fortrenger ikke dokumentdato fra innhold eller filnavn', async () => {
  for (const bodyDate of ['Dato: 14.09.2026', 'Vedtak om depot']) {
    const source = `%PDF-1.4\n1 0 obj << /CreationDate (D:20400102000000) /Length 26 >> stream\nBT (Vedtak om depot) Tj ET\nendstream\nendobj\n2 0 obj << /Length 40 >> stream\nBT (${bodyDate}) Tj ET\nendstream\nendobj\n%%EOF`;
    const extracted = await extractPdfText(new TextEncoder().encode(source));
    assert.match(extracted.text, /Teknisk opprettelsesdato: 2040-01-02/);
    const explicit = bodyDate.startsWith('Dato:');
    const { metadata } = createMetadata({ name: '2025-02-03_brev.pdf' }, extracted.text);
    assert.equal(metadata.documentDate, explicit ? '2026-09-14' : '2025-02-03');
    assert.equal(metadata.title, 'Vedtak om depot');
    assert.equal(createMetadata({ name: 'udatert.pdf' }, extracted.text).metadata.documentDate, explicit ? '2026-09-14' : '');
  }
});
