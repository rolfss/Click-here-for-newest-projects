const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const resetHour = 8;
const dailyCapacity = 1500;
const boardPageSize = 30;
const pointsPerCorrect = 1000;
const osloClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', hourCycle: 'h23',
});
const transportGraceMs = 650;
const feedbackDelayMs = 1300;
const practiceQuestions = [
  { number: 1, question: 'Hvilken måned arrangeres Fagdagen 2026?', answers: choices('Mai', 'November', 'Juni', 'Februar'), correct_answer_id: 'B' },
  { number: 2, question: 'Hvor mange sekunder får du per spørsmål i quizen?', answers: choices('10', '15', '20', '30'), correct_answer_id: 'C' },
  { number: 3, question: 'Hva vises på topplisten?', answers: choices('Kallenavnet ditt', 'E-postadressen din', 'Telefonnummeret ditt', 'Brukernavnet ditt'), correct_answer_id: 'A' },
];
const namePattern = /^[\p{L}\p{N} ._-]{2,20}$/u;
const usernamePattern = /^[A-Za-z0-9'.!#^_~-]{1,64}$/;
const tokenPattern = /^[A-Za-z0-9_-]{22,100}$/;
const fjordSource = 'https://fjordsprint-scores.rolfsselas.workers.dev/conference/scores?board=fjordsprint-three-stage-v1';
const ranks = 'correct DESC, time_ms ASC, finished_at ASC, best_token_hash ASC';
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

function osloParts(time) {
  return Object.fromEntries(osloClock.formatToParts(time).map(({ type, value }) => [type, Number(value)]));
}

export function quizPeriod(now, test) {
  if (test) return { scope: 'practice-2026', day: null, resetTime: null };
  const { year, month, day, hour } = osloParts(now);
  const calendarDate = Date.UTC(year, month - 1, day - (hour < resetHour ? 1 : 0));
  const dayId = iso(calendarDate).slice(0, 10);
  const nextMorningUtc = calendarDate + dayMs + resetHour * hourMs;
  // As in Fjordsprint, Oslo's clock changes precede the local 08:00 reset.
  const resetTime = nextMorningUtc - (osloParts(nextMorningUtc).hour - resetHour) * hourMs;
  return { scope: `fagdagen-2026:${dayId}`, day: dayId, resetTime };
}

function periodDetails(period) {
  return { day: period.day, resetsAt: period.resetTime === null ? null : iso(period.resetTime) };
}

export function initializeQuizStorage(storage) {
  const sql = storage.sql;
  storage.transactionSync(() => {
    const [existing] = sql.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quiz_runs'").toArray();
    const legacy = /UNIQUE\s*\(\s*scope\s*,\s*player_key\s*\)/i.test(existing?.sql ?? '');
    if (legacy) sql.exec('ALTER TABLE quiz_runs RENAME TO quiz_runs_once');
    sql.exec(`CREATE TABLE IF NOT EXISTS quiz_runs (
      token_hash TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, player_key TEXT NOT NULL, name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, time_ms INTEGER NOT NULL DEFAULT 0,
      question_at INTEGER NOT NULL, finished_at INTEGER, contact TEXT, last_answer TEXT
    )`);
    if (!sql.exec('PRAGMA table_info(quiz_runs)').toArray().some(column => column.name === 'last_answer')) {
      sql.exec('ALTER TABLE quiz_runs ADD COLUMN last_answer TEXT');
    }
    sql.exec(`CREATE TABLE IF NOT EXISTS quiz_players (
      scope TEXT NOT NULL, player_key TEXT NOT NULL, best_token_hash TEXT, name TEXT, contact TEXT,
      correct INTEGER, time_ms INTEGER, finished_at INTEGER, PRIMARY KEY (scope, player_key)
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS quiz_daily_counts (
      scope TEXT PRIMARY KEY NOT NULL, players INTEGER NOT NULL, scored INTEGER NOT NULL
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS quiz_players_rank ON quiz_players
      (scope, correct DESC, time_ms, finished_at, best_token_hash) WHERE finished_at IS NOT NULL`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS quiz_enroll_player AFTER INSERT ON quiz_runs BEGIN
      INSERT INTO quiz_players (scope, player_key) VALUES (NEW.scope, NEW.player_key) ON CONFLICT DO NOTHING;
    END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS quiz_count_player AFTER INSERT ON quiz_players BEGIN
      INSERT INTO quiz_daily_counts (scope, players, scored) VALUES (NEW.scope, 1, 0)
      ON CONFLICT(scope) DO UPDATE SET players = players + 1;
    END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS quiz_count_first_score AFTER UPDATE OF best_token_hash ON quiz_players
      WHEN OLD.best_token_hash IS NULL AND NEW.best_token_hash IS NOT NULL BEGIN
        UPDATE quiz_daily_counts SET scored = scored + 1 WHERE scope = NEW.scope;
      END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS quiz_update_best AFTER UPDATE OF finished_at ON quiz_runs
      WHEN OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL BEGIN
        UPDATE quiz_players SET best_token_hash = NEW.token_hash, name = NEW.name, contact = NEW.contact,
          correct = NEW.correct, time_ms = NEW.time_ms, finished_at = NEW.finished_at
        WHERE scope = NEW.scope AND player_key = NEW.player_key AND
          (best_token_hash IS NULL OR NEW.correct > correct OR (NEW.correct = correct AND NEW.time_ms < time_ms));
      END`);
    if (legacy) {
      sql.exec(`INSERT INTO quiz_runs (token_hash, scope, player_key, name, position, correct, time_ms, question_at, finished_at, contact)
        SELECT token_hash, scope, player_key, name, position, correct, time_ms, question_at, finished_at, contact FROM quiz_runs_once`);
      sql.exec(`UPDATE quiz_players SET best_token_hash = old.token_hash, name = old.name, contact = old.contact,
        correct = old.correct, time_ms = old.time_ms, finished_at = old.finished_at FROM quiz_runs_once AS old
        WHERE quiz_players.scope = old.scope AND quiz_players.player_key = old.player_key AND old.finished_at IS NOT NULL`);
      sql.exec('DROP TABLE quiz_runs_once');
    }
  });
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
    state: 'open',
    opensAt: null,
    closesAt: null,
    ...periodDetails(quizPeriod(now, test)),
    count: total,
    serverTime: iso(now),
  };
}

export function quizQuestions(bank, test) {
  return test ? practiceQuestions : bank.questions;
}

export function quizScore(correct, timeMs, questionCount, questionMs) {
  if (correct === 0) return 0;
  const maxTimeMs = questionCount * questionMs;
  const remaining = Math.max(0, Math.min(maxTimeMs, maxTimeMs - timeMs));
  const speedBonus = Math.floor((pointsPerCorrect - 1) * remaining / maxTimeMs);
  return correct * pointsPerCorrect + speedBonus;
}

function rowForToken(db, scope, hash) {
  return db.prepare('SELECT * FROM quiz_runs WHERE scope = ? AND token_hash = ?').bind(scope, hash).first();
}

async function runState(db, row, questions, period, questionMs) {
  const now = Date.now();
  const total = questions.length;
  const answered = questions[row.position - 1];
  const feedback = row.last_answer && answered ? {
    feedback: {
      ...JSON.parse(row.last_answer),
      questionId: String(answered.number),
      correctOptionId: answered.correct_answer_id,
    },
  } : {};
  if (row.finished_at !== null) {
    const best = await db.prepare(`SELECT best_token_hash, correct, time_ms, 1 + (
      SELECT COUNT(*) FROM quiz_players AS ahead WHERE ahead.scope = best.scope AND ahead.finished_at IS NOT NULL AND
      (-ahead.correct, ahead.time_ms, ahead.finished_at, ahead.best_token_hash) < (-best.correct, best.time_ms, best.finished_at, best.best_token_hash)
    ) AS rank FROM quiz_players AS best WHERE scope = ? AND player_key = ?`).bind(row.scope, row.player_key).first();
    return { completed: true, name: row.name, score: quizScore(row.correct, row.time_ms, total, questionMs), correct: row.correct, total, rank: best.rank,
      timeMs: row.time_ms, bestScore: quizScore(best.correct, best.time_ms, total, questionMs), bestTimeMs: best.time_ms, bestCorrect: best.correct,
      isBest: best.best_token_hash === row.token_hash, serverTime: iso(now), ...feedback };
  }
  const question = questions[row.position];
  const deadline = row.question_at + questionMs;
  return {
    completed: false,
    name: row.name,
    total,
    serverTime: iso(now),
    ...feedback,
    question: {
      id: String(question.number), index: row.position, text: question.question,
      options: question.answers, selection: 'single',
      startsAt: iso(row.question_at),
      deadlineAt: iso(Math.min(deadline, period.resetTime ?? Infinity)),
    },
  };
}

async function startQuiz(request, env, period, questions, questionMs) {
  const { scope, resetTime } = period;
  const { name, username, usernameConfirmation, startKey, confirmRepeat } = await readBody(request);
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
  if (resetTime !== null && now >= resetTime) fail(409, 'En ny konkurransedag har startet. Prøv igjen.', 'day_reset');
  const db = env.DB;
  const practice = resetTime === null;
  // Test for existing players in the INSERT itself so simultaneous starts cannot bypass confirmation.
  await db.prepare(`INSERT INTO quiz_runs (token_hash, scope, player_key, name, question_at, contact)
    SELECT ?, ?, ?, ?, ?, ? WHERE CASE
      WHEN EXISTS (SELECT 1 FROM quiz_players WHERE scope = ? AND player_key = ?) THEN ?
      ELSE ? OR COALESCE((SELECT players FROM quiz_daily_counts WHERE scope = ?), 0) < ?
    END ON CONFLICT DO NOTHING`).bind(tokenHash, scope, playerKey, nickname, now, contact,
    scope, playerKey, Number(confirmRepeat === true), Number(practice), scope, dailyCapacity).run();
  const row = await rowForToken(db, scope, tokenHash);
  if (!row && confirmRepeat !== true) {
    const existing = await db.prepare('SELECT 1 FROM quiz_players WHERE scope = ? AND player_key = ?').bind(scope, playerKey).first();
    if (existing) fail(409, 'Brukernavnet er allerede brukt. Vil du starte et nytt forsøk?', 'repeat_confirmation_required');
  }
  if (!row && !practice) fail(409, 'Dagens deltakergrense er nådd. En ny runde åpner kl. 08.00.', 'day_full');
  if (!row || row.player_key !== playerKey) fail(409, 'Dette brukernavnet har allerede en økt. Fortsett på enheten du startet på.', 'already_started');
  return json({ token: startKey, ...(await runState(db, row, questions, period, questionMs)) });
}

async function answerQuiz(request, db, row, questions, period, questionMs, receivedAt) {
  const { questionId, choices: selected } = await readBody(request);
  if (!Array.isArray(selected) || selected.length > 1 || typeof questionId !== 'string') fail(400, 'Velg ett svar.', 'invalid_answer');
  const answeredIndex = questions.findIndex(question => String(question.number) === questionId);
  if (answeredIndex < 0 || answeredIndex > row.position) fail(409, 'Spørsmålet har endret seg. Last inn økten på nytt.', 'question_changed');
  if (row.finished_at !== null || answeredIndex < row.position) return json(await runState(db, row, questions, period, questionMs));
  const question = questions[row.position];
  if (selected.length && !question.answers.some(option => option.id === selected[0])) fail(400, 'Ugyldig svaralternativ.', 'invalid_answer');
  const elapsed = receivedAt - row.question_at;
  if (elapsed < 0) fail(409, 'Spørsmålet har ikke startet ennå.', 'question_not_started');
  if (!selected.length && elapsed < questionMs - transportGraceMs) fail(409, 'Spørsmålet er fortsatt åpent.', 'not_timed_out');
  const timedOut = !selected.length || elapsed > questionMs + transportGraceMs;
  const correct = !timedOut && selected[0] === question.correct_answer_id;
  const feedback = JSON.stringify({ selectedOptionId: selected[0] ?? null, correct, timedOut });
  const duration = selected.length ? Math.min(elapsed, questionMs) : questionMs;
  const nextAt = Date.now();
  const final = row.position + 1 === questions.length;
  const updated = await db.prepare(`UPDATE quiz_runs SET position = position + 1, correct = correct + ?, time_ms = time_ms + ?,
    question_at = ?, finished_at = ?, last_answer = ? WHERE token_hash = ? AND position = ? AND finished_at IS NULL RETURNING *`)
    .bind(Number(correct), duration, nextAt + feedbackDelayMs, final ? nextAt : null, feedback, row.token_hash, row.position).first();
  return json(await runState(db, updated ?? await rowForToken(db, row.scope, row.token_hash), questions, period, questionMs));
}

async function quizRoute(request, env, url, bank) {
  const test = url.searchParams.get('test') === '1';
  const now = Date.now();
  const period = quizPeriod(now, test);
  const { scope } = period;
  const questions = quizQuestions(bank, test);
  const questionMs = bank.time_limit_seconds * 1000;
  const route = url.pathname;
  if (request.method === 'GET' && route === '/api/quiz/status') return json({ ...quizStatus(now, test, questions.length), active: true });
  if (!env.DB) throw new Error('DB unavailable');
  const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
  if (request.method === 'GET' && route === '/api/quiz/leaderboard') {
    const offsetValue = url.searchParams.get('offset') ?? '0';
    const offset = Number(offsetValue);
    if (!/^\d{1,4}$/.test(offsetValue) || offset > dailyCapacity) fail(400, 'Ugyldig side for topplisten.', 'invalid_offset');
    const limit = Math.min(boardPageSize, dailyCapacity - offset);
    const [count, data] = await Promise.all([
      db.prepare('SELECT scored FROM quiz_daily_counts WHERE scope = ?').bind(scope).first(),
      db.prepare(`SELECT name, correct, time_ms, player_key FROM quiz_players WHERE scope = ? AND finished_at IS NOT NULL
        ORDER BY ${ranks} LIMIT ? OFFSET ?`).bind(scope, limit, offset).all(),
    ]);
    const total = Math.min(dailyCapacity, count?.scored ?? 0);
    const next = offset + data.results.length;
    const rows = await Promise.all(data.results.map(async (r, i) => ({ rank: offset + i + 1, name: r.name,
      score: quizScore(r.correct, r.time_ms, questions.length, questionMs), timeMs: r.time_ms,
      entryId: (await hashToken('leaderboard', r.player_key)).slice(0, 24) })));
    return json({ rows,
      total, nextOffset: next < total ? next : null, ...periodDetails(period), updatedAt: iso(now) });
  }
  if (request.method === 'POST' && route === '/api/quiz/start') return startQuiz(request, { DB: db, QUIZ_ID_KEY: env.QUIZ_ID_KEY }, period, questions, questionMs);
  if ((request.method === 'GET' && route === '/api/quiz/run') || (request.method === 'POST' && route === '/api/quiz/answer')) {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{22,100})$/)?.[1];
    if (!token) fail(401, 'Fant ingen quizøkt.', 'invalid_token');
    const row = await rowForToken(db, scope, await hashToken(scope, token));
    if (!row) fail(401, 'Fant ingen quizøkt.', 'invalid_token');
    return request.method === 'GET' ? json(await runState(db, row, questions, period, questionMs)) : answerQuiz(request, db, row, questions, period, questionMs, now);
  }
  return json({ error: 'Ukjent endepunkt.' }, 404);
}

async function readFjord() {
  const response = await fetch(fjordSource, { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Fjordsprint ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.scores)) throw new Error('Invalid Fjordsprint response');
  return {
    rows: data.scores.map(r => ({ rank: r.rank, name: r.nickname, score: r.score, timeMs: r.timeMs })),
    day: data.day,
    updatedAt: iso(Date.now()),
  };
}

export async function fjordLeaderboard() {
  if (fjordCache && Date.now() - Date.parse(fjordCache.updatedAt) < 5000) return json({ ...fjordCache, stale: true });
  fjordPending ??= readFjord().then(result => (fjordCache = result)).finally(() => { fjordPending = undefined; });
  try {
    return json({ ...await fjordPending, stale: true });
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
