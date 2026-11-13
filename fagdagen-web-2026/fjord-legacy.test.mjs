import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLegacyFjordFeed, mergeFjordScores } from './fjord-legacy.mjs';

const day = '2026-11-13';
const sample = [
  { rank: 1, nickname: 'Fjellrev', score: 20_000, timeMs: 185_000 },
  { rank: 2, nickname: 'Rask 1', score: 20_000, timeMs: 190_000 },
];

test('public upstream fetch coalesces concurrent reads and persists only safe fields', async () => {
  let now = 500_000;
  let calls = 0;
  const cache = new Map();
  const storage = { get: async key => cache.get(key), put: async (key, value) => cache.set(key, value) };
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, 'https://fjordsprint-scores.rolfsselas.workers.dev/conference/scores?board=fjordsprint-three-stage-v1');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ day, scores: sample.map(row => ({ ...row, username: 'private', ticket: 'private' })) });
  };
  const feed = createLegacyFjordFeed({ storage, fetcher, clock: () => now });
  assert.deepEqual(await Promise.all([feed.read(day), feed.read(day), feed.read(day)]), [sample, sample, sample]);
  assert.equal(calls, 1);
  assert.deepEqual([...cache.values()], [{ day, rows: sample }]);
  now += 24_999;
  assert.deepEqual(await feed.read(day), sample);
  assert.equal(calls, 1);
  now++;
  assert.deepEqual(await feed.read(day), sample);
  assert.equal(calls, 2);
});

test('same-day storage survives outages and wrong-day responses without leaking into the next day', async () => {
  let now = 500_000;
  let value = { day, rows: sample };
  let next = () => { throw new Error('upstream down'); };
  const storage = { get: async () => value, put: async (key, row) => { value = row; } };
  const feed = createLegacyFjordFeed({ storage, fetcher: async () => next(), clock: () => now });
  assert.deepEqual(await feed.read(day), sample);
  now += 30_000;
  next = () => Response.json({ day: '2026-11-14', scores: [] });
  assert.deepEqual(await feed.read(day), sample);
  assert.deepEqual(value, { day, rows: sample });
  now += 30_000;
  next = () => Response.json({ day, scores: [] });
  assert.deepEqual(await feed.read(day), sample);
  assert.deepEqual(value, { day, rows: sample });
  next = () => Response.json({ day, scores: sample });
  assert.deepEqual(await feed.read('2026-11-14'), []);
  assert.deepEqual(value, { day, rows: sample });
  now += 30_000;
  next = () => Response.json({ day: '2026-11-14', scores: [] });
  assert.deepEqual(await feed.read('2026-11-14'), []);
  assert.deepEqual(value, { day, rows: sample });
  assert.deepEqual(await feed.read(day, { refreshCurrent: false }), sample);
  assert.deepEqual(feed.days(), [day]);
});

test('normalizes new times only for ranking, retains duplicate names, and keeps old ordering on exact ties', () => {
  const scores = [
    { rank: 1, nickname: 'Fjellrev', score: 20_000, timeMs: 49_000, rankingTimeMs: 187_679, username: 'private' },
    { rank: 2, nickname: 'Samme tid', score: 20_000, timeMs: 50_000, rankingTimeMs: 190_000 },
    { rank: 3, nickname: 'Mer poeng', score: 21_000, timeMs: 65_000, rankingTimeMs: 250_000 },
  ];
  assert.deepEqual(mergeFjordScores({ day, resetsAt: 42, scores }, sample), {
    day, resetsAt: 42,
    scores: [
      { rank: 1, nickname: 'Mer poeng', score: 21_000, timeMs: 65_000 },
      { rank: 2, nickname: 'Fjellrev', score: 20_000, timeMs: 185_000 },
      { rank: 3, nickname: 'Fjellrev', score: 20_000, timeMs: 49_000 },
      { rank: 4, nickname: 'Rask 1', score: 20_000, timeMs: 190_000 },
      { rank: 5, nickname: 'Samme tid', score: 20_000, timeMs: 50_000 },
    ],
  });
  assert.equal(mergeFjordScores({ day, scores }, sample, { limit: 2 }).scores.length, 2);
});

test('the merged board keeps rows beyond the original public feed limit', () => {
  const scores = Array.from({ length: 75 }, (_, index) => ({
    rank: index + 1, nickname: `Fører ${index + 1}`, score: 18_000 - index, timeMs: 55_000,
  }));
  const result = mergeFjordScores({ day, scores }, sample);
  assert.equal(result.scores.length, 77);
  assert.equal(result.scores.at(-1).nickname, 'Fører 75');
});
