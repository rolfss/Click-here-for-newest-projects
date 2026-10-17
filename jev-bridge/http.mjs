import http from 'node:http';
import { buildChoiceRequest, buildNoulRequest, buildScoreRequest, callJev, listModels } from './jev-client.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.JEV_BRIDGE_PORT || 8789);
const MAX_BODY = 70000;

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('Request body too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, value) {
  const payload = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' });
  res.end(payload);
}

const routes = {
  '/noul': x => callJev(buildNoulRequest(x)),
  '/choice': x => callJev(buildChoiceRequest(x)),
  '/score': x => callJev(buildScoreRequest(x)),
  '/models': () => listModels()
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'jev-bridge' });
    if (req.method !== 'POST' || !routes[req.url]) return send(res, 404, { error: 'not_found' });
    const input = await body(req);
    return send(res, 200, await routes[req.url](input));
  } catch (error) {
    return send(res, 400, { error: error instanceof Error ? error.message : 'request_failed' });
  }
});

server.listen(PORT, HOST, () => console.error(`Jev loopback bridge ready at http://${HOST}:${PORT}`));
