const source = 'https://fjordsprint-scores.rolfsselas.workers.dev/conference/scores?board=fjordsprint-three-stage-v1';
const snapshotKey = 'fjord-legacy-board-v1';
const archivePrefix = 'fjord-legacy-day:';
const refreshMs = 25_000;
const timeoutMs = 4_000;
const maxRows = 50;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const nicknamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

function readRow(row) {
  if (typeof row?.nickname !== 'string' || row.nickname.length > 40 ||
      !nicknamePattern.test(row.nickname) || [...row.nickname].length < 2 || [...row.nickname].length > 20 ||
      !Number.isSafeInteger(row.rank) || row.rank < 1 ||
      !Number.isSafeInteger(row.score) || row.score < 0 || row.score > 30_150 ||
      !Number.isSafeInteger(row.timeMs) || row.timeMs < 1 || row.timeMs > 1_800_000) return null;
  const { rank, nickname, score, timeMs } = row;
  return { rank, nickname, score, timeMs };
}

function readSnapshot(value, field) {
  if (typeof value?.day !== 'string' || !dayPattern.test(value.day) ||
      !Array.isArray(value[field]) || value[field].length > maxRows) return null;
  const rows = value[field].map(readRow);
  if (rows.some(row => !row || row.rank > maxRows) || new Set(rows.map(row => row.rank)).size !== rows.length) return null;
  return { day: value.day, rows };
}

/** Fetch only public standings. The cache belongs to the Fjord Durable Object. */
export function createLegacyFjordFeed({ storage, fetcher = (url, options) => fetch(url, options), clock = Date.now } = {}) {
  const snapshots = new Map();
  let initialization;
  let lastAttempt;
  let pending;

  async function initialize() {
    try {
      const original = readSnapshot(await storage?.get(snapshotKey), 'rows');
      if (original?.rows.length) snapshots.set(original.day, original);
    } catch { /* An upstream fetch can still recover the current day. */ }
    try {
      const saved = await storage?.list?.({ prefix: archivePrefix });
      for (const value of saved?.values() ?? []) {
        const snapshot = readSnapshot(value, 'rows');
        if (snapshot?.rows.length) snapshots.set(snapshot.day, snapshot);
      }
    } catch { /* The original snapshot remains available. */ }
  }

  async function refresh(day) {
    try {
      const response = await fetcher(source, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return;
      const fresh = readSnapshot(await response.json(), 'scores');
      if (fresh?.day !== day || fresh.rows.length === 0) return;
      const snapshot = snapshots.get(day);
      if (snapshot) {
        // The original board retains every participant's best for the full competition day.
        if (fresh.rows.length < snapshot.rows.length || JSON.stringify(snapshot.rows) === JSON.stringify(fresh.rows)) return;
      }
      snapshots.set(day, fresh);
      await storage?.put(archivePrefix + day, fresh);
    } catch {
      // A temporary upstream or storage failure can still use the in-memory snapshot.
    }
  }

  return {
    days() { return [...snapshots.keys()]; },
    async read(day, { refreshCurrent = true } = {}) {
      if (typeof day !== 'string' || !dayPattern.test(day)) return [];
      initialization ??= initialize();
      await initialization;
      const now = clock();
      if (!refreshCurrent) return snapshots.get(day)?.rows ?? [];
      if (pending?.day === day) {
        await pending.promise;
      } else if (!pending && (lastAttempt?.day !== day || now - lastAttempt.at >= refreshMs)) {
        lastAttempt = { day, at: now };
        const promise = refresh(day);
        pending = { day, promise };
        try {
          await promise;
        } finally {
          pending = undefined;
        }
      }
      return snapshots.get(day)?.rows ?? [];
    },
  };
}

/** Old scores use actual three-stage time. New rows can carry a separate ranking time. */
export function mergeFjordScores({ scores, ...publicFields }, legacyRows, { limit = Infinity, includeIdentity = false } = {}) {
  const oldEntries = legacyRows.flatMap(row => {
    const publicRow = readRow(row);
    return publicRow ? [{ publicRow, rankingTimeMs: publicRow.timeMs, sourceOrder: 0 }] : [];
  });
  const newEntries = scores.flatMap(row => {
    const publicRow = readRow(row);
    const rankingTimeMs = Number.isSafeInteger(row?.rankingTimeMs) && row.rankingTimeMs > 0
      ? row.rankingTimeMs : publicRow?.timeMs;
    return publicRow ? [{ publicRow, rankingTimeMs, sourceOrder: 1, username: row.username }] : [];
  });
  const ranked = [...oldEntries, ...newEntries].sort((a, b) => b.publicRow.score - a.publicRow.score ||
    a.rankingTimeMs - b.rankingTimeMs || a.sourceOrder - b.sourceOrder || a.publicRow.rank - b.publicRow.rank);
  return {
    ...publicFields,
    scores: ranked.slice(0, limit).map(({ publicRow, username }, index) => ({
      ...publicRow, rank: index + 1, ...(includeIdentity ? { username: username ?? null } : {}),
    })),
  };
}
