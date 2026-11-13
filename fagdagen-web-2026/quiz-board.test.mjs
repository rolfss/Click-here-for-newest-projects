import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { initializeQuizStorage, quizFetch, quizPeriod } from './quiz-engine.mjs';

test('the kiosk receives all quiz scores, including updated personal bests, without changing player pagination', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE quiz_daily_counts (
    scope TEXT PRIMARY KEY NOT NULL, players INTEGER NOT NULL, scored INTEGER NOT NULL
  )`);
  const storage = {
    sql: { exec: (statement, ...values) => {
      const rows = sqlite.prepare(statement).all(...values);
      return { toArray: () => rows };
    } },
    transactionSync(callback) {
      sqlite.exec('BEGIN');
      try { callback(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  initializeQuizStorage(storage);
  initializeQuizStorage(storage);
  let boardQueries = 0;
  const DB = { prepare: statement => ({ bind: (...values) => ({
    first: () => sqlite.prepare(statement).get(...values),
    all: () => {
      boardQueries++;
      return { results: sqlite.prepare(statement).all(...values) };
    },
  }) }) };
  const live = quizPeriod(Date.now(), false).scope;
  const practice = quizPeriod(Date.now(), true).scope;
  const enroll = sqlite.prepare('INSERT INTO quiz_players (scope, player_key) VALUES (?, ?)');
  const best = sqlite.prepare(`UPDATE quiz_players SET best_token_hash = ?, name = ?, contact = 'private',
    correct = ?, time_ms = ?, finished_at = 1 WHERE scope = ? AND player_key = ?`);
  function finish(scope, id, name, correct, elapsed) {
    enroll.run(scope, id);
    best.run(id, name, correct, elapsed, scope, id);
  }
  for (let index = 0; index < 1500; index++) {
    finish(live, `user${index}`, `Deltaker ${index}`, 9, 10_000 + index);
  }
  finish(practice, 'practice', 'Prøvespiller', 3, 4000);
  const bank = { time_limit_seconds: 20, questions: Array.from({ length: 10 }, (_, i) => ({ number: i + 1 })) };
  async function standings(query) {
    const response = await quizFetch(new Request(`https://example.test/api/quiz/leaderboard${query}`), { DB }, bank);
    assert.equal(response.status, 200);
    return response.json();
  }
  const complete = await standings('?all=1');
  assert.equal(complete.rows.length, 1500);
  assert.equal(complete.total, 1500);
  assert.equal(complete.nextOffset, null);
  assert.equal(complete.rows.at(-1).rank, 1500);
  assert.deepEqual(Object.keys(complete.rows[0]).sort(), ['entryId', 'name', 'rank', 'score', 'timeMs']);
  assert.deepEqual((await standings('?all=1')).rows, complete.rows);
  assert.equal(boardQueries, 1);
  const page = await standings('?offset=30');
  assert.equal(page.nextOffset, 60);
  assert.deepEqual(page.rows, complete.rows.slice(30, 60));
  assert.deepEqual((await standings('?test=1&all=1')).rows.map(row => row.name), ['Prøvespiller']);
  best.run('new-best', 'Ny leder', 10, 12_000, live, 'user1499');
  const updated = await standings('?all=1');
  assert.equal(updated.rows.length, 1500);
  assert.equal(updated.rows[0].name, 'Ny leder');
  assert.equal(updated.rows[0].entryId, complete.rows.at(-1).entryId);
  sqlite.close();
});
