import { demo } from './demo.mjs';
import { invitationQr, issueJoinCode } from './invitations.mjs';
import { fail, validateQuiz, validateRound, visibleRound } from './rules.mjs';
import { cookie, cookieValue, input, json, noStore, passwordVerifier, randomHex, rows, secureEqual, sha, signature, sql } from './support.mjs';
import { ranking } from './player.mjs';

const sessionName = 'quizpa_admin';
const sessionPath = '/api/admin';
const sessionLife = 8 * 60 * 60;

function deployedAccount(env) {
  if (!env.ADMIN_PASSWORD_VERIFIER) return null;
  const parts = /^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(env.ADMIN_PASSWORD_VERIFIER);
  if (!parts) fail(503, 'admin_unavailable', 'Arrangørpassordet er ikke konfigurert riktig.');
  return { salt: parts[1], verifier: parts[2] };
}

async function hasSession(request, signingKey, now) {
  if (!signingKey) return false;
  const session = cookieValue(request, sessionName);
  if (!/^\d{10}\.[a-f0-9]{24}\.[a-f0-9]{64}$/.test(session)) return false;
  const [expires, nonce, mac] = session.split('.');
  return Number(expires) * 1000 > now &&
    secureEqual(mac, await signature(signingKey, expires + '.' + nonce));
}

async function sessionResponse(request, signingKey, now) {
  const claim = Math.floor(now / 1000 + sessionLife) + '.' + randomHex(12);
  const value = claim + '.' + await signature(signingKey, claim);
  return json({ authenticated: true }, 200, {
    'Set-Cookie': cookie(request, sessionName, value, sessionPath, sessionLife),
  });
}

async function loginLimit(request, env, now) {
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await signature(env.ADMIN_SESSION_SECRET, 'login:' + address);
  const bucket = Math.floor(now / 900_000);
  const result = await sql(env, 'INSERT INTO login_limits (key, bucket, hits) VALUES (?, ?, 1) ' +
    'ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN excluded.bucket > bucket THEN 1 ELSE min(hits + 1, 13) END, ' +
    'bucket = max(bucket, excluded.bucket) RETURNING hits', key, bucket).first();
  if (result.hits > 12) fail(429, 'login_limit', 'For mange forsøk. Prøv igjen om 15 minutter.');
}

function quizData(row) {
  return { id: row.id, title: row.title, description: row.description, revision: row.revision,
    updatedAt: row.updated_at, questions: JSON.parse(row.questions) };
}

async function getQuiz(env, id) {
  const quiz = await sql(env, 'SELECT * FROM quizzes WHERE id = ?', id).first();
  if (!quiz) fail(404, 'quiz_missing', 'Fant ikke quizen.');
  return quiz;
}

async function saveQuiz(env, value, now, id) {
  const quiz = validateQuiz(value);
  const payload = [quiz.title, quiz.description, JSON.stringify(quiz.questions), now];
  if (!id) {
    const created = await sql(env, 'INSERT INTO quizzes (title, description, questions, updated_at, id) ' +
      'VALUES (?, ?, ?, ?, ?) RETURNING *', ...payload, randomHex(12)).first();
    return quizData(created);
  }
  if (!Number.isInteger(value.revision)) fail(400, 'invalid_input', 'Last inn quizen før du lagrer.');
  const updated = await sql(env, 'UPDATE quizzes SET title = ?, description = ?, questions = ?, updated_at = ?, ' +
    'revision = revision + 1 WHERE id = ? AND revision = ? RETURNING *', ...payload, id, value.revision).first();
  if (!updated) fail(409, 'quiz_changed', 'Quizen er endret i en annen fane. Last inn siste versjon før du prøver igjen.');
  return quizData(updated);
}

function roundData(row, now) {
  return { ...visibleRound(row, now, row.question_count ?? JSON.parse(row.questions).length),
    quizId: row.source_quiz, quizRevision: row.source_revision, completed: row.completed ?? 0 };
}

function csvValue(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

const osloDate = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'medium',
});

function exportRound(code, entries) {
  const values = [
    ['Plass', 'Kallenavn', 'Poeng', 'Riktige svar', 'Svartid (ms)', 'Fullført (Oslo)'],
    ...entries.map(item => [
      item.rank, item.nickname, item.points, item.correct, item.elapsedMs, osloDate.format(item.completedAt),
    ]),
  ];
  return new Response('\ufeff' + values.map(row => row.map(csvValue).join(';')).join('\r\n') + '\r\n', {
    headers: { ...noStore, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quizpa-' + code + '.csv"' },
  });
}

export async function organizer(request, env, parts, now) {
  const method = request.method;
  const [area, id, action] = parts;
  const preset = deployedAccount(env);
  const signingKey = preset && env.ADMIN_SESSION_SECRET
    ? env.ADMIN_SESSION_SECRET + ':' + preset.verifier
    : env.ADMIN_SESSION_SECRET;
  const authenticated = await hasSession(request, signingKey, now);
  if (area === 'session' && parts.length === 1 && method === 'GET') {
    const configured = Boolean(preset ?? await sql(env, 'SELECT id FROM organizer WHERE id = 1').first());
    return json({ configured, authenticated,
      ready: Boolean(env.ADMIN_SESSION_SECRET && (configured || env.ADMIN_SETUP_HASH)) });
  }
  if (area === 'session' && parts.length === 1 && method === 'POST') {
    if (!env.ADMIN_SESSION_SECRET) fail(503, 'admin_unavailable', 'Arrangørsiden er ikke konfigurert.');
    await loginLimit(request, env, now);
    const value = await input(request);
    if (typeof value.password !== 'string' || value.password.length > 256) {
      fail(400, 'invalid_password', 'Skriv inn passordet.');
    }
    const account = preset ?? await sql(env, 'SELECT * FROM organizer WHERE id = 1').first();
    if (!account) {
      if (!env.ADMIN_SETUP_HASH || typeof value.setup !== 'string' || !/^[a-f0-9]{48}$/i.test(value.setup) ||
          !secureEqual(await sha(value.setup.toLowerCase()), env.ADMIN_SETUP_HASH)) {
        fail(401, 'invalid_setup', 'Oppsettkoden er ugyldig.');
      }
      if (value.password.trim().length < 16) {
        fail(400, 'weak_password', 'Velg et passord med minst 16 tegn.');
      }
      const salt = randomHex(16);
      const verifier = await passwordVerifier(value.password, salt);
      const created = await sql(env, 'INSERT INTO organizer VALUES (1, ?, ?) ' +
        'ON CONFLICT DO NOTHING RETURNING id', salt, verifier).first();
      if (!created) fail(409, 'already_configured', 'Arrangørsiden er allerede satt opp. Logg inn.');
    } else {
      if (!secureEqual(await passwordVerifier(value.password, account.salt), account.verifier)) {
        fail(401, 'invalid_password', 'Passordet stemmer ikke.');
      }
    }
    return sessionResponse(request, signingKey, now);
  }
  if (area === 'session' && parts.length === 1 && method === 'DELETE') {
    return json({ authenticated: false }, 200, {
      'Set-Cookie': cookie(request, sessionName, '', sessionPath, 0),
    });
  }
  if (!authenticated) fail(401, 'admin_required', 'Logg inn som arrangør.');

  if (area === 'overview' && parts.length === 1 && method === 'GET') {
    const [quizzes, rounds] = await Promise.all([
      rows(sql(env, 'SELECT id, title, description, revision, updated_at AS updatedAt, ' +
        'json_array_length(questions) AS questionCount FROM quizzes ORDER BY updated_at DESC')),
      rows(sql(env, 'SELECT r.code, r.source_quiz, r.source_revision, r.title, r.description, r.opens_at, r.closes_at, ' +
        'r.closed_at, r.feedback_mode, r.board_mode, json_array_length(r.questions) AS question_count, ' +
        '(SELECT count(*) FROM attempts a WHERE a.round_code = r.code AND a.completed_at IS NOT NULL) AS completed ' +
        'FROM rounds r WHERE r.source_quiz IS NOT NULL ORDER BY r.created_at DESC, r.code DESC')),
    ]);
    return json({ quizzes, rounds: rounds.map(round => roundData(round, now)) });
  }
  if (area === 'quizzes' && parts.length === 1 && method === 'POST') {
    return json(await saveQuiz(env, await input(request), now), 201);
  }
  if (area === 'quizzes' && parts.length === 2 && id === 'demo' && method === 'POST') {
    return json(await saveQuiz(env, demo, now), 201);
  }
  if (area === 'quizzes' && parts.length === 2 && method === 'GET') {
    return json(quizData(await getQuiz(env, id)));
  }
  if (area === 'quizzes' && parts.length === 2 && method === 'PUT') {
    return json(await saveQuiz(env, await input(request), now, id));
  }
  if (area === 'rounds' && parts.length === 1 && method === 'POST') {
    const value = await input(request);
    const settings = validateRound(value, now);
    const draft = await getQuiz(env, value.quizId ?? '');
    if (value.revision !== draft.revision) fail(409, 'quiz_changed', 'Last inn den nyeste utgaven av quizen før publisering.');
    const round = await sql(env, 'INSERT INTO rounds ' +
      '(code, source_quiz, source_revision, title, description, questions, opens_at, closes_at, feedback_mode, board_mode, created_at) ' +
      'SELECT ?, id, revision, title, description, questions, ?, ?, ?, ?, ? FROM quizzes WHERE id = ? AND revision = ? RETURNING *',
    randomHex(16), settings.open, settings.close, settings.feedback, settings.board, now, draft.id, draft.revision).first();
    if (!round) fail(409, 'quiz_changed', 'Quizen ble endret under publisering. Last inn siden og prøv igjen.');
    return json(roundData(round, now), 201);
  }
  if (area === 'rounds' && parts.length >= 2) {
    const round = await sql(env, 'SELECT * FROM rounds WHERE code = ? AND source_quiz IS NOT NULL', id).first();
    if (!round) fail(404, 'round_missing', 'Fant ikke runden.');
    if (parts.length === 3 && action === 'close' && method === 'POST') {
      const closed = await sql(env, 'UPDATE rounds SET closed_at = coalesce(closed_at, min(coalesce(closes_at, ?), ?)) ' +
        'WHERE code = ? RETURNING *', now, now, id).first();
      return json(roundData(closed, now));
    }
    if (parts.length === 2 && method === 'GET') {
      const entries = await ranking(env, round.code);
      return json({ round: { ...roundData(round, now), completed: entries.length }, entries });
    }
    if (parts.length === 3 && action === 'join-code' && method === 'GET') {
      return json(await issueJoinCode(env, round, now));
    }
    if (parts.length === 3 && action === 'qr' && method === 'GET') {
      return invitationQr(request, round.code);
    }
    if (parts.length === 3 && action === 'csv' && method === 'GET') {
      return exportRound(round.code, await ranking(env, round.code));
    }
  }
  fail(404, 'not_found', 'Fant ikke siden.');
}
