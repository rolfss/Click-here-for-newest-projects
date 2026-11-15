import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { localDatabase } from './sqlite.mjs';

await import('./build.mjs');
const { default: app } = await import('../dist/server/index.js');
await mkdir('.quizpa-local', { recursive: true });

const setup = process.env.QUIZPA_LOCAL_SETUP ?? 'a'.repeat(48);
const env = {
  DB: localDatabase('.quizpa-local/preview.sqlite'),
  ADMIN_SETUP_HASH: createHash('sha256').update(setup.toLowerCase()).digest('hex'),
  ADMIN_SESSION_SECRET: 'quizpa-local-preview-only-signed-session',
};
const portArg = process.argv.indexOf('--port');
const port = Number(process.env.PORT ?? (portArg >= 0 ? process.argv[portArg + 1] : 4173));

const server = createServer(async (req, res) => {
  try {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:' + port;
    const scheme = req.headers['x-forwarded-proto']?.split(',')[0] ?? 'http';
    const init = { method: req.method, headers: req.headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req);
      init.duplex = 'half';
    }
    const response = await app.fetch(new Request(scheme + '://' + host + req.url, init), env);
    for (const [key, value] of response.headers) res.setHeader(key, value);
    res.writeHead(response.status);
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end('Local preview error');
  }
});

server.listen(port, '0.0.0.0', () => console.log('Local: http://localhost:' + port));
