import { DurableObject } from 'cloudflare:workers';
import sealedQuiz from './sealed-quiz.mjs';
import { fjordLeaderboard, json, openContact, quizFetch, quizStatus } from './quiz-engine.mjs';
import { qrSvg } from './public/qr.mjs';

const setupKeyPattern = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();
const fjordUrl = 'https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/?conference=1';
const unavailable = () => json({ error: 'Midlertidig feil. Prøv igjen.', code: 'unavailable' }, 503, { 'Retry-After': '2' });

function base64urlBytes(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function organizerKey(request) {
  const authorization = request.headers.get('Authorization');
  const key = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!key || !setupKeyPattern.test(key)) return null;
  const raw = base64urlBytes(key);
  const canonical = btoa(String.fromCharCode(...raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (raw.length !== 32 || canonical !== key || !sameBytes(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), base64urlBytes(sealedQuiz.digest))) return null;
  return key;
}

async function unlockBank(key) {
  const raw = base64urlBytes(key);
  const aesKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64urlBytes(sealedQuiz.iv) }, aesKey, base64urlBytes(sealedQuiz.ciphertext));
  const bank = JSON.parse(new TextDecoder().decode(clear));
  if (bank.time_limit_seconds !== 20 || !Array.isArray(bank.questions) || bank.questions.length !== 10 ||
    new Set(bank.questions.map(q => q.number)).size !== 10 || bank.questions.some(q => typeof q.question !== 'string' ||
      !Array.isArray(q.answers) || !q.answers.some(option => option.id === q.correct_answer_id))) throw new Error('Invalid event quiz bank');
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(`fagdagen-2026:quiz-identities:${key}`));
  const secret = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  return { bank, secret };
}

function csvCell(value) {
  const text = String(value);
  const safe = /^\s*[-+=@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export class StandQuiz extends DurableObject {
  #sql;
  #quizDb;
  #unlocked;

  constructor(ctx, env) {
    super(ctx, env);
    this.#sql = ctx.storage.sql;
    this.#quizDb = { prepare: (statement) => ({ bind: (...bindings) => ({
      first: () => this.#sql.exec(statement, ...bindings).toArray()[0] ?? null,
      all: () => ({ results: this.#sql.exec(statement, ...bindings).toArray() }),
      run: () => this.#sql.exec(statement, ...bindings).toArray(),
    }) }) };

    ctx.blockConcurrencyWhile(async () => {
      this.#sql.exec(`CREATE TABLE IF NOT EXISTS quiz_runs (
        token_hash TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, player_key TEXT NOT NULL, name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, time_ms INTEGER NOT NULL DEFAULT 0,
        question_at INTEGER NOT NULL, finished_at INTEGER, contact TEXT, UNIQUE (scope, player_key)
      )`);
      this.#sql.exec(`CREATE INDEX IF NOT EXISTS quiz_rank ON quiz_runs (scope, correct DESC, time_ms, finished_at, token_hash)
        WHERE finished_at IS NOT NULL`);
      this.#sql.exec('CREATE TABLE IF NOT EXISTS quiz_configuration (id INTEGER PRIMARY KEY CHECK (id = 1), setup_key TEXT NOT NULL)');
      const saved = this.#sql.exec('SELECT setup_key FROM quiz_configuration WHERE id = 1').toArray()[0];
      if (saved) this.#unlocked = await unlockBank(saved.setup_key);
    });
  }

  async #exportResults(test) {
    const rows = this.#sql.exec(`SELECT name, contact, correct, time_ms FROM quiz_runs
      WHERE scope = ? AND finished_at IS NOT NULL ORDER BY correct DESC, time_ms, finished_at, token_hash`,
      test ? 'practice-2026' : 'fagdagen-2026').toArray();
    const lines = ['Plass;Kallenavn;M365-brukernavn;Poeng;Svartid (ms)'];
    for (const [index, row] of rows.entries()) {
      const contact = await openContact(row.contact, this.#unlocked.secret);
      lines.push([index + 1, row.name, contact, row.correct * 1000, row.time_ms].map(csvCell).join(';'));
    }
    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${test ? 'fagdag-quiz-provespill' : 'fagdag-quiz-resultater'}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const test = url.searchParams.get('test') === '1';
    try {
      if (url.pathname.startsWith('/api/organizer/')) {
        const key = await organizerKey(request);
        if (!key) return json({ error: 'Bruk arrangørlenken.', code: 'organizer_required' }, 401);
        if (request.method === 'POST' && url.pathname === '/api/organizer/activate') {
          if (!this.#unlocked) {
            const unlocked = await unlockBank(key);
            this.#sql.exec('INSERT INTO quiz_configuration (id, setup_key) VALUES (1, ?) ON CONFLICT DO NOTHING', key);
            this.#unlocked = unlocked;
          }
          return json({ active: true });
        }
        if (request.method === 'GET' && url.pathname === '/api/organizer/results') {
          return this.#unlocked ? await this.#exportResults(test) : json({ error: 'Åpne arrangørlenken først.', code: 'not_active' }, 409);
        }
        return json({ error: 'Ukjent endepunkt.' }, 404);
      }

      if (!this.#unlocked) {
        if (request.method === 'GET' && url.pathname === '/api/quiz/status') {
          return json({ ...quizStatus(Date.now(), test, test ? 3 : 10), active: false });
        }
        if (request.method === 'GET' && url.pathname === '/api/quiz/leaderboard') {
          return json({ rows: [], updatedAt: new Date().toISOString() });
        }
        return json({ error: 'Quizen er ikke åpnet av arrangøren ennå.', code: 'not_active' }, 503);
      }
      return quizFetch(request, { DB: this.#quizDb, QUIZ_ID_KEY: this.#unlocked.secret }, this.#unlocked.bank);
    } catch (error) {
      console.error('Fagdag quiz request failed:', url.pathname, error.name);
      return unavailable();
    }
  }
}

function qrResponse(request, destination) {
  return new Response(request.method === 'HEAD' ? null : qrSvg(destination), { headers: {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/quiz/') || url.pathname.startsWith('/api/organizer/')) {
        return await env.QUIZ.get(env.QUIZ.idFromName('fagdagen-2026')).fetch(request);
      }
      if (url.pathname === '/api/fjord/leaderboard' && request.method === 'GET') return await fjordLeaderboard();
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Metoden er ikke tilgjengelig.' }, 405);
      if (url.pathname === '/fjord-qr.png') return qrResponse(request, fjordUrl);
      if (url.pathname === '/quiz-qr.png' || url.pathname === '/quiz-test-qr.png') {
        const destination = new URL(url.pathname === '/quiz-test-qr.png' ? '/spill?test=1' : '/spill', url.origin);
        return qrResponse(request, destination.href);
      }
      if (url.pathname === '/' || url.pathname === '/spill' || url.pathname === '/spill/') {
        const asset = new URL(url.pathname === '/' ? '/index.html' : '/quiz.html', url.origin);
        const response = await env.ASSETS.fetch(new Request(asset, request));
        const result = new Response(response.body, response);
        result.headers.set('Referrer-Policy', 'no-referrer');
        result.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return result;
      }
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Fagdag request failed:', url.pathname, error.name);
      return unavailable();
    }
  },
};
