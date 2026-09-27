import { cleanConversation, MODEL, PROFILE_REVISION, sourcesFor, readJsonBounded } from './protocol.mjs';
import { WorkerEntrypoint } from 'cloudflare:workers';
export { LocalRelay } from './relay.mjs';

// This named entrypoint is callable only through an explicit service binding.
// The default public fetch handler below exposes no NOARK generation route.
export class NoarkBonsai extends WorkerEntrypoint {
  async health() { return this.env.LOCAL_RELAY.getByName('rolf-workstation').noarkHealth(); }
  async answer(data) { return this.env.LOCAL_RELAY.getByName('rolf-workstation').noark(data); }
}
const ORIGIN = 'https://rolfss.github.io';

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
    ...(origin === ORIGIN ? { 'Access-Control-Allow-Origin': ORIGIN } : {})
  } });
}
const fail = (error, message, status, origin = '') => json({ error, message }, status, origin);
const configured = env => Boolean(env.LOCAL_CONNECTOR_KEY && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.LOCAL_RELAY && env.SECOND_ROLF_RATE);

async function authenticate(request, secret) {
  if (!secret) return false;
  const provided = request.headers.get('Authorization') || '';
  const encode = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', encode.encode(provided));
  const b = await crypto.subtle.digest('SHA-256', encode.encode(`Bearer ${secret}`));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function verifyTurnstile(token, request, env) {
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: form, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return false;
  const result = await readJsonBounded(response, 8000);
  return result.success === true && result.hostname === 'rolfss.github.io' && result.action === 'second-rolf-chat';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    try {
      if (url.pathname === '/api/local/connect') {
        if (!(await authenticate(request, env.LOCAL_CONNECTOR_KEY))) return fail('auth', 'Unauthorized', 401);
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail('upgrade', 'WebSocket required', 426);
        return env.LOCAL_RELAY.getByName('rolf-workstation').fetch(request);
      }
      if (url.pathname === '/api/second-rolf/health' && request.method === 'GET') {
        const ready = configured(env);
        const status = ready ? await env.LOCAL_RELAY.getByName('rolf-workstation').health() : { available: false, gpu: false };
        return json({ configured: ready, ...status, profileRevision: PROFILE_REVISION, model: MODEL, mode: 'local-model', localOnly: true, siteKey: env.TURNSTILE_SITE_KEY || '' }, 200, origin);
      }
      if (url.pathname !== '/api/second-rolf') return fail('not_found', 'Ukjent endepunkt.', 404, origin);
      if (origin !== ORIGIN) return fail('origin', 'Denne nettsiden har ikke tilgang.', 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin'
      } });
      if (request.method !== 'POST') return fail('method', 'Bruk POST.', 405, origin);
      if (!configured(env)) return fail('not_configured', 'Lokal AI er ikke tilkoblet ennå.', 503, origin);
      const rate = await env.SECOND_ROLF_RATE.limit({ key: request.headers.get('CF-Connecting-IP') || 'anonymous' });
      if (!rate.success) return fail('rate_limit', 'For mange spørsmål. Prøv igjen om et minutt.', 429, origin);
      let clean, data;
      try {
        data = await readJsonBounded(request);
        clean = cleanConversation(data);
        if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) throw new Error('Sikkerhetskontrollen mangler.');
      } catch (error) { return fail('request', error.message, 400, origin); }
      if (data.profileRevision !== PROFILE_REVISION) return fail('profile_revision', 'Last inn siden på nytt for å bruke gjeldende offentlig kunnskapsbase.', 409, origin);
      if (!(await verifyTurnstile(data.turnstileToken, request, env))) return fail('turnstile', 'Fullfør sikkerhetskontrollen og prøv igjen.', 403, origin);
      const result = await env.LOCAL_RELAY.getByName('rolf-workstation').chat(clean);
      if (result.error) return fail(result.error, result.error === 'busy' ? 'Modellen svarer noen andre. Prøv igjen om litt.' : 'Den lokale modellen er ikke tilgjengelig med gjeldende kunnskapsbase.', result.error === 'busy' ? 429 : 503, origin);
      return json({ answer: result.answer, sources: sourcesFor(result.answer), profileRevision: PROFILE_REVISION, model: MODEL, mode: 'local-model', localOnly: true }, 200, origin);
    } catch { return fail('unavailable', 'Tilkoblingen er midlertidig utilgjengelig. Prøv igjen.', 503, origin); }
  }
};
