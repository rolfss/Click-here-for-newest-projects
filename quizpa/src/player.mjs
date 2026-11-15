import { demo } from './demo.mjs';
import { fail, nickname, requireOpen, ROUND_CAPACITY, roundStatus, scoreAnswer, shuffleOptions, visibleRound } from './rules.mjs';
import { cookie, cookieValue, input, json, randomHex, rows, sha, signature, sql } from './support.mjs';

const credentialName = 'quizpa_play';
const credentialLife = 180 * 24 * 60 * 60;
const codePattern = /^(?:[a-f0-9]{32}|demo)$/;
const secretPattern = /^[a-f0-9]{36}$/;
const roundOpenClause = 'r.closed_at IS NULL AND r.opens_at <= ? AND (r.closes_at IS NULL OR r.closes_at > ?)';

export async function ranking(env, code) {
  return rows(sql(env, 'SELECT RANK() OVER (ORDER BY points DESC, correct_count DESC, elapsed_ms ASC) AS rank, ' +
    'nickname, points, correct_count AS correct, elapsed_ms AS elapsedMs, completed_at AS completedAt ' +
    'FROM attempts WHERE round_code = ? AND completed_at IS NOT NULL ' +
    'ORDER BY points DESC, correct_count DESC, elapsed_ms ASC, nickname_key ASC', code));
}

async function findRound(env, code, now) {
  if (!codePattern.test(code)) fail(404, 'round_missing', 'Fant ikke runden. Sjekk invitasjonslenken.');
  let round = await sql(env, 'SELECT * FROM rounds WHERE code = ?', code).first();
  if (!round && code === 'demo') {
    await sql(env, "INSERT INTO rounds VALUES ('demo', NULL, 1, ?, ?, ?, ?, NULL, NULL, 'immediate', 'always', ?) " +
      'ON CONFLICT DO NOTHING', demo.title, demo.description, JSON.stringify(demo.questions), now, now).run();
    round = await sql(env, 'SELECT * FROM rounds WHERE code = ?', code).first();
  }
  if (!round) fail(404, 'round_missing', 'Fant ikke runden. Sjekk invitasjonslenken.');
  return round;
}

async function findAttempt(env, code, token) {
  if (!secretPattern.test(token)) return null;
  return sql(env, 'SELECT * FROM attempts WHERE round_code = ? AND access_hash = ?', code, await sha(token)).first();
}

function questionData(run, question) {
  const order = JSON.parse(run.option_order);
  return {
    index: run.position, text: question.text,
    options: order.map(option => question.options[option]),
    startedAt: run.started_at, deadline: run.deadline, duration: question.seconds * 1000,
  };
}

function feedbackData(answer, question, revealed) {
  const order = JSON.parse(answer.option_order);
  const feedback = {
    index: answer.position, text: question.text,
    options: order.map(option => question.options[option]),
    selected: answer.selected === null ? null : order.indexOf(answer.selected),
    outcome: answer.outcome === 'skip' || answer.outcome === 'timeout' || revealed ? answer.outcome : 'submitted',
  };
  if (revealed) {
    feedback.correctIndex = order.indexOf(question.correct);
    feedback.explanation = question.explanation;
    feedback.points = answer.points;
  }
  return feedback;
}

function answerWithOrder(env, id, index) {
  return sql(env, 'SELECT ans.*, q.option_order FROM answers ans JOIN question_runs q ' +
    'ON q.attempt_id = ans.attempt_id AND q.position = ans.position WHERE ans.attempt_id = ? AND ans.position = ?', id, index).first();
}

function revealAllowed(round, now) {
  return round.feedback_mode === 'immediate' || roundStatus(round, now) === 'closed';
}

async function snapshot(env, round, questions, attempt, now) {
  const info = visibleRound(round, now, questions.length);
  if (!attempt) return { round: info, player: null };
  const player = { nickname: attempt.nickname, position: attempt.position, completed: attempt.completed_at !== null };
  if (player.completed || revealAllowed(round, now)) {
    player.points = attempt.points;
    player.correct = attempt.correct_count;
  }
  if (player.completed && info.boardVisible) {
    const place = await sql(env, 'SELECT 1 + count(*) AS rank FROM attempts WHERE round_code = ? AND completed_at IS NOT NULL ' +
      'AND (points > ? OR (points = ? AND (correct_count > ? OR (correct_count = ? AND elapsed_ms < ?))))',
    round.code, attempt.points, attempt.points, attempt.correct_count, attempt.correct_count, attempt.elapsed_ms).first();
    player.rank = place.rank;
  }

  const state = { round: info, player };
  if (!player.completed && info.status === 'open') {
    const run = await sql(env, 'SELECT * FROM question_runs WHERE attempt_id = ? AND position = ?', attempt.id, attempt.position).first();
    if (run) state.question = questionData(run, questions[attempt.position]);
  }
  if (!state.question && attempt.position > 0) {
    const last = await answerWithOrder(env, attempt.id, attempt.position - 1);
    if (last) state.last = feedbackData(last, questions[last.position], revealAllowed(round, now));
  }
  return state;
}

async function loginReply(request, env, round, questions, attempt, token, now, includeCode) {
  const state = await snapshot(env, round, questions, attempt, now);
  if (includeCode) state.recoveryCode = token.match(/.{6}/g).join('-').toUpperCase();
  return json(state, includeCode ? 201 : 200, {
    'Set-Cookie': cookie(request, credentialName, token, '/api/play/' + round.code, credentialLife),
  });
}

async function join(request, env, round, questions, value, now, existing) {
  const normalized = nickname(value.nickname);
  if (existing) {
    if (existing.nickname_key !== normalized.key) fail(409, 'already_joined', 'Du har allerede en runde på denne enheten.');
    return json(await snapshot(env, round, questions, existing, now));
  }
  // The request seed allows the same browser to retry a join whose reply was lost.
  const seed = typeof value.requestId === 'string' && /^[a-f0-9]{32}$/.test(value.requestId) ? value.requestId : null;
  const token = seed && env.ADMIN_SESSION_SECRET
    ? (await signature(env.ADMIN_SESSION_SECRET, ['join', round.code, normalized.key, seed].join(':'))).slice(0, 36)
    : randomHex(18);
  const previous = seed ? await findAttempt(env, round.code, token) : null;
  if (previous) return loginReply(request, env, round, questions, previous, token, now, true);
  requireOpen(round, now);
  const created = await sql(env, 'INSERT INTO attempts (id, round_code, nickname, nickname_key, access_hash) ' +
    'SELECT ?, r.code, ?, ?, ? FROM rounds r WHERE r.code = ? AND ' + roundOpenClause +
    ' AND (SELECT count(*) FROM attempts WHERE round_code = r.code) < ? ' +
    'ON CONFLICT DO NOTHING RETURNING *',
  randomHex(12), normalized.name, normalized.key, await sha(token), round.code, now, now, ROUND_CAPACITY).first();
  if (created) return loginReply(request, env, round, questions, created, token, now, true);
  const repeated = await findAttempt(env, round.code, token);
  if (repeated) return loginReply(request, env, round, questions, repeated, token, now, true);
  requireOpen(await findRound(env, round.code, now), now);
  const duplicate = await sql(env, 'SELECT id FROM attempts WHERE round_code = ? AND nickname_key = ?',
    round.code, normalized.key).first();
  if (duplicate) fail(409, 'nickname_taken', 'Kallenavnet er i bruk. Velg et annet, eller fortsett med din personlige kode.');
  fail(409, 'round_full', 'Runden er full.');
}

async function startQuestion(env, round, questions, attempt, index, now) {
  requireOpen(round, now);
  if (attempt.completed_at !== null || !Number.isInteger(index) || index !== attempt.position) {
    fail(409, 'question_changed', 'Du er kommet til et annet spørsmål. Last inn runden igjen.');
  }
  const question = questions[index];
  const startedAt = Date.now();
  const deadline = Math.min(startedAt + question.seconds * 1000, round.closes_at ?? Infinity);
  if (deadline <= startedAt) requireOpen(round, startedAt);
  const order = JSON.stringify(shuffleOptions(question.options.length));
  const run = await sql(env, 'INSERT INTO question_runs (attempt_id, position, option_order, started_at, deadline) ' +
    'SELECT a.id, a.position, ?, ?, ? FROM attempts a JOIN rounds r ON r.code = a.round_code ' +
    'WHERE a.id = ? AND a.position = ? AND a.completed_at IS NULL AND ' + roundOpenClause +
    ' ON CONFLICT DO NOTHING RETURNING *',
  order, startedAt, deadline, attempt.id, index, startedAt, startedAt).first();
  if (!run) {
    const currentRound = await findRound(env, round.code, now);
    const currentAttempt = await sql(env, 'SELECT * FROM attempts WHERE id = ?', attempt.id).first();
    return snapshot(env, currentRound, questions, currentAttempt, Date.now());
  }
  return {
    round: visibleRound(round, Date.now(), questions.length),
    player: { nickname: attempt.nickname, position: index, completed: false },
    question: questionData(run, question),
  };
}

async function submitAnswer(env, round, questions, attempt, value, now) {
  const index = value.index;
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
    fail(400, 'invalid_question', 'Spørsmålet er ugyldig.');
  }
  let answer = await answerWithOrder(env, attempt.id, index);
  if (!answer) {
    requireOpen(round, now);
    if (index !== attempt.position) fail(409, 'question_changed', 'Last inn spørsmålet på nytt.');
    const run = await sql(env, 'SELECT * FROM question_runs WHERE attempt_id = ? AND position = ?', attempt.id, index).first();
    if (!run) fail(409, 'question_not_started', 'Åpne spørsmålet før du svarer.');
    const order = JSON.parse(run.option_order);
    if (value.choice !== null && (!Number.isInteger(value.choice) || value.choice < 0 || value.choice >= order.length)) {
      fail(400, 'invalid_choice', 'Velg et svaralternativ.');
    }
    const late = now >= run.deadline;
    if (value.timeout === true && !late) fail(409, 'timer_running', 'Det er fortsatt tid igjen.');
    const selected = late || value.choice === null ? null : order[value.choice];
    const question = questions[index];
    const outcome = late ? 'timeout' : selected === null ? 'skip' : selected === question.correct ? 'correct' : 'wrong';
    const elapsed = Math.max(0, Math.min(now, run.deadline) - run.started_at);
    const duration = question.seconds * 1000;
    const points = scoreAnswer(outcome === 'correct', index, questions.length, elapsed, duration);
    await sql(env, 'INSERT INTO answers (attempt_id, position, selected, outcome, points, elapsed_ms, submitted_at, is_last) ' +
      'SELECT a.id, a.position, ?, ?, ?, ?, ?, ? FROM attempts a JOIN rounds r ON r.code = a.round_code ' +
      'WHERE a.id = ? AND a.position = ? AND a.completed_at IS NULL AND ' + roundOpenClause +
      ' ON CONFLICT DO NOTHING',
    selected, outcome, points, elapsed, now, Number(index + 1 === questions.length),
    attempt.id, index, now, now).run();
    answer = await answerWithOrder(env, attempt.id, index);
  }
  if (!answer) {
    requireOpen(await findRound(env, round.code, now), now);
    fail(409, 'question_changed', 'Last inn spørsmålet på nytt.');
  }
  const current = await sql(env, 'SELECT * FROM attempts WHERE id = ?', attempt.id).first();
  const state = await snapshot(env, round, questions, current, now);
  state.answer = feedbackData(answer, questions[index], revealAllowed(round, now));
  return state;
}

export async function player(request, env, parts, now) {
  const [code, action] = parts;
  const method = request.method;
  const round = await findRound(env, code ?? '', now);
  const questions = JSON.parse(round.questions);
  if (action === 'board' && parts.length === 2 && method === 'GET') {
    const info = visibleRound(round, now, questions.length);
    if (!info.boardVisible) fail(403, 'board_hidden', 'Topplisten er skjult.');
    const entries = await ranking(env, code);
    // Timing breakdown and exact finish dates stay in the organizer report.
    return json({ round: info, entries: entries.map(({ rank, nickname, points, correct }) => ({ rank, nickname, points, correct })) });
  }
  const token = cookieValue(request, credentialName);
  const attempt = await findAttempt(env, code, token);
  if (parts.length === 1 && method === 'GET') return json(await snapshot(env, round, questions, attempt, now));
  if (parts.length !== 2) fail(404, 'not_found', 'Fant ikke siden.');
  if (action === 'join' && method === 'POST') return join(request, env, round, questions, await input(request), now, attempt);
  if (action === 'recover' && method === 'POST') {
    const value = await input(request);
    const recoveredToken = typeof value.code === 'string' ? value.code.replace(/[-\s]/g, '').toLowerCase() : '';
    const recovered = await findAttempt(env, code, recoveredToken);
    if (!recovered) fail(401, 'invalid_recovery', 'Koden passer ikke til denne runden.');
    return loginReply(request, env, round, questions, recovered, recoveredToken, now, false);
  }
  if (action === 'leave' && method === 'POST') {
    return json({ left: true }, 200, { 'Set-Cookie': cookie(request, credentialName, '', '/api/play/' + code, 0) });
  }
  if (!attempt) fail(401, 'player_required', 'Velg et kallenavn eller bruk din personlige kode.');
  if (action === 'code' && method === 'GET') {
    return json({ code: token.match(/.{6}/g).join('-').toUpperCase() });
  }
  if (action === 'next' && method === 'POST') {
    return json(await startQuestion(env, round, questions, attempt, (await input(request)).index, now));
  }
  if (action === 'answer' && method === 'POST') {
    return json(await submitAnswer(env, round, questions, attempt, await input(request), now));
  }
  if (action === 'review' && method === 'GET') {
    if (!revealAllowed(round, now) || (attempt.completed_at === null && roundStatus(round, now) !== 'closed')) {
      fail(403, 'review_hidden', 'Fasiten er ikke tilgjengelig ennå.');
    }
    const answered = await rows(sql(env, 'SELECT a.*, q.option_order FROM answers a JOIN question_runs q ' +
      'ON q.attempt_id = a.attempt_id AND q.position = a.position WHERE a.attempt_id = ? ORDER BY a.position', attempt.id));
    return json({ answers: answered.map(answer => feedbackData(answer, questions[answer.position], true)) });
  }
  fail(404, 'not_found', 'Fant ikke siden.');
}
