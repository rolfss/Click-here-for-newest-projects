import { cleanName, scoreRun } from '../dist/rally-rules.js';
import {
  CONFERENCE_RULESET, CONFERENCE_STAGES, MINIMUM_CONFERENCE_TIME_MS, MINIMUM_RUN_TIME_MS,
  RUN_BOARD, RUN_STAGES, conferenceRankingTime, scoreConferenceRun, validStageTelemetry
} from '../dist/run-scoring.js';
import { InputError, json, smallJSON } from './http.mjs';

export const CONFERENCE_BOARD = 'fjord-archive32touch-assist';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TICKET_TTL = 30 * 60 * 1000;
const MINIMUM_RUN_MS = 26000;
const MAXIMUM_RUN_MS = 30 * 60 * 1000;
const FJORDLINJEN_PAR_SECONDS = 66;
const order = 'score DESC, COALESCE(rankingTimeMs, timeMs) ASC, finishedAt ASC, ticket ASC';
const ticketPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const managerTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
const oslo = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', hourCycle: 'h23'
});

function osloParts(time) {
  return Object.fromEntries(oslo.formatToParts(time).map(({ type, value }) => [type, Number(value)]));
}

function morning(calendarDate) {
  const atEightUTC = calendarDate + 8 * HOUR;
  // Oslo is one or two hours ahead of UTC, and its DST transitions precede 08:00.
  return atEightUTC - (osloParts(atEightUTC).hour - 8) * HOUR;
}

export function conferenceWindow(now) {
  const { year, month, day, hour } = osloParts(now);
  const calendarDate = Date.UTC(year, month - 1, day - (hour < 8 ? 1 : 0));
  return { day: new Date(calendarDate).toISOString().slice(0, 10), resetsAt: morning(calendarDate + DAY) };
}

function resetForDay(day) {
  const calendarDate = Date.parse(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(calendarDate) ||
      new Date(calendarDate).toISOString().slice(0, 10) !== day) {
    throw new InputError('Velg en gyldig dato.');
  }
  return morning(calendarDate + DAY);
}

function readShortUsername(username) {
  // Entra UPN prefix, without the tenant domain.
  if (typeof username !== 'string' || !/^[A-Za-z0-9'.!#^_~-]{1,64}$/.test(username) || username.endsWith('.')) {
    throw new InputError('Skriv det korte M365-brukernavnet nøyaktig, uten e-postdomene.');
  }
  return username;
}

function readNickname(nickname) {
  try {
    return cleanName(nickname);
  } catch (error) {
    throw new InputError(error.message);
  }
}

function publicResult({ nickname, score, timeMs }) {
  return { nickname, score, timeMs };
}

function maximumScore(timeMs) {
  // Fjordlinjen has three checkpoint questions, two encounters and twelve trolls.
  // Allow for rounding the client's elapsed seconds to the nearest millisecond.
  const perfect = { correct: 5, cleared: 12, fired: 1, hits: 1, bumps: 0, juice: 0 };
  return scoreRun(perfect, { time: (timeMs - 0.5) / 1000, crashes: 0 }, FJORDLINJEN_PAR_SECONDS).score;
}

function readRunStages(stages, ruleset) {
  const singleStage = ruleset === CONFERENCE_RULESET;
  const expected = singleStage ? CONFERENCE_STAGES : RUN_STAGES;
  if (!Array.isArray(stages) || stages.length !== expected.length ||
      !expected.every((stage, index) => validStageTelemetry(stages[index], stage))) {
    throw new InputError(singleStage ? 'Løpet mangler et gyldig resultat fra Fjordlinjen.' :
      'Løpet mangler gyldige resultater fra alle tre etappene.');
  }
  return stages.map(({ stage, timeMs, crashes, bumps, correct, cleared, lineQuality, boostDistanceM }) => ({
    stage, timeMs, crashes, bumps, correct, cleared, lineQuality, boostDistanceM
  }));
}

async function requireManager(request, expected) {
  if (typeof expected !== 'string' || !managerTokenPattern.test(expected)) {
    throw new InputError('Arrangørtilgang er ikke konfigurert.', 503);
  }
  const supplied = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/i)?.[1];
  if (!supplied) throw new InputError('Arrangørnøkkel kreves.', 401);

  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([supplied, expected].map(
    token => crypto.subtle.digest('SHA-256', encoder.encode(token))
  ));
  const actual = new Uint8Array(actualDigest);
  const wanted = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < wanted.length; index++) difference |= actual[index] ^ wanted[index];
  if (difference) throw new InputError('Ugyldig arrangørnøkkel.', 401);
}

export class ConferenceScores {
  constructor(storage, managerToken, clock, rateSession, { combineStandings, authorizeManager } = {}) {
    this.storage = storage;
    this.sql = storage.sql;
    this.clock = clock;
    this.rateSession = rateSession;
    this.combineStandings = combineStandings;
    this.authorizeManager = authorizeManager ?? (request => requireManager(request, managerToken));
    for (const statement of [
      `CREATE TABLE IF NOT EXISTS conference_tickets (
        id TEXT PRIMARY KEY, nickname TEXT NOT NULL, username TEXT,
        issuedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL,
        day TEXT, score INTEGER, timeMs INTEGER, ruleset TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS conference_ticket_expiry ON conference_tickets(expiresAt)',
      `CREATE TABLE IF NOT EXISTS conference_bests (
        day TEXT NOT NULL, usernameKey TEXT NOT NULL, username TEXT NOT NULL, nickname TEXT NOT NULL,
        score INTEGER NOT NULL, timeMs INTEGER NOT NULL, finishedAt INTEGER NOT NULL, ticket TEXT NOT NULL, rankingTimeMs INTEGER,
        PRIMARY KEY (day, usernameKey)
      )`,
      `CREATE TABLE IF NOT EXISTS conference_winners (
        day TEXT PRIMARY KEY, username TEXT NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, timeMs INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS conference_run_receipts (
        ticket TEXT PRIMARY KEY REFERENCES conference_tickets(id) ON DELETE CASCADE,
        telemetry TEXT NOT NULL, stages TEXT NOT NULL
      )`
    ]) this.sql.exec(statement);
    storage.transactionSync(() => {
      if (![...this.sql.exec('PRAGMA table_info(conference_tickets)')].some(column => column.name === 'ruleset')) {
        this.sql.exec('ALTER TABLE conference_tickets ADD COLUMN ruleset TEXT');
      }
      if (![...this.sql.exec('PRAGMA table_info(conference_bests)')].some(column => column.name === 'rankingTimeMs')) {
        this.sql.exec('ALTER TABLE conference_bests ADD COLUMN rankingTimeMs INTEGER');
      }
      this.sql.exec(`CREATE INDEX IF NOT EXISTS conference_best_mixed_order ON conference_bests(day, ${order})`);
    });
  }

  cleanup(now) {
    this.sql.exec('DELETE FROM conference_tickets WHERE expiresAt <= ?', now);
    this.sql.exec('DELETE FROM conference_bests WHERE day < ?', conferenceWindow(now).day);
  }

  nextCleanup(now) {
    const [ticket] = this.sql.exec('SELECT MIN(expiresAt) AS next FROM conference_tickets');
    const window = conferenceWindow(now);
    const [best] = this.sql.exec('SELECT 1 AS found FROM conference_bests WHERE day = ? LIMIT 1', window.day);
    const next = Math.min(ticket.next ?? Infinity, best ? window.resetsAt : Infinity);
    return Number.isFinite(next) ? next : null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const board = url.searchParams.get('board') ?? CONFERENCE_BOARD;
    if (board !== CONFERENCE_BOARD && board !== RUN_BOARD) throw new InputError('Feil løpsklasse.');
    if (request.method === 'GET' && url.pathname === '/conference/scores') {
      const now = this.clock();
      this.cleanup(now);
      const window = conferenceWindow(now);
      const rows = [...this.sql.exec(
        `SELECT nickname, score, timeMs, rankingTimeMs FROM conference_bests WHERE day = ? ORDER BY ${order} LIMIT 50`,
        window.day
      )];
      const scores = rows.map((row, index) => ({ rank: index + 1, ...publicResult(row) }));
      const standings = { ...window, scores,
        ...(board === RUN_BOARD ? { supportedRulesets: [CONFERENCE_RULESET] } : {}) };
      if (board === RUN_BOARD && this.combineStandings) {
        return json(await this.combineStandings({ ...standings, scores: scores.map((score, index) => ({
          ...score, rankingTimeMs: rows[index].rankingTimeMs,
        })) }));
      }
      return json(standings);
    }
    if (request.method === 'GET' && url.pathname === '/conference/admin') {
      await this.authorizeManager(request);
      const window = conferenceWindow(this.clock());
      const day = url.searchParams.get('day') ?? window.day;
      const resetsAt = resetForDay(day);
      const [row] = this.sql.exec('SELECT username, nickname, score, timeMs FROM conference_winners WHERE day = ?', day);
      const winner = row ? { rank: 1, ...publicResult(row), username: row.username } : null;
      return json({ day, resetsAt, winner });
    }
    if (request.method !== 'POST' || !['/conference/sessions', '/conference/scores'].includes(url.pathname)) {
      return json({ error: 'Ikke funnet.' }, 404);
    }
    const data = await smallJSON(request);
    if (url.pathname === '/conference/sessions') {
      if (data.board !== board) throw new InputError('Feil løpsklasse.');
      if (data.ruleset !== undefined && (board !== RUN_BOARD || data.ruleset !== CONFERENCE_RULESET)) {
        throw new InputError('Denne løpsversjonen støttes ikke. Last inn spillet på nytt.');
      }
      const nickname = readNickname(data.nickname);
      const username = readShortUsername(data.username);
      await this.rateSession(request, this.clock());
      return json(this.start(nickname, username, data.ruleset));
    }
    return json(this.finish(data, board));
  }

  start(nickname, username, ruleset = null) {
    const now = this.clock();
    this.cleanup(now);
    const [active] = this.sql.exec('SELECT COUNT(*) AS n FROM conference_tickets WHERE day IS NULL');
    if (active.n >= 20000) throw new InputError('Serveren er full. Prøv igjen senere.', 503);
    const ticket = crypto.randomUUID();
    const expiresAt = now + TICKET_TTL;
    this.sql.exec(
      'INSERT INTO conference_tickets(id, nickname, username, issuedAt, expiresAt, ruleset) VALUES(?,?,?,?,?,?)',
      ticket, nickname, username, now, expiresAt, ruleset
    );
    return ruleset ? { ticket, expiresAt, ruleset } : { ticket, expiresAt };
  }

  finish({ ticket, score, timeMs, stages }, board) {
    if (typeof ticket !== 'string' || !ticketPattern.test(ticket)) throw new InputError('Mangler løpsbillett.');
    const isFullRun = board === RUN_BOARD;
    const now = this.clock();
    this.cleanup(now);
    return this.storage.transactionSync(() => {
      const [run] = this.sql.exec('SELECT * FROM conference_tickets WHERE id = ?', ticket);
      if (!run) throw new InputError('Løpsbilletten har utløpt. Start et nytt løp.');
      const ruleset = isFullRun ? run.ruleset : null;
      let telemetry, earnedStages, maximumClockPenalty;
      if (isFullRun) {
        const stageTelemetry = readRunStages(stages, ruleset);
        telemetry = JSON.stringify(stageTelemetry);
        ({ score, timeMs, stages: earnedStages } = scoreConferenceRun(stageTelemetry, ruleset));
        maximumClockPenalty = stageTelemetry.reduce((total, stage) => total + stage.crashes * 3000, 0);
        if (timeMs > MAXIMUM_RUN_MS) throw new InputError('Ugyldig løpstid.');
      } else {
        if (!Number.isSafeInteger(timeMs) || timeMs < MINIMUM_RUN_MS || timeMs > MAXIMUM_RUN_MS) {
          throw new InputError('Ugyldig løpstid.');
        }
        if (!Number.isSafeInteger(score) || score < 0 || score > maximumScore(timeMs)) {
          throw new InputError('Ugyldig poengsum.');
        }
      }
      if (run.day) {
        if (isFullRun) {
          const [receipt] = this.sql.exec('SELECT telemetry, stages FROM conference_run_receipts WHERE ticket = ?', ticket);
          if (receipt?.telemetry !== telemetry) throw new InputError('Løpsbilletten er allerede brukt.', 409);
          return { day: run.day, score: { ...publicResult(run), stages: JSON.parse(receipt.stages) }, duplicate: true };
        }
        if (run.score !== score || run.timeMs !== timeMs) throw new InputError('Løpsbilletten er allerede brukt.', 409);
        return { day: run.day, score: publicResult(run), duplicate: true };
      }
      // In-game time can exceed wall time due to the recovery penalty.
      const wallTime = now - run.issuedAt;
      const minimum = ruleset === CONFERENCE_RULESET ? MINIMUM_CONFERENCE_TIME_MS :
        isFullRun ? MINIMUM_RUN_TIME_MS : MINIMUM_RUN_MS;
      if (wallTime < minimum) {
        throw new InputError('Løpet kan ikke være fullført så raskt.');
      }
      if (isFullRun && timeMs > wallTime + maximumClockPenalty + 2000) {
        throw new InputError('Tiden stemmer ikke med løpsbilletten.');
      }

      const { day, resetsAt } = conferenceWindow(now);
      const rankingTimeMs = conferenceRankingTime(timeMs, ruleset);
      this.sql.exec(`INSERT INTO conference_bests(day, usernameKey, username, nickname, score, timeMs, finishedAt, ticket, rankingTimeMs)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(day, usernameKey) DO UPDATE SET
          username = excluded.username, nickname = excluded.nickname, score = excluded.score,
          timeMs = excluded.timeMs, finishedAt = excluded.finishedAt, ticket = excluded.ticket, rankingTimeMs = excluded.rankingTimeMs
        WHERE excluded.score > conference_bests.score OR
          (excluded.score = conference_bests.score AND excluded.rankingTimeMs < COALESCE(conference_bests.rankingTimeMs, conference_bests.timeMs))`,
      day, run.username.toLowerCase(), run.username, run.nickname, score, timeMs, now, ticket, rankingTimeMs);

      // Materialize the current winner while scores are live so the 08:00 reset can discard the rest.
      this.sql.exec(`INSERT INTO conference_winners(day, username, nickname, score, timeMs)
        SELECT day, username, nickname, score, timeMs FROM conference_bests
        WHERE day = ? ORDER BY ${order} LIMIT 1
        ON CONFLICT(day) DO UPDATE SET username = excluded.username, nickname = excluded.nickname,
          score = excluded.score, timeMs = excluded.timeMs`, day);

      const result = publicResult({ nickname: run.nickname, score, timeMs });
      let expiresAt = now + TICKET_TTL;
      if (isFullRun) {
        this.sql.exec('INSERT INTO conference_run_receipts(ticket, telemetry, stages) VALUES(?,?,?)',
          ticket, telemetry, JSON.stringify(earnedStages));
        result.stages = earnedStages;
        expiresAt = Math.max(expiresAt, resetsAt);
      }
      this.sql.exec('UPDATE conference_tickets SET username = NULL, day = ?, score = ?, timeMs = ?, expiresAt = ? WHERE id = ?',
        day, score, timeMs, expiresAt, ticket);
      return { day, score: result };
    });
  }
}
