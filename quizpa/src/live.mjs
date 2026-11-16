import { fail, nickname, scoreAnswer } from './rules.mjs';
import { cookie, cookieValue, input, json, randomHex, rows, sha, signature, sql } from './support.mjs';

const capacity = 50;
const minimumPlayers = 2;
const lobbyLifetime = 2 * 60 * 60 * 1000;
const credentialName = 'quizpa_live';
const credentialLifetime = 24 * 60 * 60;
const gameIdPattern = /^[a-f0-9]{32}$/;
const credentialPattern = /^[a-f0-9]{36}$/;
const lookupPeriod = 120_000;
const maxLookupFailures = 20;
const pinSpace = 1_000_000;
const openLobby = "phase = 'lobby' AND lobby_expires_at > ?";

function randomPin() {
  const sample = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / pinSpace) * pinSpace;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return String(sample[0] % pinSpace).padStart(6, '0');
}

function phaseAt(game, now) {
  if (game.phase === 'lobby' && game.lobby_expires_at <= now) return 'cancelled';
  if (game.phase === 'question' && game.deadline <= now) return 'reveal';
  return game.phase;
}

function gameSummary(game, now) {
  return {
    id: game.id, title: game.title, description: game.description, phase: phaseAt(game, now),
    position: game.position, questionCount: game.question_count, deadline: game.deadline,
    serverNow: now,
  };
}

function privateSummary(game, now) {
  return {
    ...gameSummary(game, now), pin: game.pin, createdAt: game.created_at, expiresAt: game.lobby_expires_at,
    quizId: game.source_quiz, quizRevision: game.source_revision,
  };
}

function missingGame() {
  fail(404, 'live_missing', 'Fant ikke livequizen. Sjekk spillkoden hos arrangøren.');
}

async function findGame(env, id, accessHash = null) {
  if (!gameIdPattern.test(id)) missingGame();
  const game = await sql(env, `SELECT g.*, json_array_length(g.questions) AS question_count,
    p.id AS player_id, p.nickname_key AS player_nickname_key
    FROM live_games g LEFT JOIN live_players p ON p.game_id = g.id AND p.access_hash = ?
    WHERE g.id = ?`, accessHash, id).first();
  if (!game) missingGame();
  return game;
}

function byScore(left, right) {
  return right.points - left.points || right.correct - left.correct || left.elapsed - right.elapsed;
}

function standings(players) {
  const ordered = [...players].sort((left, right) => byScore(left, right) || left.key.localeCompare(right.key, 'nb-NO'));
  let rank = 0;
  return ordered.map((player, index) => {
    if (index === 0 || byScore(player, ordered[index - 1]) !== 0) rank = index + 1;
    return { rank, nickname: player.nickname, points: player.points, correct: player.correct };
  });
}

async function snapshot(env, id, now, { admin = false, accessHash = null } = {}) {
  // Read the game, player totals, and answers from one database snapshot.
  const game = await sql(env, `SELECT g.id, g.pin, g.source_quiz, g.source_revision, g.title, g.description,
    g.phase, g.position, g.deadline, g.created_at, g.lobby_expires_at,
    json_array_length(g.questions) AS question_count,
    json_extract(g.questions, '$[' || nullif(g.position, -1) || ']') AS current_question,
    (SELECT json_group_array(json_object(
      'nickname', p.nickname, 'key', p.nickname_key, 'joinedAt', p.joined_at, 'own', p.access_hash = ?,
      'answer', a.selected, 'points', p.points, 'correct', p.correct_count, 'elapsed', p.correct_elapsed_ms,
      'answerPoints', a.points, 'answerCorrect', a.correct
    )) FROM live_players p
      LEFT JOIN live_answers a ON a.game_id = p.game_id AND a.player_id = p.id AND a.position = g.position
      WHERE p.game_id = g.id) AS player_data
    FROM live_games g WHERE g.id = ?`,
  accessHash, id).first();
  if (!game) missingGame();

  const summary = admin ? privateSummary(game, now) : gameSummary(game, now);
  const players = JSON.parse(game.player_data);
  const own = players.find(player => player.own);
  const { phase } = summary;
  const canView = admin || own;
  const scoresVisible = phase === 'reveal' || phase === 'finished';
  const leaderboard = canView && scoresVisible ? standings(players) : [];
  let question = null;
  if (canView && (phase === 'question' || phase === 'reveal')) {
    const current = JSON.parse(game.current_question);
    question = { text: current.text, options: current.options, seconds: current.seconds };
    if (phase === 'reveal') {
      question.correctIndex = current.correct;
      question.explanation = current.explanation;
    }
  }

  return {
    ...summary,
    playerCount: players.length,
    answeredCount: players.filter(player => player.answer !== null).length,
    players: players.sort((left, right) => left.joinedAt - right.joinedAt || left.key.localeCompare(right.key, 'nb-NO'))
      .map(({ nickname }) => ({ nickname })),
    question,
    leaderboard,
    winners: phase === 'finished' ? leaderboard.filter(entry => entry.rank === 1).map(entry => entry.nickname) : [],
    player: own ? {
      nickname: own.nickname,
      answer: own.answer,
      points: own.points - (scoresVisible ? 0 : own.answerPoints ?? 0),
      correct: own.correct - (scoresVisible ? 0 : own.answerCorrect ?? 0),
    } : null,
  };
}

async function createGame(env, value, now) {
  if (typeof value.quizId !== 'string' || !/^[a-f0-9]{24}$/.test(value.quizId) || !Number.isInteger(value.revision)) {
    fail(400, 'invalid_input', 'Velg en lagret quiz.');
  }
  await sql(env, "UPDATE live_games SET phase = 'cancelled' WHERE phase = 'lobby' AND lobby_expires_at <= ?", now).run();
  const id = randomHex(16);
  for (let attempt = 0; attempt < 6; attempt++) {
    const created = await sql(env, `INSERT INTO live_games
      (id, pin, source_quiz, source_revision, title, description, questions, created_at, lobby_expires_at)
      SELECT ?, ?, id, revision, title, description, questions, ?, ? FROM quizzes
      WHERE id = ? AND revision = ?
      ON CONFLICT DO NOTHING RETURNING id`,
    id, randomPin(), now, now + lobbyLifetime, value.quizId, value.revision).first();
    if (created) return created.id;
    const draft = await sql(env, 'SELECT revision FROM quizzes WHERE id = ?', value.quizId).first();
    if (!draft) fail(404, 'quiz_missing', 'Fant ikke quizen.');
    if (draft.revision !== value.revision) {
      fail(409, 'quiz_changed', 'Last inn den nyeste utgaven av quizen før du oppretter et live-spill.');
    }
  }
  fail(503, 'code_unavailable', 'Spillkoden kunne ikke opprettes. Prøv igjen.');
}

async function advance(env, game, now) {
  const phase = phaseAt(game, now);
  if (phase === 'finished') return;
  if (phase === 'cancelled') fail(409, 'live_closed', 'Livequizen er avsluttet.');
  if (phase === 'question') fail(409, 'timer_running', 'Det er fortsatt tid igjen.');

  const position = game.position + 1;
  const question = JSON.parse(game.questions)[position];
  if (phase === 'lobby') {
    const started = await sql(env, `UPDATE live_games SET phase = 'question', position = ?, started_at = ?, deadline = ?
      WHERE id = ? AND ${openLobby} AND (SELECT count(*) FROM live_players WHERE game_id = ?) >= ?
      RETURNING id`,
    position, now, now + question.seconds * 1000, game.id, now, game.id, minimumPlayers).first();
    if (!started && phaseAt(await findGame(env, game.id), now) === 'lobby') {
      fail(409, 'more_players_needed', 'Vent til minst to spillere har blitt med.');
    }
    return;
  }
  await sql(env, `UPDATE live_games SET phase = ?, position = ?, started_at = ?, deadline = ?
    WHERE id = ? AND phase = 'question' AND position = ? AND deadline <= ?`,
  question ? 'question' : 'finished', question ? position : game.position,
  question ? now : null, question ? now + question.seconds * 1000 : null,
  game.id, game.position, now).run();
}

async function lookup(request, env, now) {
  const value = (await input(request)).code;
  const pin = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  if (!/^\d{6}$/.test(pin)) fail(400, 'invalid_code', 'Skriv inn de seks sifrene i spillkoden.');
  if (!env.ADMIN_SESSION_SECRET) fail(503, 'code_unavailable', 'Spillkoder er midlertidig utilgjengelige.');

  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await signature(env.ADMIN_SESSION_SECRET, 'live-code:' + address);
  const bucket = Math.floor(now / lookupPeriod);
  const match = `SELECT id FROM live_games WHERE pin = ? AND ${openLobby}`;
  // Count failed guesses atomically. Players sharing a network can all use the correct PIN.
  const [found, failures] = await env.DB.batch([
    sql(env, match + ' AND NOT EXISTS (SELECT 1 FROM login_limits WHERE key = ? AND bucket = ? AND hits >= ?)',
      pin, now, key, bucket, maxLookupFailures),
    sql(env, `INSERT INTO login_limits (key, bucket, hits) SELECT ?, ?, 1 WHERE NOT EXISTS (${match})
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN excluded.bucket > bucket THEN 1
          WHEN excluded.bucket = bucket THEN min(hits + 1, ?) ELSE hits END,
        bucket = max(bucket, excluded.bucket)
      RETURNING hits`, key, bucket, pin, now, maxLookupFailures),
  ]);
  if (found.results[0]) return json({ path: '/live/' + found.results[0].id });
  if ((failures.results[0]?.hits ?? maxLookupFailures) >= maxLookupFailures) {
    fail(429, 'code_limit', 'For mange forsøk. Vent litt og prøv igjen.');
  }
  fail(404, 'code_missing', 'Spillkoden er ugyldig eller lobbyen er stengt. Sjekk koden hos arrangøren.');
}

function requireLobby(game, now) {
  if (phaseAt(game, now) !== 'lobby') {
    fail(409, 'lobby_closed', 'Det er ikke lenger mulig å bli med i dette spillet.');
  }
}

async function join(request, env, game, value, now, accessHash) {
  const normalized = nickname(value.nickname);
  if (game.player_id) {
    if (game.player_nickname_key !== normalized.key) {
      fail(409, 'already_joined', 'Du er allerede med i dette spillet på denne enheten.');
    }
    return json(await snapshot(env, game.id, now, { accessHash }));
  }

  const seed = typeof value.requestId === 'string' && gameIdPattern.test(value.requestId) ? value.requestId : null;
  const token = seed && env.ADMIN_SESSION_SECRET
    ? (await signature(env.ADMIN_SESSION_SECRET, ['live-join', game.id, normalized.key, seed].join(':'))).slice(0, 36)
    : randomHex(18);
  const tokenHash = await sha(token);
  const headers = { 'Set-Cookie': cookie(request, credentialName, token, '/api/live/' + game.id, credentialLifetime) };
  const created = await sql(env, `INSERT INTO live_players (game_id, id, nickname, nickname_key, access_hash, joined_at)
    SELECT id, ?, ?, ?, ?, ? FROM live_games
    WHERE id = ? AND ${openLobby} AND (SELECT count(*) FROM live_players WHERE game_id = ?) < ?
    ON CONFLICT DO NOTHING RETURNING id`,
  randomHex(12), normalized.name, normalized.key, tokenHash, now, game.id, now, game.id, capacity).first();
  if (created) return json(await snapshot(env, game.id, now, { accessHash: tokenHash }), 201, headers);

  const current = await findGame(env, game.id, tokenHash);
  if (current.player_id) return json(await snapshot(env, game.id, now, { accessHash: tokenHash }), 200, headers);
  requireLobby(current, now);
  const duplicate = await sql(env, 'SELECT 1 AS taken FROM live_players WHERE game_id = ? AND nickname_key = ?',
    game.id, normalized.key).first();
  if (duplicate) fail(409, 'nickname_taken', 'Kallenavnet er i bruk. Velg et annet.');
  fail(409, 'live_full', 'Spillet er fullt. Maks 50 spillere kan bli med.');
}

async function answer(env, game, value, now, accessHash) {
  if (!game.player_id) fail(401, 'player_required', 'Skriv inn et kallenavn for å bli med i spillet.');
  const { position, choice } = value;
  if (!Number.isInteger(position) || position < 0 || position >= game.question_count) {
    fail(400, 'invalid_question', 'Spørsmålet er ugyldig.');
  }
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) fail(400, 'invalid_choice', 'Velg et svaralternativ.');

  let saved;
  if (phaseAt(game, now) === 'question' && game.position === position) {
    const question = JSON.parse(game.questions)[position];
    if (choice >= question.options.length) fail(400, 'invalid_choice', 'Velg et svaralternativ.');
    const correct = choice === question.correct;
    const elapsed = Math.max(0, now - game.started_at);
    const points = scoreAnswer(correct, position, game.question_count, elapsed, question.seconds * 1000);
    saved = await sql(env, `INSERT INTO live_answers (game_id, player_id, position, selected, correct, points, elapsed_ms)
      SELECT id, ?, position, ?, ?, ?, ? FROM live_games
      WHERE id = ? AND phase = 'question' AND position = ? AND deadline > ?
      ON CONFLICT DO NOTHING RETURNING selected`,
    game.player_id, choice, Number(correct), points, elapsed, game.id, position, now).first();
  }
  saved ??= await sql(env, 'SELECT selected FROM live_answers WHERE game_id = ? AND player_id = ? AND position = ?',
    game.id, game.player_id, position).first();
  if (!saved) fail(409, 'question_closed', 'Dette spørsmålet er ikke lenger åpent for svar.');
  if (saved.selected !== choice) fail(409, 'answer_locked', 'Du har allerede svart på dette spørsmålet.');
  return json(await snapshot(env, game.id, now, { accessHash }));
}

export async function liveAdmin(request, env, parts, now) {
  const [id, action] = parts;
  if (!parts.length && request.method === 'GET') {
    const games = await rows(sql(env, `SELECT g.id, g.pin, g.source_quiz, g.source_revision, g.title, g.description,
      g.phase, g.position, g.deadline, g.created_at, g.lobby_expires_at, json_array_length(g.questions) AS question_count,
      (SELECT count(*) FROM live_players p WHERE p.game_id = g.id) AS player_count
      FROM live_games g ORDER BY g.created_at DESC, g.id DESC`));
    return json({ games: games.map(game => ({ ...privateSummary(game, now), playerCount: game.player_count })) });
  }
  if (!parts.length && request.method === 'POST') {
    const created = await createGame(env, await input(request), now);
    return json(await snapshot(env, created, now, { admin: true }), 201);
  }
  if (parts.length === 1 && request.method === 'GET') {
    if (!gameIdPattern.test(id)) missingGame();
    return json(await snapshot(env, id, now, { admin: true }));
  }
  if (parts.length === 2 && request.method === 'POST' && action === 'advance') {
    const game = await findGame(env, id);
    await advance(env, game, now);
    return json(await snapshot(env, id, now, { admin: true }));
  }
  if (parts.length === 2 && request.method === 'POST' && action === 'cancel') {
    await findGame(env, id);
    const cancelled = await sql(env, `UPDATE live_games SET phase = 'cancelled', started_at = NULL, deadline = NULL
      WHERE id = ? AND phase IN ('lobby', 'question', 'cancelled') RETURNING id`, id).first();
    if (!cancelled) fail(409, 'live_finished', 'Spillet er allerede ferdig.');
    return json(await snapshot(env, id, now, { admin: true }));
  }
  fail(404, 'not_found', 'Fant ikke siden.');
}

export async function livePlayer(request, env, parts, now) {
  const [id, action] = parts;
  if (parts.length === 1 && id === 'lookup' && request.method === 'POST') return lookup(request, env, now);
  if (!gameIdPattern.test(id ?? '')) missingGame();
  const token = cookieValue(request, credentialName);
  const accessHash = credentialPattern.test(token) ? await sha(token) : null;
  if (parts.length === 1 && request.method === 'GET') {
    return json(await snapshot(env, id, now, { accessHash }));
  }
  if (parts.length === 2 && request.method === 'POST') {
    const game = await findGame(env, id, accessHash);
    if (action === 'join') return join(request, env, game, await input(request), now, accessHash);
    if (action === 'answer') return answer(env, game, await input(request), now, accessHash);
  }
  fail(404, 'not_found', 'Fant ikke siden.');
}
