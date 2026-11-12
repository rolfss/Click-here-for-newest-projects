const opensAt = Date.parse('2026-11-13T09:00:00+01:00');
const closesAt = Date.parse('2026-11-13T17:00:00+01:00');
const transportGraceMs = 650;
const practiceQuestions = [
  { number: 1, question: 'Hvilken måned arrangeres Fagdagen 2026?', answers: choices('Mai', 'November', 'Juni', 'Februar'), correct_answer_id: 'B' },
  { number: 2, question: 'Hvor mange sekunder får du per spørsmål i quizen?', answers: choices('10', '15', '20', '30'), correct_answer_id: 'C' },
  { number: 3, question: 'Hva vises på topplisten?', answers: choices('Kallenavnet ditt', 'E-postadressen din', 'Telefonnummeret ditt', 'Brukernavnet ditt'), correct_answer_id: 'A' },
];
const namePattern = /^[\p{L}\p{N} ._-]{2,20}$/u;
const usernamePattern = /^[A-Za-z0-9'.!#^_~-]{1,64}$/;
const tokenPattern = /^[A-Za-z0-9_-]{22,100}$/;
const fjordSource = 'https://fjordsprint-scores.rolfsselas.workers.dev/conference/scores?board=fjordsprint-three-stage-v1';
const ranks = 'correct DESC, time_ms ASC, finished_at ASC, token_hash ASC';
const encoder = new TextEncoder();
let fjordCache;
let fjordPending;

function choices(...values) {
  return values.map((text, index) => ({ id: 'ABCD'[index], text }));
}

export function json(value, status = 200, extra = {}) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

function fail(status, message, code) {
  throw Object.assign(new Error(message), { status, code });
}

function iso(value) {
  return new Date(value).toISOString();
}

function asHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashToken(scope, token) {
  return asHex(await crypto.subtle.digest('SHA-256', encoder.encode(`${scope}:${token}`)));
}

async function hashPlayer(scope, username, secret) {
  if (!secret) throw new Error('QUIZ_ID_KEY unavailable');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return asHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${scope}:${username.toLowerCase()}`)));
}

async function contactKey(secret) {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`quiz-contact:${secret}`));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function sealContact(username, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await contactKey(secret), encoder.encode(username));
  return `${asHex(iv)}:${asHex(sealed)}`;
}

export async function openContact(value, secret) {
  if (!value) return '';
  const [iv, sealed] = value.split(':').map(part => Uint8Array.from(part.match(/../g), byte => Number.parseInt(byte, 16)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await contactKey(secret), sealed));
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > 2048 || !request.body) fail(400, 'Ugyldig forespørsel.', 'invalid_body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      fail(413, 'Forespørselen er for stor.', 'invalid_body');
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new TypeError();
    return parsed;
  } catch {
    fail(400, 'Ugyldig forespørsel.', 'invalid_body');
  }
}

export function quizStatus(now, test, total) {
  return {
    state: test || (now >= opensAt && now < closesAt) ? 'open' : now < opensAt ? 'upcoming' : 'closed',
    opensAt: test ? null : iso(opensAt),
    closesAt: test ? null : iso(closesAt),
    count: total,
    serverTime: iso(now),
  };
}

function checkOpen(now, test) {
  if (test) return;
  if (now < opensAt) fail(403, 'Quizen åpner kl. 09.00.', 'upcoming');
  if (now >= closesAt) fail(403, 'Quizen er avsluttet.', 'closed');
}

function rowForToken(db, scope, hash) {
  return db.prepare('SELECT * FROM quiz_runs WHERE scope = ? AND token_hash = ?').bind(scope, hash).first();
}

async function runState(db, row, questions, test, questionMs) {
  const now = Date.now();
  const total = questions.length;
  if (row.finished_at !== null) {
    const ahead = await db.prepare(`SELECT COUNT(*) AS count FROM quiz_runs
      WHERE scope = ? AND finished_at IS NOT NULL AND
      (-correct, time_ms, finished_at, token_hash) < (?, ?, ?, ?)`)
      .bind(row.scope, -row.correct, row.time_ms, row.finished_at, row.token_hash).first();
    return { completed: true, name: row.name, score: row.correct * 1000, correct: row.correct, total, rank: ahead.count + 1, timeMs: row.time_ms, serverTime: iso(now) };
  }
  const question = questions[row.position];
  const deadline = row.question_at + questionMs;
  return {
    completed: false,
    name: row.name,
    total,
    serverTime: iso(now),
    question: {
      id: String(question.number), index: row.position, text: question.question,
      options: question.answers, selection: 'single',
      deadlineAt: iso(test ? deadline : Math.min(deadline, closesAt)),
    },
  };
}

async function startQuiz(request, env, scope, questions, test, questionMs) {
  checkOpen(Date.now(), test);
  const { name, username, usernameConfirmation, startKey } = await readBody(request);
  const nickname = typeof name === 'string' ? name.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
  const user = typeof username === 'string' ? username.trim() : '';
  if (!namePattern.test(nickname) || !/[\p{L}\p{N}]/u.test(nickname)) fail(400, 'Skriv et navn eller kallenavn på 2–20 tegn.', 'invalid_name');
  if (!usernamePattern.test(user) || user.endsWith('.')) fail(400, 'Skriv kort M365-brukernavn uten @ eller e-postdomene.', 'invalid_username');
  if (typeof usernameConfirmation !== 'string' || usernameConfirmation.trim() !== user) fail(400, 'Brukernavnene må være like.', 'confirmation');
  if (typeof startKey !== 'string' || !tokenPattern.test(startKey)) fail(400, 'Ugyldig startøkt. Last inn siden på nytt.', 'invalid_token');
  const [tokenHash, playerKey, contact] = await Promise.all([
    hashToken(scope, startKey), hashPlayer(scope, user, env.QUIZ_ID_KEY), sealContact(user, env.QUIZ_ID_KEY),
  ]);
  const now = Date.now();
  checkOpen(now, test);
  const db = env.DB;
  await db.prepare(`INSERT INTO quiz_runs (token_hash, scope, player_key, name, question_at, contact)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(tokenHash, scope, playerKey, nickname, now, contact).run();
  const row = await rowForToken(db, scope, tokenHash);
  if (!row || row.player_key !== playerKey) fail(409, 'Dette brukernavnet har allerede en økt. Fortsett på enheten du startet på.', 'already_started');
  return json({ token: startKey, ...(await runState(db, row, questions, test, questionMs)) });
}

async function answerQuiz(request, db, row, questions, test, questionMs) {
  const receivedAt = Date.now();
  const { questionId, choices: selected } = await readBody(request);
  if (!Array.isArray(selected) || selected.length > 1 || typeof questionId !== 'string') fail(400, 'Velg ett svar.', 'invalid_answer');
  const answeredIndex = questions.findIndex(question => String(question.number) === questionId);
  if (answeredIndex < 0 || answeredIndex > row.position) fail(409, 'Spørsmålet har endret seg. Last inn økten på nytt.', 'question_changed');
  if (row.finished_at !== null || answeredIndex < row.position) return json(await runState(db, row, questions, test, questionMs));
  checkOpen(receivedAt, test);
  const question = questions[row.position];
  if (selected.length && !question.answers.some(option => option.id === selected[0])) fail(400, 'Ugyldig svaralternativ.', 'invalid_answer');
  const elapsed = Math.max(0, receivedAt - row.question_at);
  if (!selected.length && elapsed < questionMs - transportGraceMs) fail(409, 'Spørsmålet er fortsatt åpent.', 'not_timed_out');
  const correct = elapsed <= questionMs + transportGraceMs && selected[0] === question.correct_answer_id ? 1 : 0;
  const duration = selected.length ? Math.min(elapsed, questionMs) : questionMs;
  const nextAt = Date.now();
  const final = row.position + 1 === questions.length;
  const updated = await db.prepare(`UPDATE quiz_runs SET position = position + 1, correct = correct + ?, time_ms = time_ms + ?,
    question_at = ?, finished_at = ? WHERE token_hash = ? AND position = ? AND finished_at IS NULL RETURNING *`)
    .bind(correct, duration, nextAt, final ? nextAt : null, row.token_hash, row.position).first();
  return json(await runState(db, updated ?? await rowForToken(db, row.scope, row.token_hash), questions, test, questionMs));
}

async function quizRoute(request, env, url, bank) {
  const test = url.searchParams.get('test') === '1';
  const scope = test ? 'practice-2026' : 'fagdagen-2026';
  const questions = test ? practiceQuestions : bank.questions;
  const questionMs = bank.time_limit_seconds * 1000;
  const route = url.pathname;
  if (request.method === 'GET' && route === '/api/quiz/status') return json({ ...quizStatus(Date.now(), test, questions.length), active: true });
  if (!env.DB) throw new Error('DB unavailable');
  const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
  if (request.method === 'GET' && route === '/api/quiz/leaderboard') {
    const data = await db.prepare(`SELECT name, correct, time_ms FROM quiz_runs
      WHERE scope = ? AND finished_at IS NOT NULL ORDER BY ${ranks} LIMIT 30`).bind(scope).all();
    return json({ rows: data.results.map((r, i) => ({ rank: i + 1, name: r.name, score: r.correct * 1000, timeMs: r.time_ms })), updatedAt: iso(Date.now()) });
  }
  if (request.method === 'POST' && route === '/api/quiz/start') return startQuiz(request, { DB: db, QUIZ_ID_KEY: env.QUIZ_ID_KEY }, scope, questions, test, questionMs);
  if ((request.method === 'GET' && route === '/api/quiz/run') || (request.method === 'POST' && route === '/api/quiz/answer')) {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{22,100})$/)?.[1];
    if (!token) fail(401, 'Fant ingen quizøkt.', 'invalid_token');
    const row = await rowForToken(db, scope, await hashToken(scope, token));
    if (!row) fail(401, 'Fant ingen quizøkt.', 'invalid_token');
    return request.method === 'GET' ? json(await runState(db, row, questions, test, questionMs)) : answerQuiz(request, db, row, questions, test, questionMs);
  }
  return json({ error: 'Ukjent endepunkt.' }, 404);
}

async function readFjord() {
  const response = await fetch(fjordSource, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Fjordsprint ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.scores)) throw new Error('Invalid Fjordsprint response');
  return {
    rows: data.scores.slice(0, 30).map(r => ({ rank: r.rank, name: r.nickname, score: r.score, timeMs: r.timeMs })),
    day: data.day,
    updatedAt: iso(Date.now()),
  };
}

export async function fjordLeaderboard() {
  if (fjordCache && Date.now() - Date.parse(fjordCache.updatedAt) < 5000) return json(fjordCache);
  fjordPending ??= readFjord().then(result => (fjordCache = result)).finally(() => { fjordPending = undefined; });
  try {
    return json(await fjordPending);
  } catch (error) {
    console.warn('Fjordsprint leaderboard unavailable:', error.message);
    if (fjordCache) return json({ ...fjordCache, stale: true });
    return json({ error: 'Fjordsprint-topplisten er midlertidig utilgjengelig.' }, 502);
  }
}

export async function quizFetch(request, env, bank) {
  const url = new URL(request.url);
  try {
    return await quizRoute(request, env, url, bank);
  } catch (error) {
    if (error.status) return json({ error: error.message, message: error.message, code: error.code }, error.status);
    console.error('Fagdagen quiz request failed:', url.pathname, error.message);
    return json({ error: 'Midlertidig feil. Prøv igjen.', message: 'Midlertidig feil. Prøv igjen.' }, 503, { 'Retry-After': '2' });
  }
}
