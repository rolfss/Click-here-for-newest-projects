import { cleanName, validBoard, rankScores, SCORE_TTL } from '../dist/leaderboard.js';
const HOUR = 3600000, SESSION_TTL = 30 * 60000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
async function smallJSON(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new InputError('JSON kreves.', 415);
  if (!request.body) throw new InputError('Mangler data.');
  const reader = request.body.getReader(), chunks = []; let total = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 4096) { await reader.cancel(); throw new InputError('For stor forespørsel.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { throw new InputError('Ugyldig JSON.'); }
}
export function checkRun(data, session, now, minimumTimes = { fjord: 26000, pass: 33000, aurora: 34000 }) {
  if (!session || session.expiresAt <= now) throw new InputError('Løpsbilletten har utløpt. Start et nytt løp.');
  if (!validBoard(data.board) || session.board !== data.board) throw new InputError('Feil løpsklasse.');
  const name = cleanName(data.name);
  if (!Number.isSafeInteger(data.timeMs) || data.timeMs < minimumTimes[data.board.split('-')[0]] || data.timeMs > 1800000) throw new InputError('Ugyldig løpstid.');
  if (!Number.isSafeInteger(data.crashes) || data.crashes < 0 || data.crashes > 100) throw new InputError('Ugyldig antall gjenopprettinger.');
  if (data.timeMs > now - session.issuedAt + data.crashes * 3000 + 2000) throw new InputError('Tiden stemmer ikke med løpsbilletten.');
  if (!Array.isArray(data.splits) || data.splits.length !== 3 || data.splits.some((t, i) => !Number.isSafeInteger(t) || t <= (data.splits[i - 1] || 0) || t >= data.timeMs)) throw new InputError('Etappen mangler gyldige mellomtider.');
  return { name, board: data.board, timeMs: data.timeMs };
}
/** SQLite-backed Durable Object. No browser-supplied timestamp is trusted. */
export class Leaderboard {
  constructor(ctx, env, clock = Date.now) {
    this.ctx = ctx; this.sql = ctx.storage.sql; this.clock = clock;
    for (const statement of [
      'CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY, name TEXT NOT NULL, board TEXT NOT NULL, timeMs INTEGER NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS score_order ON scores(board,timeMs,createdAt)',
      'CREATE INDEX IF NOT EXISTS score_expiry ON scores(expiresAt)',
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, board TEXT NOT NULL, issuedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expiresAt)',
      'CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expiresAt INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS limit_expiry ON limits(expiresAt)'
    ]) this.sql.exec(statement);
  }
  cleanup(now) { for (const table of ['scores', 'sessions', 'limits']) this.sql.exec(`DELETE FROM ${table} WHERE expiresAt <= ?`, now); }
  async schedule() {
    const row = [...this.sql.exec('SELECT MIN(expiresAt) AS next FROM (SELECT expiresAt FROM scores UNION ALL SELECT expiresAt FROM sessions UNION ALL SELECT expiresAt FROM limits)')][0];
    if (row?.next) await this.ctx.storage.setAlarm(Math.max(this.clock() + 1000, row.next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() { this.cleanup(this.clock()); await this.schedule(); }
  rate(key, now) {
    const expires = (Math.floor(now / HOUR) + 1) * HOUR;
    this.sql.exec('INSERT INTO limits(id,hits,expiresAt) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1', key, expires);
    const value = [...this.sql.exec('SELECT hits FROM limits WHERE id=?', key)][0];
    if (value.hits > 60) throw new InputError('For mange forsøk. Prøv igjen senere.', 429);
  }
  async fetch(request) {
    const now = this.clock(), url = new URL(request.url);
    this.cleanup(now);
    try {
      if (request.method === 'GET' && url.pathname === '/scores') {
        const board = url.searchParams.get('board'); if (!validBoard(board)) throw new InputError('Ugyldig løpsklasse.');
        const rows = [...this.sql.exec('SELECT * FROM scores WHERE board=? AND expiresAt>? ORDER BY timeMs,createdAt LIMIT 20000', board, now)];
        return json({ scores: rankScores(rows, board, now), now, ttlHours: 72 });
      }
      if (request.method !== 'POST' || !['/sessions', '/scores'].includes(url.pathname)) return json({ error: 'Ikke funnet.' }, 404);
      const data = await smallJSON(request);
      const address = request.headers.get('CF-Connecting-IP') || 'unknown';
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${Math.floor(now / HOUR)}:${address}`));
      const rateKey = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      this.rate(rateKey, now);
      let result;
      this.ctx.storage.transactionSync(() => {
        if (url.pathname === '/sessions') {
          if (!validBoard(data.board)) throw new InputError('Ugyldig løpsklasse.');
          if ([...this.sql.exec('SELECT COUNT(*) AS n FROM sessions')][0].n >= 20000) throw new InputError('Serveren er full. Prøv senere.', 503);
          const ticket = crypto.randomUUID();
          this.sql.exec('INSERT INTO sessions(id,board,issuedAt,expiresAt) VALUES(?,?,?,?)', ticket, data.board, now, now + SESSION_TTL);
          result = { ticket, expiresAt: now + SESSION_TTL }; return;
        }
        if (typeof data.ticket !== 'string' || !/^[a-f0-9-]{36}$/.test(data.ticket)) throw new InputError('Mangler løpsbillett.');
        const existing = [...this.sql.exec('SELECT * FROM scores WHERE id=?', data.ticket)][0];
        if (existing) { if (existing.name !== cleanName(data.name) || existing.board !== data.board || existing.timeMs !== data.timeMs) throw new InputError('Løpsbilletten er allerede brukt.', 409); result = { score: existing, duplicate: true }; return; }
        const session = [...this.sql.exec('SELECT * FROM sessions WHERE id=?', data.ticket)][0];
        const run = checkRun(data, session, now);
        if ([...this.sql.exec('SELECT COUNT(*) AS n FROM scores')][0].n >= 20000) throw new InputError('Topplisten er midlertidig full.', 503);
        const row = { id: data.ticket, ...run, createdAt: now, expiresAt: now + SCORE_TTL };
        this.sql.exec('INSERT INTO scores(id,name,board,timeMs,createdAt,expiresAt) VALUES(?,?,?,?,?,?)', row.id, row.name, row.board, row.timeMs, row.createdAt, row.expiresAt);
        this.sql.exec('DELETE FROM sessions WHERE id=?', data.ticket);
        result = { score: row };
      });
      await this.schedule(); return json(result);
    } catch (error) {
      await this.schedule();
      if (error instanceof InputError) return json({ error: error.message }, error.status);
      if (/^Bruk 2|^Skriv et navn/.test(error.message)) return json({ error: error.message }, 400);
      return json({ error: 'Rekordserveren kunne ikke behandle forespørselen.' }, 500);
    }
  }
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://rolfss.github.io').split(',').map(s => s.trim());
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') return json({ ready: true, ttlHours: 72 });
    if (!origin || !allowed.includes(origin)) return json({ error: 'Denne opprinnelsen er ikke tillatt.' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const id = env.LEADERBOARD.idFromName('fjordsprint-v2');
      const response = await env.LEADERBOARD.get(id).fetch(request);
      const out = new Response(response.body, response); for (const [key, value] of Object.entries(cors)) out.headers.set(key, value); return out;
    } catch { return json({ error: 'Rekordserveren er utilgjengelig.' }, 503); }
  }
};
