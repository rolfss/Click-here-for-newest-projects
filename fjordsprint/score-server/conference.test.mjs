import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { RUN_BOARD, scoreStages } from '../dist/run-scoring.js';
import { CONFERENCE_BOARD, conferenceWindow } from './conference.mjs';
import worker, { Leaderboard } from './worker.mjs';

const pages = 'https://rolfss.github.io';
const token = 'test-manager-token-never-used-in-production';
const sessions = '/conference/sessions';
const scores = '/conference/scores';
const admin = '/conference/admin';
const date = value => Date.parse(value);

function namespace(env, clock, seed) {
  let alarm = null;
  const db = new DatabaseSync(':memory:');
  seed?.(db);
  const storage = {
    sql: { exec(query, ...params) { return db.prepare(query).all(...params); } },
    transactionSync(callback) {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async setAlarm(value) { alarm = value; },
    async deleteAlarm() { alarm = null; }
  };
  return { db, app: new Leaderboard({ storage }, env, clock), alarm: () => alarm };
}

function fixture(start = '2026-11-12T08:00:00Z', managerToken = token, seedFullRun) {
  let now = date(start);
  const env = { ALLOWED_ORIGINS: pages, CONFERENCE_MANAGER_TOKEN: managerToken };
  const legacy = namespace(env, () => now);
  const fullRun = namespace(env, () => now, seedFullRun);
  env.LEADERBOARD = {
    idFromName: name => name,
    get(name) { return (name === RUN_BOARD ? fullRun : legacy).app; }
  };
  const call = (path, { method = 'GET', body, origin = pages, authorization } = {}) => {
    const headers = new Headers({ 'CF-Connecting-IP': '192.0.2.1' });
    if (origin) headers.set('Origin', origin);
    if (authorization) headers.set('Authorization', authorization);
    if (body) headers.set('Content-Type', 'application/json');
    return worker.fetch(new Request('https://scores.example' + path, {
      method, headers, body: body && JSON.stringify(body)
    }), env);
  };
  const post = (path, body) => call(path, { method: 'POST', body });
  return {
    ...legacy, fullRun, call, post,
    now: () => now,
    advance: ms => { now += ms; },
    start: (nickname, username, board = CONFERENCE_BOARD) => post(sessions, { board, nickname, username }),
    finish: (ticket, score, timeMs) => post(scores, { ticket, score, timeMs }),
    viewWinner: (day = '') => call(admin + (day && '?day=' + day), { authorization: 'Bearer ' + token })
  };
}

async function ticket(f, nickname, username) {
  const response = await f.start(nickname, username);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(Object.keys(data).sort(), ['expiresAt', 'ticket']);
  return data.ticket;
}

async function result(f, nickname, username, score, timeMs) {
  const id = await ticket(f, nickname, username);
  f.advance(40000);
  const response = await f.finish(id, score, timeMs);
  assert.equal(response.status, 200);
  return response.json();
}

test('the contest day changes exactly at 08:00 Oslo including both DST transitions', () => {
  for (const [instant, day, reset] of [
    ['2026-11-12T06:59:59.999Z', '2026-11-11', '2026-11-12T07:00:00Z'],
    ['2026-11-12T07:00:00Z', '2026-11-12', '2026-11-13T07:00:00Z'],
    ['2026-03-28T07:00:00Z', '2026-03-28', '2026-03-29T06:00:00Z'],
    ['2026-03-29T05:59:59.999Z', '2026-03-28', '2026-03-29T06:00:00Z'],
    ['2026-03-29T06:00:00Z', '2026-03-29', '2026-03-30T06:00:00Z'],
    ['2026-10-24T06:00:00Z', '2026-10-24', '2026-10-25T07:00:00Z'],
    ['2026-10-25T06:59:59.999Z', '2026-10-24', '2026-10-25T07:00:00Z'],
    ['2026-10-25T07:00:00Z', '2026-10-25', '2026-10-26T07:00:00Z']
  ]) assert.deepEqual(conferenceWindow(date(instant)), { day, resetsAt: date(reset) });
});

test('one shared board ranks best results per username, then by points and time', async () => {
  const f = fixture();
  assert.deepEqual((await result(f, 'Fjellreven', 'Kari.N', 6000, 53000)).score, {
    nickname: 'Fjellreven', score: 6000, timeMs: 53000
  });
  await result(f, 'Fjellreven', 'Ola_N', 6500, 49000);
  await result(f, 'Iskanten', 'Tore-N', 6500, 48000);
  await result(f, 'Nytt navn', 'kari.n', 6500, 47000);
  await result(f, 'Senere forsøk', 'KARI.N', 6499, 32000);
  const response = await f.call(scores, { origin: null });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    day: '2026-11-12', resetsAt: date('2026-11-13T07:00:00Z'),
    scores: [
      { rank: 1, nickname: 'Nytt navn', score: 6500, timeMs: 47000 },
      { rank: 2, nickname: 'Iskanten', score: 6500, timeMs: 48000 },
      { rank: 3, nickname: 'Fjellreven', score: 6500, timeMs: 49000 }
    ]
  });
  assert.equal((await (await f.viewWinner()).json()).winner.username, 'kari.n');
});

test('reset removes previous public rows and preserves just the previous winner privately', async () => {
  const f = fixture('2026-11-12T06:57:00Z');
  await result(f, 'Vinner', 'Work.User', 7500, 50000);
  await result(f, 'Andreplass', 'Work.User2', 6300, 49000);
  const crossingTicket = await ticket(f, 'Ny vinner', 'Work.User3');
  f.advance(100000);
  await f.app.alarm();
  assert.deepEqual((await (await f.call(scores)).json()).scores, []);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM conference_bests').get().count, 0);
  assert.deepEqual(await (await f.viewWinner('2026-11-11')).json(), {
    day: '2026-11-11', resetsAt: date('2026-11-12T07:00:00Z'),
    winner: { rank: 1, nickname: 'Vinner', username: 'Work.User', score: 7500, timeMs: 50000 }
  });
  assert.equal((await (await f.viewWinner()).json()).winner, null);
  assert.equal((await (await f.finish(crossingTicket, 6600, 52000)).json()).day, '2026-11-12');
  assert.equal((await (await f.viewWinner()).json()).winner.username, 'Work.User3');
  assert.ok(f.alarm() > f.now());
});

test('concurrent duplicate submission stays idempotent across reset and cannot change the result', async () => {
  const f = fixture('2026-11-12T06:58:50Z');
  const id = await ticket(f, 'Vestland', 'work-user');
  f.advance(40000);
  const responses = await Promise.all([f.finish(id, 5555, 41000), f.finish(id, 5555, 41000)]);
  assert.ok(responses.every(response => response.status === 200));
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(bodies.filter(value => value.duplicate).length, 1);
  assert.deepEqual(bodies[0].score, bodies[1].score);
  f.advance(30000);
  const retry = await (await f.finish(id, 5555, 41000)).json();
  assert.deepEqual(retry, {
    day: '2026-11-11', score: { nickname: 'Vestland', score: 5555, timeMs: 41000 }, duplicate: true
  });
  assert.deepEqual((await (await f.call(scores)).json()).scores, []);
  assert.equal((await f.finish(id, 5556, 41000)).status, 409);
  assert.equal(f.db.prepare('SELECT username FROM conference_tickets WHERE id = ?').get(id).username, null);
});

test('rejects full email, malformed username, non-event class, expired ticket and invalid result', async () => {
  const f = fixture();
  for (const username of ['', 'work@example.org', ' kari', 'kari\n', 'kari.', 'r'.repeat(65)]) {
    assert.equal((await f.start('Fjellreven', username)).status, 400, JSON.stringify(username));
  }
  assert.equal((await f.start('Fjellreven', 'kari', 'fjord-time32touch-assist')).status, 400);
  const id = await ticket(f, 'Fjellreven', 'kari.n');
  assert.equal((await f.finish(id, 5000, 40000)).status, 400);
  f.advance(40000);
  for (const [score, timeMs] of [[-1, 40000], [14000, 40000], [5000, 200], [5000, 1800001]]) {
    assert.equal((await f.finish(id, score, timeMs)).status, 400);
  }
  f.advance(1800000);
  assert.equal((await f.finish(id, 5000, 40000)).status, 400);
});

test('manager lookup requires the secret, rejects invalid dates and returns narrowly allowed CORS', async () => {
  const f = fixture();
  await result(f, 'Racer', 'Kari.N', 3000, 41000);
  assert.equal((await f.call(admin)).status, 401);
  assert.equal((await f.call(admin + '?token=' + token)).status, 401);
  assert.equal((await f.call(admin, { authorization: 'Bearer ' + token + '-wrong' })).status, 401);
  assert.equal((await f.call(admin, { authorization: 'Bearer ' + token, origin: 'https://other.example' })).status, 403);
  assert.equal((await f.viewWinner('2026-02-30')).status, 400);
  const allowed = await f.call(admin, { method: 'OPTIONS' });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'), 'Authorization');
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), pages);
  const privateResult = await f.call(admin, { origin: null, authorization: 'Bearer ' + token });
  assert.equal(privateResult.headers.get('Cache-Control'), 'no-store');
  assert.equal((await privateResult.json()).winner.username, 'Kari.N');
  assert.equal((await fixture(undefined, '').viewWinner()).status, 503);
});

const fullRunPath = path => path + '?board=' + RUN_BOARD;
const stageTelemetry = [
  { stage: 'fjord', timeMs: 65000, crashes: 0, bumps: 0, correct: 2, cleared: 5, lineQuality: 942, boostDistanceM: 420 },
  { stage: 'pass', timeMs: 79000, crashes: 2, bumps: 1, correct: 4, cleared: 7, lineQuality: 876, boostDistanceM: 350 },
  { stage: 'aurora', timeMs: 89000, crashes: 1, bumps: 2, correct: 5, cleared: 8, lineQuality: 898, boostDistanceM: 440 }
];

async function fullRunTicket(f, nickname = 'Fjellreven') {
  const response = await f.post(fullRunPath(sessions), { board: RUN_BOARD, nickname, username: 'Kari.N' });
  assert.equal(response.status, 200);
  return (await response.json()).ticket;
}

test('three-stage receipt preserves the exact earned score for each run and ranks the best run', async () => {
  const f = fixture('2026-11-12T06:00:00Z');
  await result(f, 'Fjellreven', 'Kari.N', 6000, 53000);
  const first = await fullRunTicket(f, 'Fjordracer');
  f.advance(300000);
  const expected = { nickname: 'Fjordracer', ...scoreStages(stageTelemetry) };
  const firstResult = await f.post(fullRunPath(scores), {
    ticket: first, stages: stageTelemetry, score: 999999, timeMs: 0
  });
  assert.equal(firstResult.status, 200);
  assert.deepEqual(await firstResult.json(), { day: '2026-11-11', score: expected });

  const second = await fullRunTicket(f, 'Fjellracer');
  f.advance(300000);
  const cleaner = stageTelemetry.map(stage => ({ ...stage, crashes: 0, bumps: 0 }));
  const best = { nickname: 'Fjellracer', ...scoreStages(cleaner) };
  const secondResult = await f.post(fullRunPath(scores), { ticket: second, stages: cleaner });
  assert.equal(secondResult.status, 200);
  assert.deepEqual((await secondResult.json()).score, best);
  assert.equal(f.fullRun.db.prepare('SELECT COUNT(*) AS n FROM conference_run_receipts').get().n, 2);
  const board = await f.call(fullRunPath(scores), { origin: null });
  assert.deepEqual((await board.json()).scores, [
    { rank: 1, nickname: best.nickname, score: best.score, timeMs: best.timeMs }
  ]);
  assert.deepEqual((await (await f.call(scores)).json()).scores, [
    { rank: 1, nickname: 'Fjellreven', score: 6000, timeMs: 53000 }
  ]);

  f.advance(30 * 60000);
  const duplicate = await f.post(fullRunPath(scores), { ticket: first, stages: stageTelemetry });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { day: '2026-11-11', score: expected, duplicate: true });
  const changed = await f.post(fullRunPath(scores), { ticket: first, stages: cleaner });
  assert.equal(changed.status, 409);

  f.advance(25 * 60000);
  await f.fullRun.app.alarm();
  assert.deepEqual((await (await f.call(fullRunPath(scores))).json()).scores, []);
  assert.equal(f.fullRun.db.prepare('SELECT COUNT(*) AS n FROM conference_run_receipts').get().n, 0);
  const winner = await f.call(fullRunPath(admin) + '&day=2026-11-11', { authorization: 'Bearer ' + token });
  assert.deepEqual((await winner.json()).winner,
    { rank: 1, nickname: best.nickname, username: 'Kari.N', score: best.score, timeMs: best.timeMs });
});

test('full-run tickets require three plausible ordered stages and enough elapsed time', async () => {
  const f = fixture();
  const id = await fullRunTicket(f);
  const finish = stages => f.post(fullRunPath(scores), { ticket: id, stages });
  assert.equal((await finish(stageTelemetry)).status, 400);
  f.advance(100000);
  assert.equal((await finish(stageTelemetry)).status, 400);
  f.advance(200000);
  for (const stages of [
    stageTelemetry.slice(0, 2),
    [stageTelemetry[1], stageTelemetry[0], stageTelemetry[2]],
    [{ ...stageTelemetry[0], correct: 6 }, ...stageTelemetry.slice(1)],
    [{ ...stageTelemetry[0], boostDistanceM: 5000 }, ...stageTelemetry.slice(1)],
    [{ ...stageTelemetry[0], lineQuality: 1001 }, ...stageTelemetry.slice(1)]
  ]) assert.equal((await finish(stages)).status, 400);
  assert.equal((await f.post(scores, { ticket: id, score: 5000, timeMs: 65000 })).status, 400);
  assert.equal((await finish(stageTelemetry)).status, 200);
});

const singleStageRuleset = 'fjord-stage-v1';
const perfectStages = [
  { stage: 'fjord', timeMs: 53000, crashes: 0, bumps: 0, correct: 5, cleared: 12, lineQuality: 1000, boostDistanceM: 450 },
  { stage: 'pass', timeMs: 72000, crashes: 0, bumps: 0, correct: 6, cleared: 12, lineQuality: 1000, boostDistanceM: 500 },
  { stage: 'aurora', timeMs: 78000, crashes: 0, bumps: 0, correct: 7, cleared: 12, lineQuality: 1000, boostDistanceM: 550 }
];
const singleStageAt = timeMs => [{ ...perfectStages[0], timeMs }];

async function singleStageTicket(f, nickname, username) {
  const response = await f.post(fullRunPath(sessions), { board: RUN_BOARD, nickname, username, ruleset: singleStageRuleset });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ruleset, singleStageRuleset);
  assert.equal(typeof data.ticket, 'string');
  return data.ticket;
}

test('one stage earns up to 30150 on the same board and displays the actual time', async () => {
  const f = fixture();
  const old = await fullRunTicket(f, 'Tre etapper');
  f.advance(160000);
  const oldResult = await f.post(fullRunPath(scores), { ticket: old, stages: [
    { ...perfectStages[0], timeMs: 39000 }, { ...perfectStages[1], timeMs: 59000 }, { ...perfectStages[2], timeMs: 62000 }
  ] });
  assert.equal(oldResult.status, 200);
  assert.equal((await oldResult.json()).score.score, 30150);

  const oneStage = await singleStageTicket(f, 'Én etappe', 'Ola.N');
  f.advance(53000);
  const payload = { ticket: oneStage, stages: singleStageAt(53000), score: 1, timeMs: 0 };
  const finish = () => f.post(fullRunPath(scores), payload);
  const response = await finish();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.score.score, 30150);
  assert.equal(result.score.timeMs, 53000);
  assert.equal(result.score.stages.length, 1);
  assert.equal(f.fullRun.db.prepare('SELECT rankingTimeMs FROM conference_bests WHERE ticket = ?').get(oneStage).rankingTimeMs, 203000);
  const duplicate = await finish();
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { ...result, duplicate: true });
  assert.equal((await f.post(fullRunPath(scores), { ...payload, stages: singleStageAt(52000) })).status, 409);

  const tiedSameIdentity = await singleStageTicket(f, 'Dårligere tid', 'KARI.N');
  f.advance(50000);
  assert.equal((await f.post(fullRunPath(scores), { ticket: tiedSameIdentity, stages: singleStageAt(50000) })).status, 200);
  const faster = await singleStageTicket(f, 'Raskere tid', 'Tore.N');
  f.advance(35000);
  assert.equal((await f.post(fullRunPath(scores), { ticket: faster, stages: singleStageAt(35000) })).status, 200);

  const board = await (await f.call(fullRunPath(scores))).json();
  assert.ok(board.supportedRulesets.includes(singleStageRuleset));
  assert.deepEqual(board.scores, [
    { rank: 1, nickname: 'Raskere tid', score: 30150, timeMs: 35000 },
    { rank: 2, nickname: 'Tre etapper', score: 30150, timeMs: 160000 },
    { rank: 3, nickname: 'Én etappe', score: 30150, timeMs: 53000 }
  ]);
  const winner = await f.call(fullRunPath(admin), { authorization: 'Bearer ' + token });
  assert.equal((await winner.json()).winner.timeMs, 35000);
});

test('one-stage tickets require Fjordlinjen telemetry and cannot change format', async () => {
  const f = fixture();
  assert.equal((await f.post(fullRunPath(sessions), {
    board: RUN_BOARD, nickname: 'Fjordreven', username: 'Kari.N', ruleset: 'future-format'
  })).status, 400);
  assert.equal((await f.post(sessions, {
    board: CONFERENCE_BOARD, nickname: 'Fjordreven', username: 'Kari.N', ruleset: singleStageRuleset
  })).status, 400);
  const id = await singleStageTicket(f, 'Fjordreven', 'Kari.N');
  const finish = stages => f.post(fullRunPath(scores), { ticket: id, stages });
  f.advance(23999);
  assert.equal((await finish(singleStageAt(24000))).status, 400);
  f.advance(1);
  assert.equal((await finish(singleStageAt(26001))).status, 400);
  f.advance(30000);
  for (const stages of [
    [], [perfectStages[1]], perfectStages.slice(0, 2), perfectStages, singleStageAt(23999),
    [{ ...perfectStages[0], correct: 6 }],
    [{ ...perfectStages[0], lineQuality: 1001 }],
    [{ ...perfectStages[0], boostDistanceM: 3501 }],
    [{ ...perfectStages[0], bumps: 1 }]
  ]) assert.equal((await finish(stages)).status, 400);
  assert.equal((await f.post(scores, { ticket: id, score: 5000, timeMs: 53000 })).status, 400);
  assert.equal((await finish(singleStageAt(53000))).status, 200);
});

test('existing three-stage results and a pre-deployment ticket survive the one-stage rollout', async () => {
  const oldTicket = '11111111-1111-4111-8111-111111111111';
  const originalTime = date('2026-11-12T08:00:00Z');
  const f = fixture(undefined, token, db => {
    db.exec(`CREATE TABLE conference_tickets (
      id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT,
      issuedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL,
      day TEXT, score INTEGER, timeMs INTEGER
    ); CREATE TABLE conference_bests (
      day TEXT NOT NULL, usernameKey TEXT NOT NULL, username TEXT NOT NULL, nickname TEXT NOT NULL,
      score INTEGER NOT NULL, timeMs INTEGER NOT NULL, finishedAt INTEGER NOT NULL, ticket TEXT NOT NULL,
      PRIMARY KEY (day, usernameKey)
    ); CREATE INDEX conference_best_order ON conference_bests(day, score DESC, timeMs ASC, finishedAt ASC, ticket ASC);`);
    db.prepare('INSERT INTO conference_tickets(id, nickname, username, issuedAt, expiresAt) VALUES (?,?,?,?,?)')
      .run(oldTicket, 'Fra før oppdatering', 'Old.Run', originalTime, originalTime + 1800000);
    db.prepare('INSERT INTO conference_bests VALUES (?,?,?,?,?,?,?,?)')
      .run('2026-11-12', 'old.best', 'Old.Best', 'Eksisterende leder', 30150, 202999, originalTime, 'older-best');
  });
  f.advance(203000);
  const invalid = await f.post(fullRunPath(scores), { ticket: oldTicket, stages: singleStageAt(34000) });
  assert.equal(invalid.status, 400);
  const accepted = await f.post(fullRunPath(scores), { ticket: oldTicket, stages: perfectStages });
  assert.equal(accepted.status, 200);
  assert.deepEqual((await accepted.json()).score, { nickname: 'Fra før oppdatering', ...scoreStages(perfectStages) });

  const newTicket = await singleStageTicket(f, 'Ny runde', 'New.Run');
  f.advance(53000);
  assert.equal((await f.post(fullRunPath(scores), { ticket: newTicket, stages: singleStageAt(53000) })).status, 200);
  assert.deepEqual((await (await f.call(fullRunPath(scores))).json()).scores, [
    { rank: 1, nickname: 'Eksisterende leder', score: 30150, timeMs: 202999 },
    { rank: 2, nickname: 'Fra før oppdatering', score: 30150, timeMs: 203000 },
    { rank: 3, nickname: 'Ny runde', score: 30150, timeMs: 53000 }
  ]);
});
