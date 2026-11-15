import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../dist/server/index.js';
import { localDatabase } from '../scripts/sqlite.mjs';
import { osloTime, scoreAnswer, validateQuiz } from '../src/rules.mjs';

const source = 'https://quiz.example';
const setup = '5'.repeat(48);
const password = 'Bare for denne syntetiske testen';
const questions = [
  { text: 'Velg Blå.', options: ['Rød', 'Blå', 'Hvit'], correct: 1, explanation: 'Forklaring 1', seconds: 5 },
  { text: 'Velg Kyst.', options: ['Kyst', 'Innland'], correct: 0, explanation: 'Forklaring 2', seconds: 5 },
  { text: 'Velg Fem.', options: ['To', 'Tre', 'Fem', 'Seks'], correct: 2, explanation: 'Forklaring 3', seconds: 5 },
];

function fixture(t) {
  const env = {
    DB: localDatabase(),
    ADMIN_SETUP_HASH: createHash('sha256').update(setup).digest('hex'),
    ADMIN_SESSION_SECRET: 'syntetisk testhemmelighet',
  };
  t.after(() => env.DB.close());
  return env;
}

function client(env) {
  const cookies = new Map();
  return async (path, data, expected = 200, method = data === undefined ? 'GET' : 'POST', origin = source) => {
    const headers = new Headers();
    const matching = [...cookies].filter(([scope]) => path === scope || path.startsWith(scope + '/'));
    headers.set('Cookie', matching.map(([, value]) => value).join('; '));
    if (data !== undefined) {
      headers.set('Origin', origin);
      headers.set('Content-Type', 'application/json');
    }
    const response = await app.fetch(new Request(source + path, {
      method, headers, body: data !== undefined ? JSON.stringify(data) : undefined,
    }), env);
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      assert.match(setCookie, /HttpOnly.*SameSite=Lax.*Secure/);
      const scope = setCookie.match(/Path=([^;]+)/)[1];
      if (setCookie.includes('Max-Age=0')) cookies.delete(scope);
      else cookies.set(scope, setCookie.split(';')[0]);
    }
    const raw = await response.text();
    assert.equal(response.status, expected, method + ' ' + path + ' returned ' + raw);
    return response.headers.get('Content-Type')?.includes('application/json') ? JSON.parse(raw) : raw;
  };
}

test('scores reward speed, caps the total bonus, and always favor more correct answers', () => {
  for (let count = 1; count <= 40; count++) {
    let points = 0;
    for (let index = 0; index < count; index++) {
      points += scoreAnswer(true, index, count, 0, 10000);
      assert.equal(scoreAnswer(false, index, count, 0, 10000), 0);
      assert.equal(scoreAnswer(true, index, count, 10000, 10000), 1000);
    }
    assert.equal(points, count * 1000 + 500);
    assert.ok((count - 1) * 1000 + 500 < count * 1000);
  }
  assert.ok(scoreAnswer(true, 0, 1, 100, 5000) > scoreAnswer(true, 0, 1, 800, 5000));
});

test('Oslo deadlines cover summer time, winter time, and invalid wall times', () => {
  assert.equal(osloTime('2026-11-15T09:00'), Date.parse('2026-11-15T08:00:00Z'));
  assert.equal(osloTime('2026-06-15T09:00'), Date.parse('2026-06-15T07:00:00Z'));
  for (const invalid of ['2026-03-29T02:30', '2026-10-25T02:30', '2026-02-31T09:00']) {
    assert.throws(() => osloTime(invalid), { code: 'invalid_time' });
  }
});

test('validates multiple choice before storing drafts', () => {
  assert.throws(() => validateQuiz({ title: 'Test', questions: [{ ...questions[0], options: ['Blå', 'blå'] }] }),
    { code: 'invalid_input' });
  assert.throws(() => validateQuiz({ title: 'Test', questions: [{ ...questions[0], correct: 5 }] }),
    { code: 'invalid_input' });
});

test('organizer and two players complete a round, recover, rank, export, and close', async t => {
  const env = fixture(t);
  const admin = client(env);
  const anonymous = client(env);
  const fast = client(env);
  const slow = client(env);
  const recovery = client(env);
  let time = Date.parse('2026-11-15T08:00:00Z');
  t.mock.method(Date, 'now', () => time);

  assert.match(await anonymous('/'), /Quiz på/);
  assert.match(await anonymous('/assets/admin.js'), /Kopier Teams-melding/);
  assert.doesNotMatch(await anonymous('/assets/play.js'), /Forklaring 1|ADMIN_SETUP_HASH/);
  assert.deepEqual(await anonymous('/api/health'), { ok: true });
  assert.equal((await anonymous('/api/admin/overview', undefined, 401)).code, 'admin_required');
  assert.equal((await admin('/api/admin/session')).configured, false);
  assert.equal((await admin('/api/admin/session', { setup: '4'.repeat(48), password }, 401)).code, 'invalid_setup');
  await admin('/api/admin/session', { setup, password });
  const quiz = await admin('/api/admin/quizzes', { title: 'Navn <quiz>', description: 'Test', questions }, 201);
  const settings = { quizId: quiz.id, revision: quiz.revision, feedbackMode: 'immediate', boardMode: 'always' };
  const published = await admin('/api/admin/rounds', settings, 201);
  const path = '/api/play/' + published.code;
  const joinSeed = 'c'.repeat(32);
  const joined = await fast(path + '/join', { nickname: 'Rask Rev', requestId: joinSeed }, 201);
  assert.ok(joined.recoveryCode);
  assert.equal((await anonymous(path + '/join', { nickname: 'Rask Rev', requestId: joinSeed }, 201)).recoveryCode, joined.recoveryCode);
  assert.equal((await slow(path + '/join', { nickname: 'rask   rev' }, 409)).code, 'nickname_taken');
  await slow(path + '/join', { nickname: 'Sakte Ørn' }, 201);
  assert.equal((await slow(path + '/answer', { index: 0, choice: 1 }, 409)).code, 'question_not_started');
  const fastQuestion = await fast(path + '/next', { index: 0 });
  const slowQuestion = await slow(path + '/next', { index: 0 });
  assert.equal(fastQuestion.question.text, 'Velg Blå.');
  assert.equal(fastQuestion.question.correctIndex, undefined);
  assert.equal(fastQuestion.question.explanation, undefined);
  time += 400;
  const resumed = await recovery(path + '/recover', { code: joined.recoveryCode });
  assert.equal(resumed.question.deadline, fastQuestion.question.deadline);
  assert.deepEqual(resumed.question.options, fastQuestion.question.options);
  const first = await fast(path + '/answer', { index: 0, choice: fastQuestion.question.options.indexOf('Blå') });
  const duplicate = await recovery(path + '/answer', { index: 0, choice: null });
  assert.deepEqual(duplicate.answer, first.answer);
  time += 2000;
  const later = await slow(path + '/answer', { index: 0, choice: slowQuestion.question.options.indexOf('Blå') });
  assert.ok(first.answer.points > later.answer.points);
  assert.equal(first.answer.explanation, 'Forklaring 1');

  for (let index = 1; index < 3; index++) {
    for (const person of [fast, slow]) {
      const started = await person(path + '/next', { index });
      time += person === fast ? 100 : 700;
      const answer = await person(path + '/answer', {
        index, choice: started.question.options.indexOf(index === 1 ? 'Kyst' : 'Fem'),
      });
      assert.equal(answer.player.position, index + 1);
    }
  }
  const entries = (await anonymous(path + '/board')).entries;
  assert.deepEqual(entries.map(item => [item.nickname, item.rank, item.correct]), [['Rask Rev', 1, 3], ['Sakte Ørn', 2, 3]]);
  assert.ok(entries[0].points > entries[1].points);
  assert.equal(entries[0].completedAt, undefined);
  assert.match(await admin('/api/admin/rounds/' + published.code + '/csv'), /"Sakte Ørn"/);
  assert.equal((await fast(path + '/review')).answers.length, 3);

  const updated = await admin('/api/admin/quizzes/' + quiz.id, {
    ...quiz, questions: [{ ...questions[0], text: 'Oppdatert' }],
  }, 200, 'PUT');
  assert.equal((await anonymous(path)).round.questionCount, 3);
  await admin('/api/admin/rounds', settings, 409);
  const replacement = await admin('/api/admin/rounds', { ...settings, revision: updated.revision }, 201);
  assert.notEqual(replacement.code, published.code);
  assert.equal(replacement.questionCount, 1);
  assert.equal((await anonymous('/api/play/' + replacement.code + '/board')).entries.length, 0);

  await admin('/api/admin/rounds/' + published.code + '/close', {});
  assert.equal((await anonymous(path)).round.status, 'closed');
  assert.equal((await recovery(path + '/answer', { index: 2, choice: null })).player.completed, true);
  assert.equal((await client(env)(path + '/join', { nickname: 'Ny spiller' }, 409)).code, 'round_closed');
  assert.equal((await admin('/api/admin/quizzes', { title: 'Cross-site', questions }, 403, 'POST', 'https://foreign.example')).code, 'foreign_origin');
});

test('honors a scheduled window, withholds feedback and rankings, and records timeouts once', async t => {
  const env = fixture(t);
  const admin = client(env);
  const one = client(env);
  let time = Date.parse('2026-11-15T08:58:00Z');
  t.mock.method(Date, 'now', () => time);

  await admin('/api/admin/session', { setup, password });
  const quiz = await admin('/api/admin/quizzes', { title: 'Frister', questions }, 201);
  const round = await admin('/api/admin/rounds', {
    quizId: quiz.id, revision: 1, opensAt: '2026-11-15T10:00', closesAt: '2026-11-15T10:05',
    feedbackMode: 'after_close', boardMode: 'after_close',
  }, 201);
  const path = '/api/play/' + round.code;
  assert.equal((await one(path)).round.status, 'scheduled');
  await one(path + '/join', { nickname: 'Nora' }, 409);
  time = Date.parse('2026-11-15T09:00:00Z');
  await one(path + '/join', { nickname: 'Nora' }, 201);
  const started = await one(path + '/next', { index: 0 });
  await one(path + '/answer', { index: 0, choice: null, timeout: true }, 409);
  const same = await one(path + '/next', { index: 0 });
  assert.equal(same.question.deadline, started.question.deadline);
  time = started.question.deadline;
  const late = await one(path + '/answer', { index: 0, choice: started.question.options.indexOf('Blå') });
  assert.equal(late.answer.outcome, 'timeout');
  assert.equal(late.answer.points, undefined);
  assert.equal(late.answer.correctIndex, undefined);

  const second = await one(path + '/next', { index: 1 });
  const answer = await one(path + '/answer', { index: 1, choice: second.question.options.indexOf('Kyst') });
  assert.equal(answer.answer.outcome, 'submitted');
  assert.equal(answer.player.correct, undefined);
  assert.equal(answer.answer.explanation, undefined);
  await one(path + '/board', undefined, 403);
  await one(path + '/review', undefined, 403);
  time = Date.parse('2026-11-15T09:04:59Z');
  const last = await one(path + '/next', { index: 2 });
  assert.equal(last.question.deadline, Date.parse('2026-11-15T09:05:00Z'));
  time++;
  await admin('/api/admin/rounds/' + round.code + '/close', {});
  await one(path + '/answer', { index: 2, choice: last.question.options.indexOf('Fem') }, 409);
  const review = await one(path + '/review');
  assert.equal(review.answers.length, 2);
  assert.equal(review.answers[0].points, 0);
  assert.equal(review.answers[1].explanation, 'Forklaring 2');
  assert.equal((await one(path + '/board')).entries.length, 0);
});

test('parallel submits settle to one answer and one ranking entry', async t => {
  const env = fixture(t);
  const admin = client(env);
  const player = client(env);
  await admin('/api/admin/session', { setup, password });
  const quiz = await admin('/api/admin/quizzes', { title: 'Samtidig', questions: [questions[0]] }, 201);
  const round = await admin('/api/admin/rounds', { quizId: quiz.id, revision: 1, feedbackMode: 'immediate', boardMode: 'always' }, 201);
  const path = '/api/play/' + round.code;
  await player(path + '/join', { nickname: 'Parallell' }, 201);
  const started = await player(path + '/next', { index: 0 });
  const choice = started.question.options.indexOf('Blå');
  const answers = await Promise.all([
    player(path + '/answer', { index: 0, choice }),
    player(path + '/answer', { index: 0, choice: null }),
  ]);
  assert.deepEqual(answers[0].answer, answers[1].answer);
  assert.equal((await player(path + '/board')).entries.length, 1);
  assert.equal((await player(path + '/review')).answers.length, 1);
});

test('holds and ranks 1,500 independent completed attempts in one database round', async t => {
  const env = fixture(t);
  const admin = client(env);
  await admin('/api/admin/session', { setup, password });
  const quiz = await admin('/api/admin/quizzes', { title: 'Kapasitet', questions: [questions[0]] }, 201);
  const round = await admin('/api/admin/rounds', { quizId: quiz.id, revision: 1, feedbackMode: 'immediate', boardMode: 'always' }, 201);
  const path = '/api/play/' + round.code;
  for (let offset = 0; offset < 1500; offset += 25) {
    await Promise.all(Array.from({ length: 25 }, async (_, index) => {
      const player = client(env);
      await player(path + '/join', { nickname: 'Spiller ' + (offset + index) }, 201);
      const state = await player(path + '/next', { index: 0 });
      await player(path + '/answer', { index: 0, choice: state.question.options.indexOf('Blå') });
    }));
  }
  const { entries } = await admin('/api/admin/rounds/' + round.code);
  assert.equal(entries.length, 1500);
  assert.equal(new Set(entries.map(entry => entry.nickname)).size, 1500);
  assert.ok(entries.every(entry => entry.correct === 1));
});

test('QR invitations stay stable as eight-digit codes rotate and reject guesses', async t => {
  const env = fixture(t);
  const admin = client(env);
  const visitor = client(env);
  let now = Date.parse('2026-11-15T08:00:00Z');
  t.mock.method(Date, 'now', () => now);

  assert.match(await visitor('/bli-med'), /Åttesifret|åttesifrede/);
  await admin('/api/admin/session', { setup, password });
  const quiz = await admin('/api/admin/quizzes', { title: 'Invitasjoner', questions }, 201);
  const settings = { quizId: quiz.id, revision: quiz.revision, feedbackMode: 'immediate', boardMode: 'always' };
  const initial = await admin('/api/admin/rounds', settings, 201);
  const other = await admin('/api/admin/rounds', settings, 201);
  const future = await admin('/api/admin/rounds', { ...settings, opensAt: '2026-11-15T10:00' }, 201);
  const roundPath = '/api/admin/rounds/' + initial.code;
  const pinPath = roundPath + '/join-code';
  await visitor(pinPath, undefined, 401);
  const before = await admin(pinPath);
  assert.match(before.code, /^\d{8}$/);
  assert.equal(before.expiresAt, now + 120_000);
  assert.equal((await admin(pinPath)).code, before.code);
  assert.equal((await admin('/api/admin/rounds/' + future.code + '/join-code')).code, null);
  const otherCode = (await admin('/api/admin/rounds/' + other.code + '/join-code')).code;
  assert.notEqual(otherCode, before.code);

  const qr = await admin(roundPath + '/qr');
  assert.match(qr, /<svg[^>]*>/);
  assert.equal(await admin(roundPath + '/qr?download=1'), qr);
  assert.equal((await visitor('/api/join', { code: before.code })).path, '/spill/' + initial.code);
  now = before.expiresAt - 1;
  assert.equal((await visitor('/api/join', { code: before.code })).path, '/spill/' + initial.code);
  now++;
  assert.equal((await visitor('/api/join', { code: before.code }, 404)).code, 'code_missing');
  const next = await admin(pinPath);
  assert.notEqual(next.code, before.code);
  assert.equal(await admin(roundPath + '/qr'), qr);

  for (let attempt = 0; attempt < 18; attempt++) {
    await visitor('/api/join', { code: before.code }, 404);
  }
  await visitor('/api/join', { code: before.code }, 429);
  assert.equal((await visitor('/api/join', { code: next.code }, 429)).code, 'code_limit');
  now = next.expiresAt;
  const latest = await admin(pinPath);
  assert.equal((await visitor('/api/join', { code: latest.code })).path, '/spill/' + initial.code);
  await admin(roundPath + '/close', {});
  assert.equal((await admin(pinPath)).code, null);
  await visitor('/api/join', { code: latest.code }, 404);
});
