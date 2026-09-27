import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This app has no runtime dependencies or bundler. Publish only the client allowlist.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const files = ['index.html', 'app.mjs', 'ai.mjs', 'engine.mjs', 'extract.mjs', 'zip.mjs', 'control-report.mjs', 'styles.css', 'luna.css', 'workspace.css', 'LICENSE', 'TITTELPROMPT.md'];
await mkdir(output, { recursive: true });
// Remove stale client files only within this fixed build directory; never traverse subdirectories.
for (const entry of await readdir(output, { withFileTypes: true })) {
  if (entry.isFile() && !files.includes(entry.name)) await unlink(path.join(output, entry.name));
}
for (const file of files) await writeFile(path.join(output, file), await readFile(path.join(root, file)));
for (const file of files) {
  if (!/\.(mjs|html)$/.test(file)) continue;
  const content = await readFile(path.join(output, file), 'utf8');
  for (const match of content.matchAll(/(?:from\s*|(?:src|href)=)["']\.\/([^"']+)["']/g)) {
    if (!files.includes(match[1])) throw new Error(`${file}: missing client resource ${match[1]}`);
  }
}
console.log(`Built ${files.length} static client files in archive-assist/dist. No test data or dependencies included.`);
