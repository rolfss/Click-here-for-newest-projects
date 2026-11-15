import { redeemJoinCode } from './invitations.mjs';
import { organizer } from './organizer.mjs';
import { player } from './player.mjs';
import { fail, Problem } from './rules.mjs';
import { checkOrigin, json, sql } from './support.mjs';
import { web } from './web.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return web(request, url);
    try {
      if (request.method !== 'GET') checkOrigin(request, url);
      const [, , area, ...parts] = url.pathname.split('/');
      const now = Date.now();
      if (!env.DB) fail(503, 'storage_unavailable', 'Quizlageret er ikke tilkoblet.');
      if (area === 'health' && parts.length === 0 && request.method === 'GET') {
        await sql(env, 'SELECT code FROM join_codes LIMIT 1').first();
        return json({ ok: true });
      }
      if (area === 'join' && parts.length === 0 && request.method === 'POST') {
        return await redeemJoinCode(request, env, now);
      }
      if (area === 'play') return await player(request, env, parts, now);
      if (area === 'admin') return await organizer(request, env, parts, now);
      fail(404, 'not_found', 'Fant ikke siden.');
    } catch (error) {
      if (error instanceof Problem) return json({ code: error.code, message: error.message }, error.status);
      console.error('Quizpå request failed:', error.message);
      return json({ code: 'server_error', message: 'Noe gikk galt. Prøv igjen om litt.' }, 500);
    }
  },
};
