import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractTextFromBytes, listZipEntries, readZipEntry } from '../extract.mjs';
import { createMetadata, manifestJson, validateMetadata } from '../engine.mjs';
import { createZip } from '../zip.mjs';

const fixtureRoot = new URL('./fixtures/', import.meta.url);
const { cases } = JSON.parse(await readFile(new URL('fasit.json', fixtureRoot), 'utf8'));
const fileTimestamp = Date.UTC(2040, 0, 2, 12);
const importTime = new Date('2041-03-04T12:00:00Z');
const normalized = value => value.replace(/\s+/g, ' ').trim();
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

async function analyze(id) {
  const fixture = cases.find(item => item.id === id);
  assert.ok(fixture, `Ukjent syntetisk testdokument ${id}`);
  const bytes = new Uint8Array(await readFile(new URL(fixture.file, fixtureRoot)));
  const original = bytes.slice();
  const name = fixture.file.split('/').pop();
  const extraction = await extractTextFromBytes(bytes, name);
  const { metadata } = createMetadata(
    { name, size: bytes.byteLength, lastModified: fileTimestamp },
    extraction.text, checksum(bytes), {}, importTime, extraction
  );
  assert.deepEqual(bytes, original, `${name}: analyse endret originalbyteinnhold`);
  return { fixture, bytes, extraction, metadata };
}

test('syntetisk fasit omfatter ti uendrede originalfiler', async () => {
  assert.equal(cases.length, 10);
  assert.equal(new Set(cases.map(item => item.file)).size, 10);
  for (const fixture of cases) {
    const bytes = await readFile(new URL(fixture.file, fixtureRoot));
    assert.equal(checksum(bytes), fixture.sha256, fixture.file);
  }
});

for (const fixture of cases) {
  test(`${fixture.id}: påkrevde kildeelementer overlever tekstuttrekk`, async () => {
    const { extraction } = await analyze(fixture.id);
    if (fixture.id === '02') assert.ok(extraction.warnings.some(warning => warning.includes('Windows-1252')));
    else assert.deepEqual(extraction.warnings, [], fixture.file);
    const text = normalized(extraction.text);
    for (const required of fixture.must_preserve) {
      assert.ok(text.includes(normalized(required)), `${fixture.file}: mangler «${required}»`);
    }
  });

  test(`${fixture.id}: dokumentdato kommer fra kilden, ikke filstempel/importtid`, async () => {
    const { metadata } = await analyze(fixture.id);
    assert.equal(metadata.documentDate || null, fixture.expected.document_date);
    if (fixture.expected.document_date === null) {
      assert.ok(validateMetadata(metadata).some(finding => finding.field === 'documentDate'),
        'Udatert kilde må kreve manuell avklaring');
      assert.match(metadata.proposedFileName, /^udatert_/);
    }
  });
}

test('02: Windows-1252 beholder norske tegn i kilde og tittelforslag', async () => {
  const { fixture, extraction, metadata } = await analyze('02');
  assert.doesNotMatch(extraction.text, /\uFFFD/);
  assert.ok(extraction.text.includes(fixture.expected.sender));
  assert.equal(metadata.title, fixture.expected.title);
});

test('03: alle tre Word-listepunkter beholdes i opprinnelig rekkefølge', async () => {
  const { fixture, extraction } = await analyze('03');
  let previous = -1;
  for (const point of fixture.must_preserve) {
    const position = extraction.text.indexOf(point);
    assert.ok(position > previous, `Listepunkt mangler eller har flyttet seg: ${point}`);
    previous = position;
  }
});

test('04: Word-tabellen beholder cellekobling og plass mellom listepunktene', async () => {
  const { extraction } = await analyze('04');
  assert.match(normalized(extraction.text), /Kontroller status i tabellen\. Avvik Status A-17 Lukket A-18 Åpent Bekreft at A-17 er lukket\. Følg opp A-18 innen fristen\./);
});

test('05: Excel-rader forekommer én gang og beholder radgrenser', async () => {
  const { extraction } = await analyze('05');
  for (const id of ['TEST-P01', 'TEST-P02']) {
    assert.equal(extraction.text.split(id).length - 1, 1, `${id} skal ikke dupliseres`);
  }
  const lines = extraction.text.split('\n').map(normalized).filter(Boolean);
  assert.ok(lines.includes('TEST-P01 12 Godkjent'), 'Første rad må forbli en samlet, avgrenset rad');
  assert.ok(lines.includes('TEST-P02 7 Mangler vedlegg'), 'Andre rad må forbli en samlet, avgrenset rad');
});

test('05: Excel-tittel bygger på Emne-cellen uten tabell- eller metadatastøy', async () => {
  const { fixture, metadata } = await analyze('05');
  assert.ok(metadata.title.toLocaleLowerCase('nb').includes(fixture.expected.title.toLocaleLowerCase('nb')));
  assert.doesNotMatch(metadata.title, /syntetisk|\bemne\b|\bdato\b|avsender|prøveby|TEST-P0[12]/i);
});

test('06: tom e-posttekstdel bruker HTML-innhold uten MIME-grenser og delhoder', async () => {
  const { extraction } = await analyze('06');
  assert.ok(extraction.text.includes('Vedlegg V-03 mangler i pakke TEST-P02.'));
  assert.doesNotMatch(extraction.text, /--syntetisk|Content-Type:|Content-Transfer-Encoding:/i);
});

test('07 og 09: dokumentets hovedtittel vinner over portal- og underoverskrifter', async () => {
  for (const id of ['07', '09']) {
    const { fixture, metadata } = await analyze(id);
    assert.equal(metadata.title, fixture.expected.title);
  }
});

test('08: CSV-emnet blir en lesbar tittel, og sitert semikolon beholdes', async () => {
  const { fixture, extraction, metadata } = await analyze('08');
  assert.ok(extraction.text.includes('Be om presisering; ikke gjett'));
  assert.doesNotMatch(extraction.text, /^\uFEFF/);
  assert.ok(metadata.title.toLocaleLowerCase('nb').includes(fixture.expected.title.toLocaleLowerCase('nb')));
  assert.doesNotMatch(metadata.title, /(?:^|\s)emne[;:]/i);
});

test('10: XML-emnet blir tittel uten avsender eller brødtekst', async () => {
  const { fixture, metadata } = await analyze('10');
  assert.equal(metadata.title, fixture.expected.title);
});

test('ZIP-eksport bevarer alle originalbyte og kobler metadata til riktig dokument', async () => {
  const analyzed = await Promise.all(cases.map(fixture => analyze(fixture.id)));
  const records = analyzed.map(({ metadata }) => ({ metadata }));
  const manifest = manifestJson(records);
  const exported = JSON.parse(manifest);
  assert.equal(exported.fileCount, cases.length);
  for (const { fixture, metadata } of analyzed) {
    const exportedMetadata = exported.files.find(item => item.originalFileName === metadata.originalFileName);
    assert.equal(exportedMetadata.sha256, fixture.sha256);
    assert.equal(exportedMetadata.title, metadata.title);
    assert.equal(exportedMetadata.titleReviewStatus, 'Ikke gjennomgått');
  }
  const blob = await createZip([
    ...analyzed.map(({ fixture, bytes }) => ({ name: fixture.file, data: bytes })),
    { name: 'manifest.json', data: manifest }
  ]);
  const archive = new Uint8Array(await blob.arrayBuffer());
  const entries = listZipEntries(archive);
  assert.equal(entries.length, cases.length + 1);
  for (const { fixture, bytes } of analyzed) {
    const exportedBytes = await readZipEntry(archive, entries.find(entry => entry.name === fixture.file));
    assert.deepEqual(exportedBytes, bytes, fixture.file);
    assert.equal(checksum(exportedBytes), fixture.sha256, fixture.file);
  }
});
