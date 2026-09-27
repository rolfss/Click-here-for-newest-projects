import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createCodexBridge } from './codex-bridge.mjs';
import { MODEL_ID, REASONING_EFFORT, TITLE_SYSTEM_PROMPT, AI_RESPONSE_SCHEMA,
  normalizeAiInput, buildDocumentAnalysisPrompt, parseAiAnalysisResponse } from '../ai.mjs';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const MAX_BODY = 80000;
const CLIENT_FILES = new Set(['index.html','app.mjs','ai.mjs','engine.mjs','extract.mjs','zip.mjs',
  'control-report.mjs','styles.css','luna.css','workspace.css','LICENSE','TITTELPROMPT.md']);
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' });
  res.end(JSON.stringify(body));
}

function validAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).some(key => !Object.hasOwn(AI_RESPONSE_SCHEMA.properties,key))) return false;
  return AI_RESPONSE_SCHEMA.required.every(key => {
    const rule = AI_RESPONSE_SCHEMA.properties[key], item = value[key];
    if (rule.type === 'string') return typeof item === 'string' && item.length >= (rule.minLength || 0) && item.length <= rule.maxLength;
    if (rule.type === 'number') return typeof item === 'number' && Number.isFinite(item) && item >= rule.minimum && item <= rule.maximum;
    return Array.isArray(item) && item.length <= rule.maxItems && item.every(word => typeof word === 'string' && word.length <= rule.items.maxLength);
  });
}

async function readJson(req) {
  return new Promise((resolve,reject) => {
    const chunks = []; let size = 0, settled = false;
    const finish = (error,value) => {
      if (settled) return;
      settled = true;
      req.off('data',onData); req.off('end',onEnd);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) finish(Object.assign(new Error('Forespørselen er for stor.'),{status:413}));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      try { finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(Object.assign(new Error('Ugyldig JSON i forespørselen.'),{status:400})); }
    };
    req.on('data',onData); req.once('end',onEnd); req.once('error',finish);
  });
}

export function createLocalServer({ bridge = createCodexBridge(), root = defaultRoot } = {}) {
  const token = randomBytes(32).toString('hex');
  let analyzing = false;
  const server = createServer(async (req,res) => {
    const address = server.address();
    const host = `127.0.0.1:${address?.port}`;
    const origin = `http://${host}`;
    // No cross-origin requests, DNS-rebinding hosts, public listener or account tokens in the browser.
    if (address?.address !== '127.0.0.1' || req.headers.host !== host ||
        (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      return json(res,403,{message:'Denne tilkoblingen tillater bare den lokale appen.'});
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url,origin).pathname); }
    catch { return json(res,400,{message:'Ugyldig adresse.'}); }
    if (pathname === '/api/health' && req.method === 'GET') {
      try {
        const status = await bridge.getStatus();
        const configured = status.configured === true && status.model === MODEL_ID &&
          status.reasoning === REASONING_EFFORT && status.authMode === 'chatgpt';
        return json(res,200,{ configured, model:MODEL_ID, reasoning:REASONING_EFFORT, authMode:'chatgpt',
          localRuntime:true, sessionToken:token, message:configured
            ? 'GPT-6 Luna er klar via din tilkoblede ChatGPT-konto. Resonering: medium. Bruken teller mot kontoens grenser.'
            : 'GPT-6 Luna er ikke klar. Kontroller Codex-innloggingen med ChatGPT og modelltilgangen, og åpne AI-valget på nytt.' });
      } catch { return json(res,503,{message:'Codex-tilkoblingen er ikke tilgjengelig. Start Codex og kontroller ChatGPT-innloggingen.'}); }
    }
    if (pathname === '/api/archive-assist' && req.method === 'POST') {
      const supplied = Buffer.from(String(req.headers['x-archive-session'] || ''));
      const expected = Buffer.from(token);
      if (req.headers.origin !== origin || supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) {
        return json(res,403,{message:'Åpne AI-valget i den lokale appen før du analyserer.'});
      }
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res,415,{message:'Forespørselen må være JSON.'});
      if (Number(req.headers['content-length']) > MAX_BODY) return json(res,413,{message:'Forespørselen er for stor.'});
      if (analyzing) return json(res,409,{message:'En analyse pågår allerede. Vent til den er ferdig.'});
      analyzing = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),110000);
      const closed = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close',closed);
      try {
        const body = await readJson(req);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.text !== 'string' ||
            !body.text.trim() || body.text.length > 12000 || typeof body.fileName !== 'string') {
          return json(res,400,{message:'Oppgi filnavn og lesbar dokumenttekst på inntil 12 000 tegn.'});
        }
        const input = normalizeAiInput(body);
        const answer = await bridge.analyze({systemPrompt:TITLE_SYSTEM_PROMPT,
          prompt:buildDocumentAnalysisPrompt(input),outputSchema:AI_RESPONSE_SCHEMA,signal:controller.signal});
        if (!validAnalysis(answer)) return json(res,502,{message:'Luna returnerte ikke gyldige metadata. Forsøk igjen eller bruk lokale forslag.'});
        if (controller.signal.aborted) return json(res,504,{message:'Analysen ble avbrutt eller tok for lang tid. Ingen ny forespørsel er sendt.'});
        return json(res,200,{mode:'luna',model:MODEL_ID,reasoning:REASONING_EFFORT,authMode:'chatgpt',analysis:parseAiAnalysisResponse(answer)});
      } catch(error) {
        return json(res, error.status === 400 || error.status === 413 ? error.status : controller.signal.aborted ? 504 : 502,
          {message:error.status === 400 || error.status === 413 ? error.message : 'Luna-analysen ble ikke fullført. Kontroller ChatGPT-tilkoblingen og prøv igjen. Ingen automatisk ny forespørsel er sendt.'});
      } finally { clearTimeout(timer); res.off('close',closed); analyzing = false; }
    }
    if (pathname.startsWith('/api/')) return json(res,404,{message:'Ukjent lokal funksjon.'});
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (req.method !== 'GET' || !CLIENT_FILES.has(file)) return json(res,404,{message:'Filen finnes ikke.'});
    try {
      const data = await readFile(path.join(root,file));
      res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'text/plain; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});
      res.end(data);
    } catch { json(res,404,{message:'Bygg appen med npm run build først.'}); }
  });
  server.on('close',() => bridge.close?.());
  server.requestTimeout = 15000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await stat(path.join(defaultRoot,'index.html'));
  const port = Number(process.env.PORT || 5197);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT må være mellom 1 og 65535.');
  const server = createLocalServer();
  server.listen(port,'127.0.0.1',() => console.log(`Archive Assist med ChatGPT-tilkobling: http://127.0.0.1:${port}/`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
}
