/** The same validation and 72-hour rule are used by browser and server. */
export const SCORE_TTL = 72 * 60 * 60 * 1000;
export const SCORE_KEY = 'fjordsprint-scores-v2';
export const BOARD_PATTERN = /^(fjord|pass|aurora)-(time|archive2-[0-3])-(assist|sport)$/;
export function cleanName(value) {
  if (typeof value !== 'string') throw new Error('Skriv et navn på 2–20 tegn.');
  const name = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if ([...name].length < 2 || [...name].length > 20 || !/^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(name)) {
    throw new Error('Bruk 2–20 tegn: bokstaver, tall, mellomrom, punktum, bindestrek eller understrek.');
  }
  return name;
}
export function validBoard(board) { return typeof board === 'string' && BOARD_PATTERN.test(board); }
export function validateResult(row, now = Date.now()) {
  if (!row || typeof row !== 'object' || !validBoard(row.board)) return null;
  try {
    if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(row.id)) return null;
    if (!Number.isSafeInteger(row.timeMs) || row.timeMs < 1000 || row.timeMs > 1800000) return null;
    if (!Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || row.createdAt > now + 60000) return null;
    if (row.expiresAt !== row.createdAt + SCORE_TTL || row.expiresAt <= now) return null;
    return { id: row.id, name: cleanName(row.name), board: row.board, timeMs: row.timeMs,
      createdAt: row.createdAt, expiresAt: row.expiresAt };
  } catch { return null; }
}
export function rankScores(rows, board, now = Date.now(), limit = 50) {
  const best = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = validateResult(raw, now);
    if (!row || row.board !== board) continue;
    const key = row.name.toLocaleLowerCase('nb-NO');
    const old = best.get(key);
    if (!old || row.timeMs < old.timeMs || (row.timeMs === old.timeMs && row.createdAt < old.createdAt)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => a.timeMs - b.timeMs || a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, limit);
}
export function remainingTime(expiresAt, now = Date.now()) {
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60000));
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} d ${Math.floor(minutes % 1440 / 60)} t`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} t ${minutes % 60} min`;
  return `${minutes} min`;
}
export function scoreTime(ms) {
  const cs = Math.round(ms / 10);
  return `${Math.floor(cs / 6000).toString().padStart(2, '0')}:${Math.floor(cs % 6000 / 100).toString().padStart(2, '0')}.${(cs % 100).toString().padStart(2, '0')}`;
}
export function getStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function uniqueId() { return globalThis.crypto?.randomUUID?.() || `run-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
export class ScoreStore {
  constructor(storage = getStorage(), clock = Date.now) { this.storage = storage; this.clock = clock; this.memory = []; this.persistent = !!storage; }
  all() {
    let rows = this.memory;
    if (this.storage) {
      try { const value = JSON.parse(this.storage.getItem(SCORE_KEY) || '[]'); rows = Array.isArray(value) ? value : []; }
      catch { this.persistent = false; this.storage = null; }
    }
    const now = this.clock();
    this.memory = rows.map(row => validateResult(row, now)).filter(Boolean);
    this.write();
    return this.memory;
  }
  write() {
    try { if (this.storage) { this.storage.setItem(SCORE_KEY, JSON.stringify(this.memory)); this.persistent = true; } }
    catch { this.persistent = false; this.storage = null; }
  }
  add({ id = uniqueId(), name, board, timeMs }) {
    const now = this.clock(), rows = this.all();
    const existing = rows.find(row => row.id === id);
    if (existing) return existing;
    const row = validateResult({ id, name: cleanName(name), board, timeMs, createdAt: now, expiresAt: now + SCORE_TTL }, now);
    if (!row) throw new Error('Løpsresultatet er ugyldig. Fullfør et nytt løp.');
    if (rows.length >= 2000) throw new Error('Den lokale listen er full. Slett eldre lokale resultater først.');
    this.memory = [...rows, row]; this.write(); return row;
  }
  board(board) { return rankScores(this.all(), board, this.clock()); }
  clear() { this.memory = []; this.write(); }
}
