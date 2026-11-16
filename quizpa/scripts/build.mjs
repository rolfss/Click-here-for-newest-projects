import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const browserFiles = {
  name: 'browser-files',
  setup(builder) {
    builder.onLoad({ filter: /[/\\]public[/\\].+\.(html|css|js)$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8'), loader: 'text',
    }));
  },
};

await build({
  entryPoints: ['src/worker.mjs'], outfile: 'dist/server/index.js', bundle: true,
  format: 'esm', target: 'es2023', platform: 'neutral', legalComments: 'none', plugins: [browserFiles],
});

const manifest = '.openai/hosting.json';
const hosted = await access(manifest).then(() => true, () => false);
if (hosted) {
  await mkdir('dist/.openai/drizzle/meta', { recursive: true });
  await copyFile(manifest, 'dist/.openai/hosting.json');
  const migrations = (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort();
  const journal = { version: '7', dialect: 'sqlite', entries: [] };
  for (const [index, name] of migrations.entries()) {
    const tag = name.slice(0, -4);
    // The hosted migration runner uses Drizzle's statement breakpoints.
    const source = (await readFile('migrations/' + name, 'utf8')).replace(/\r\n/g, '\n');
    const split = source.trim().split(/;\n(?=\nCREATE )/).join(';\n--> statement-breakpoint\n');
    await writeFile('dist/.openai/drizzle/' + name, split + '\n');
    journal.entries.push({ idx: index, version: '6', when: 1794700800000 + index, tag, breakpoints: true });
  }
  await writeFile('dist/.openai/drizzle/meta/_journal.json', JSON.stringify(journal, null, 2));
}
