import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
const encoded = new URL('../asset-pack/', import.meta.url);
const parts = await readdir(encoded).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return [];
});
if (parts.length) {
  const chunks = await Promise.all(parts.filter(part => /^\d{3}\.b64$/.test(part)).sort()
    .map(part => readFile(new URL(part, encoded), 'utf8')));
  const files = JSON.parse(gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8'));
  for (const [name, data] of Object.entries(files)) {
    const file = resolve(publicRoot, name);
    if (!file.startsWith(publicRoot + sep)) throw new Error(`Invalid asset path ${name}`);
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file, Buffer.from(data, 'base64'));
  }
}

const vendor = join(root, 'node_modules', 'pdfjs-dist');
const pdf = join(publicRoot, 'pdfjs');
await mkdir(pdf, { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await cp(join(vendor, 'legacy', 'build', file), join(pdf, file));
}
for (const entry of ['cmaps', 'standard_fonts', 'iccs', 'LICENSE']) {
  await cp(join(vendor, entry), join(pdf, entry), { recursive: true });
}
console.log('Browser assets ready.');
