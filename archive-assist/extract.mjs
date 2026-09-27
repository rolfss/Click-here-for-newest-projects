import { extensionOf, isTextReadable, mimeTypeFor } from './engine.mjs';

const encoder = new TextEncoder();
const utf8 = new TextDecoder('utf-8', { fatal: false });
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1', { fatal: false });
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 160000;

function result(text = '', extractionMethod = 'Ingen tekst hentet', warnings = []) {
  const normalized = normalizeExtractedText(text).slice(0, MAX_EXTRACTED_CHARS);
  return { text: normalized, extractionMethod, warnings: [...new Set(warnings.filter(Boolean))] };
}

function normalizeExtractedText(value = '') {
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

export function markupToText(markup = '') {
  return decodeEntities(String(markup)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:p|div|section|article|header|footer|h[1-6]|li|tr|br|w:p|a:p|text:p|table:table-row)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:td|th|w:tab|a:tab|table:table-cell)\b[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, ' '));
}

function decodeWithCharset(bytes, charset = 'utf-8') {
  try { return new TextDecoder(charset, { fatal: false }).decode(bytes); }
  catch { return utf8.decode(bytes); }
}

function decodeQuotedPrintable(value = '', charset = 'utf-8') {
  const unfolded = String(value).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < unfolded.length; i += 1) {
    if (unfolded[i] === '=' && /^[0-9A-F]{2}$/i.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(unfolded.charCodeAt(i) & 0xff);
    }
  }
  return decodeWithCharset(new Uint8Array(bytes), charset);
}

function bytesFromBase64(value = '') {
  const clean = String(value).replace(/\s+/g, '');
  if (!clean) return new Uint8Array();
  if (typeof atob === 'function') {
    const binary = atob(clean);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }
  return new Uint8Array();
}

function decodeMimeWord(value = '') {
  return String(value).replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, encoding, data) => {
    try {
      if (encoding.toLowerCase() === 'b') return decodeWithCharset(bytesFromBase64(data), charset);
      return decodeQuotedPrintable(data.replace(/_/g, ' '), charset);
    } catch {
      return data;
    }
  });
}

function splitEmailPart(source = '') {
  const text = String(source).replace(/\r\n?/g, '\n');
  const splitAt = text.indexOf('\n\n');
  const rawHeaders = splitAt >= 0 ? text.slice(0, splitAt) : text;
  return { headers: rawHeaders.replace(/\n[ \t]+/g, ' '), body: splitAt >= 0 ? text.slice(splitAt + 2) : '' };
}

function emailBody(headers, body, depth = 0) {
  if (depth > 8 || /^Content-Disposition:\s*attachment\b/im.test(headers)) return { text: '', kind: '' };
  const contentType = headers.match(/^Content-Type:\s*([^\n]+)/im)?.[1] || 'text/plain';
  const kind = contentType.split(';')[0].trim().toLowerCase();
  const charset = contentType.match(/\bcharset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (kind.startsWith('multipart/')) {
    const match = contentType.match(/\bboundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = match?.[1] || match?.[2];
    if (!boundary || boundary.length > 200) return { text: '', kind };
    const parts = [];
    let lines = null;
    for (const line of body.split('\n')) {
      if (line.trimEnd() === `--${boundary}` || line.trimEnd() === `--${boundary}--`) {
        if (lines) {
          const part = splitEmailPart(lines.join('\n'));
          parts.push(emailBody(part.headers, part.body, depth + 1));
        }
        lines = [];
        if (line.trimEnd() === `--${boundary}--`) { lines = null; break; }
      } else if (lines) lines.push(line);
    }
    if (lines?.length) {
      const part = splitEmailPart(lines.join('\n'));
      parts.push(emailBody(part.headers, part.body, depth + 1));
    }
    const readable = parts.filter(part => part.text.trim());
    if (kind === 'multipart/alternative') {
      return readable.find(part => part.kind === 'text/plain') || readable.find(part => part.kind === 'text/html') || readable[0] || { text: '', kind };
    }
    return { text: readable.map(part => part.text).join('\n\n'), kind };
  }
  if (!['text/plain', 'text/html', 'message/rfc822'].includes(kind)) return { text: '', kind };
  const transfer = headers.match(/^Content-Transfer-Encoding:\s*([^\n]+)/im)?.[1]?.trim().toLowerCase();
  const encoding = charset?.[1] || charset?.[2] || 'utf-8';
  try {
    if (transfer === 'base64') body = decodeWithCharset(bytesFromBase64(body), encoding);
    else if (transfer === 'quoted-printable') body = decodeQuotedPrintable(body, encoding);
  } catch { return { text: '', kind }; }
  if (kind === 'message/rfc822') return { text: emailText(body, depth + 1), kind };
  return { text: kind === 'text/html' ? markupToText(body) : body, kind };
}

function emailText(source, depth) {
  if (depth > 8) return '';
  const { headers, body } = splitEmailPart(source);
  const selected = [];
  for (const [label, pattern] of [
    ['Fra', /^From:\s*(.+)$/im], ['Til', /^To:\s*(.+)$/im], ['Emne', /^Subject:\s*(.+)$/im], ['Dato', /^Date:\s*(.+)$/im]
  ]) {
    const match = headers.match(pattern);
    if (match) selected.push(`${label}: ${decodeMimeWord(match[1]).trim()}`);
  }
  return [...selected, emailBody(headers, body, depth).text].filter(Boolean).join('\n\n');
}

export function emailToText(source = '') {
  return emailText(source, 0);
}

function selectedOfficeEntries(extension, names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const common = sorted.filter(name => /^docProps\/(core|app)\.xml$/i.test(name));
  if (extension === 'docx') return [...common, ...sorted.filter(name => /^word\/(document|header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(name))];
  if (extension === 'pptx') return [...common, ...sorted.filter(name => /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i.test(name))];
  if (extension === 'xlsx') return [...common, ...sorted.filter(name => /^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$/i.test(name))];
  if (['odt', 'ods', 'odp'].includes(extension)) return sorted.filter(name => /^(content|meta)\.xml$/i.test(name));
  return [];
}

function xmlTextRuns(xml = '') {
  return [...String(xml).matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/gi)]
    .map(match => decodeEntities(match[1].replace(/<[^>]+>/g, ''))).join('');
}

function worksheetToText(xml, sharedStrings) {
  const rows = [];
  for (const row of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/gi)) {
    const cells = [];
    for (const cell of row[1].matchAll(/<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/gi)) {
      const attributes = cell[1];
      const body = cell[2] || '';
      const type = attributes.match(/\bt\s*=\s*(["'])(.*?)\1/)?.[2] || '';
      const reference = attributes.match(/\br\s*=\s*(["'])([A-Z]+)\d+\1/i)?.[2];
      let column = cells.length;
      if (reference) {
        column = [...reference.toUpperCase()].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
        if (column < 0 || column >= 16384) continue;
      }
      while (cells.length < column) cells.push('');
      const value = body.match(/<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/i)?.[1] || '';
      cells[column] = type === 's' ? (/^\d+$/.test(value) ? (sharedStrings[Number(value)] || '') : '')
        : type === 'inlineStr' ? xmlTextRuns(body) : decodeEntities(value);
    }
    if (cells.some(Boolean)) rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

function wordTableRows(xml) {
  return xml.replace(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi, (_, row) => {
    const cells = [...row.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi)]
      .map(cell => markupToText(cell[1]).replace(/\s+/g, ' ').trim());
    return `\n${cells.join('\t')}\n`;
  });
}

function officeXmlToText(xml = '', name = '') {
  const metadata = [];
  const tagValue = tag => {
    const match = String(xml).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? normalizeExtractedText(markupToText(match[1])) : '';
  };
  if (/docProps\/core\.xml$/i.test(name) || /^meta\.xml$/i.test(name)) {
    const title = tagValue('dc:title') || tagValue('meta:title');
    const creator = tagValue('dc:creator') || tagValue('meta:initial-creator');
    const date = tagValue('dcterms:created') || tagValue('meta:creation-date');
    const subject = tagValue('dc:subject') || tagValue('meta:subject');
    if (title) metadata.push(`Tittel: ${title}`);
    if (subject) metadata.push(`Emne: ${subject}`);
    if (creator) metadata.push(`Forfatter: ${creator}`);
    if (date) metadata.push(`Teknisk opprettelsesdato: ${date}`);
  }
  const body = markupToText(wordTableRows(String(xml))
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<a:br\b[^>]*\/>/gi, '\n'));
  return [...metadata, body].filter(Boolean).join('\n');
}

function findEocd(bytes) {
  const minimum = Math.max(0, bytes.length - 65557);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

export function listZipEntries(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error('Fant ikke ZIP-katalogen.');
  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const entries = [];
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Ugyldig ZIP-katalog.');
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + filenameLength);
    const name = (flags & 0x0800 ? utf8 : latin1).decode(nameBytes);
    entries.push({ name, compression, compressedSize, uncompressedSize, localOffset });
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
}

async function decompress(bytes, format) {
  if (typeof DecompressionStream !== 'function') throw new Error('Nettleseren støtter ikke lokal dekomprimering.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntry(bytesLike, entry) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Ugyldig lokal ZIP-post: ${entry.name}`);
  const filenameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + filenameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length || entry.uncompressedSize > 12 * 1024 * 1024) throw new Error(`ZIP-posten er for stor eller ugyldig: ${entry.name}`);
  const data = bytes.slice(start, end);
  if (entry.compression === 0) return data;
  if (entry.compression === 8) return decompress(data, 'deflate-raw');
  throw new Error(`Komprimeringsmetode ${entry.compression} støttes ikke.`);
}

export async function extractOfficeText(bytesLike, extension) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const entries = listZipEntries(bytes);
  const selected = selectedOfficeEntries(extension, entries.map(entry => entry.name));
  if (!selected.length) return result('', 'Office-/OpenDocument-uttrekk', ['Ingen kjente tekstdeler ble funnet i dokumentpakken.']);
  const entryMap = new Map(entries.map(entry => [entry.name, entry]));
  const chunks = [];
  const warnings = [];
  let sharedStrings = [];
  const sharedEntry = entryMap.get('xl/sharedStrings.xml');
  if (extension === 'xlsx' && sharedEntry) {
    try {
      const xml = utf8.decode(await readZipEntry(bytes, sharedEntry));
      sharedStrings = [...xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi)].map(match => xmlTextRuns(match[1]));
    } catch (error) { warnings.push(`xl/sharedStrings.xml: ${error.message}`); }
  }
  for (const name of selected) {
    // Shared strings are a lookup table, not additional document content.
    if (extension === 'xlsx' && name === 'xl/sharedStrings.xml') continue;
    if (chunks.join('\n').length >= MAX_EXTRACTED_CHARS) break;
    try {
      const data = await readZipEntry(bytes, entryMap.get(name));
      const xml = utf8.decode(data);
      chunks.push(extension === 'xlsx' && /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
        ? worksheetToText(xml, sharedStrings) : officeXmlToText(xml, name));
    } catch (error) {
      warnings.push(`${name}: ${error.message}`);
    }
  }
  return result(chunks.join('\n\n'), 'Lokal tekstuttrekking fra Office/OpenDocument', warnings);
}

function decodePdfLiteral(source = '') {
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    let char = source[index];
    if (char !== '\\') {
      bytes.push(char.charCodeAt(0) & 0xff);
      continue;
    }
    char = source[index + 1] || '';
    index += 1;
    const escaped = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
    if (escaped[char] !== undefined) {
      bytes.push(escaped[char]);
      continue;
    }
    if (/[0-7]/.test(char)) {
      let octal = char;
      for (let count = 0; count < 2 && /[0-7]/.test(source[index + 1] || ''); count += 1) octal += source[++index];
      bytes.push(Number.parseInt(octal, 8));
      continue;
    }
    if (char === '\n' || char === '\r') continue;
    bytes.push(char.charCodeAt(0) & 0xff);
  }
  return decodePdfTextBytes(new Uint8Array(bytes));
}

function decodePdfTextBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return text;
  }
  return latin1.decode(bytes);
}

function pdfLiteralStrings(streamText = '') {
  const values = [];
  for (let index = 0; index < streamText.length; index += 1) {
    if (streamText[index] !== '(') continue;
    let depth = 1;
    let escaped = false;
    let raw = '';
    for (index += 1; index < streamText.length; index += 1) {
      const char = streamText[index];
      if (escaped) {
        raw += `\\${char}`;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth === 0) break;
      raw += char;
    }
    const decoded = decodePdfLiteral(raw).trim();
    if (decoded && /[\p{L}\p{N}]/u.test(decoded)) values.push(decoded);
  }
  for (const match of streamText.matchAll(/<([0-9a-f\s]{4,})>\s*(?:Tj|TJ|'|")/gi)) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length % 2) continue;
    const bytes = Uint8Array.from(hex.match(/../g) || [], pair => Number.parseInt(pair, 16));
    const decoded = decodePdfTextBytes(bytes).trim();
    if (decoded && /[\p{L}\p{N}]/u.test(decoded)) values.push(decoded);
  }
  return values;
}

async function pdfStreamText(bytes, rawText) {
  const chunks = [];
  let searchFrom = 0;
  while (searchFrom < rawText.length && chunks.join('').length < MAX_EXTRACTED_CHARS) {
    const streamIndex = rawText.indexOf('stream', searchFrom);
    if (streamIndex < 0) break;
    const tokenBefore = rawText.slice(Math.max(0, streamIndex - 8), streamIndex);
    if (/end$/.test(tokenBefore)) {
      searchFrom = streamIndex + 6;
      continue;
    }
    let start = streamIndex + 6;
    if (rawText[start] === '\r' && rawText[start + 1] === '\n') start += 2;
    else if (rawText[start] === '\n' || rawText[start] === '\r') start += 1;
    const end = rawText.indexOf('endstream', start);
    if (end < 0) break;
    const dictionary = rawText.slice(Math.max(0, streamIndex - 700), streamIndex);
    let data = bytes.slice(start, end);
    try {
      if (/\/FlateDecode\b/.test(dictionary)) data = await decompress(data, 'deflate');
      else if (/\/Filter\b/.test(dictionary)) {
        searchFrom = end + 9;
        continue;
      }
      const values = pdfLiteralStrings(latin1.decode(data));
      if (values.length) chunks.push(values.join(' '));
    } catch {
      // A damaged or unsupported stream must not stop extraction from the rest of the PDF.
    }
    searchFrom = end + 9;
  }
  return chunks.join('\n');
}

export async function extractPdfText(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const raw = latin1.decode(bytes);
  const metadata = [];
  for (const [label, pattern] of [
    ['Tittel', /\/Title\s*\(([^)]{1,400})\)/],
    ['Forfatter', /\/Author\s*\(([^)]{1,300})\)/],
    ['Emne', /\/Subject\s*\(([^)]{1,400})\)/],
    ['Teknisk opprettelsesdato', /\/CreationDate\s*\(D:([0-9]{8,14})/]
  ]) {
    const match = raw.match(pattern);
    if (!match) continue;
    const value = label === 'Teknisk opprettelsesdato' && /^\d{8}/.test(match[1])
      ? `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`
      : decodePdfLiteral(match[1]);
    metadata.push(`${label}: ${value}`);
  }
  const streamText = await pdfStreamText(bytes, raw);
  const text = [...metadata, streamText].filter(Boolean).join('\n\n');
  const warnings = text ? [] : ['PDF-en inneholdt ikke tekst som den lokale leseren kunne hente. Skannede dokumenter krever OCR.'];
  return result(text, 'Grunnleggende lokal PDF-tekstuttrekking', warnings);
}

function delimitedText(source, extension) {
  const firstLine = source.split(/\r?\n/, 1)[0];
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    if (firstLine[i] === '"') {
      if (quoted && firstLine[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(firstLine[i])) counts.set(firstLine[i], counts.get(firstLine[i]) + 1);
  }
  const delimiter = extension === 'tsv' ? '\t' : [...counts].sort((a, b) => b[1] - a[1])[0][0];
  if (!counts.get(delimiter) && extension !== 'tsv') return source;
  const rows = [];
  let row = [], value = '';
  quoted = false;
  const text = source.replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && (quoted || !value)) {
      if (quoted && text[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === delimiter || char === '\n')) {
      row.push(value); value = '';
      if (char === '\n') { rows.push(row.join('\t')); row = []; }
    } else value += char;
  }
  if (quoted) return source; // Keep a malformed CSV intact for manual review.
  if (value || row.length) { row.push(value); rows.push(row.join('\t')); }
  return rows.join('\n');
}

function structuredXmlText(source) {
  const labels = { emne: 'Emne', subject: 'Emne', tittel: 'Tittel', title: 'Tittel',
    avsender: 'Avsender', sender: 'Avsender', dokumentdato: 'Dokumentdato', documentdate: 'Dokumentdato', dato: 'Dato' };
  const labeled = source.replace(/<(?:\w+:)?(emne|subject|tittel|title|avsender|sender|dokumentdato|documentdate|dato)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/gi,
    (_, tag, value) => `\n${labels[tag.toLowerCase()]}: ${markupToText(value).trim()}\n`);
  return markupToText(labeled.replace(/<\/[^>]+>/g, '\n'));
}

export async function extractTextFromBytes(bytesLike, filename = '', mime = '') {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const extension = extensionOf(filename);
  const resolvedMime = mimeTypeFor(filename, mime);
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    return result('', 'Ingen tekst hentet', ['Filen er større enn grensen for lokal innholdsanalyse. Tekniske metadata og kontrollsum er likevel tilgjengelige.']);
  }
  if (isTextReadable(filename, resolvedMime)) {
    let text;
    const warnings = [];
    try { text = strictUtf8.decode(bytes); }
    catch {
      text = latin1.decode(bytes);
      warnings.push('Teksten var ikke gyldig UTF-8 og ble lest som Windows-1252. Kontroller tegnsettet.');
    }
    if (extension === 'eml' || resolvedMime === 'message/rfc822') text = emailToText(text);
    else if (['csv', 'tsv'].includes(extension) || resolvedMime === 'text/csv') text = delimitedText(text, extension);
    else if (extension === 'xml' || /^(?:application|text)\/xml$/i.test(resolvedMime)) text = structuredXmlText(text);
    else if (['html', 'htm', 'svg'].includes(extension) || /(?:html|xml)/i.test(resolvedMime)) text = markupToText(text);
    return result(text, extension === 'eml' ? 'Lokal e-postlesing' : 'Direkte lokal tekstlesing', warnings);
  }
  if (['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp'].includes(extension)) return extractOfficeText(bytes, extension);
  if (extension === 'pdf' || resolvedMime === 'application/pdf') return extractPdfText(bytes);
  const oldOffice = ['doc', 'xls', 'ppt', 'msg'].includes(extension);
  return result('', 'Ingen tekst hentet', [oldOffice
    ? 'Eldre binærformat støttes ikke for innholdsuttrekk i denne nettleserdemoen.'
    : 'Filformatet støttes ikke for lokal tekstuttrekking.']);
}

export async function extractTextFromFile(file) {
  const bytes = new Uint8Array(await file.slice(0, MAX_SOURCE_BYTES + 1).arrayBuffer());
  return extractTextFromBytes(bytes, file.name, file.type);
}

export function sampleTextForAi(text = '', max = 24000) {
  const normalized = normalizeExtractedText(text);
  if (normalized.length <= max) return normalized;
  const headLength = Math.floor(max * 0.68);
  const tailLength = max - headLength;
  return `${normalized.slice(0, headLength)}\n\n[... midtpartiet er utelatt lokalt ...]\n\n${normalized.slice(-tailLength)}`;
}

export { encoder };
