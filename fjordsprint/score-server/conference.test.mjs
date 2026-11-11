import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { CONFERENCE_BOARD, conferenceWindow } from './conference.mjs';
import worker, { Leaderboard } from './worker.mjs';

const pages = 'https://rolfss.github.io';
const token = 'test-manager-token-never-used-in-production';
const sessions = '/conference/sessions';
const scores = '/conference/scores';
const admin = '/conference/admin';
const date = value => Date.parse(value);

function fixture(start = '2026-11-12T08:00:00Z', managerToken = token) {
  let now = date(start);
  let alarm = null;
  const db = new DatabaseSync(':memory:');
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
  const env = { ALLOWED_ORIGINS: pages, CONFERENCE_MANAGER_TOKEN: managerToken };
  const app = new Leaderboard({ storage }, env, () => now);
  env.LEADERBOARD = { idFromName: name => name, get: () => app };
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
    db, call, post, app,
    now: () => now,
    advance: ms => { now += ms; },
    alarm: () => alarm,
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
