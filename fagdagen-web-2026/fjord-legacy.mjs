const source = 'https://fjordsprint-scores.rolfsselas.workers.dev/conference/scores?board=fjordsprint-three-stage-v1';
const snapshotKey = 'fjord-legacy-board-v1';
const refreshMs = 25_000;
const timeoutMs = 4_000;
const maxRows = 50;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const nicknamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

function readRow(row) {
  if (typeof row?.nickname !== 'string' || row.nickname.length > 40 ||
      !nicknamePattern.test(row.nickname) || [...row.nickname].length < 2 || [...row.nickname].length > 20 ||
      !Number.isSafeInteger(row.rank) || row.rank < 1 || row.rank > maxRows ||
      !Number.isSafeInteger(row.score) || row.score < 0 || row.score > 30_150 ||
      !Number.isSafeInteger(row.timeMs) || row.timeMs < 1 || row.timeMs > 1_800_000) return null;
  const { rank, nickname, score, timeMs } = row;
  return { rank, nickname, score, timeMs };
}

function readSnapshot(value, field) {
  if (typeof value?.day !== 'string' || !dayPattern.test(value.day) ||
      !Array.isArray(value[field]) || value[field].length > maxRows) return null;
  const rows = value[field].map(readRow);
  if (rows.includes(null) || new Set(rows.map(row => row.rank)).size !== rows.length) return null;
  return { day: value.day, rows };
}

/** Fetch only public standings. The cache belongs to the Fjord Durable Object. */
export function createLegacyFjordFeed({ storage, fetcher = (url, options) => fetch(url, options), clock = Date.now } = {}) {
  let snapshot;
  let initialization;
  let lastAttempt;
  let pending;

  async function initialize() {
    try {
      snapshot = readSnapshot(await storage?.get(snapshotKey), 'rows');
    } catch {
      snapshot = null;
    }
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
      if (fresh?.day !== day || (snapshot && snapshot.day > day)) return;
      if (snapshot?.day === day) {
        // The original board retains every participant's best for the full competition day.
        if (fresh.rows.length < snapshot.rows.length || JSON.stringify(snapshot.rows) === JSON.stringify(fresh.rows)) return;
      }
      snapshot = fresh;
      await storage?.put(snapshotKey, fresh);
    } catch {
      // A temporary upstream or storage failure can still use the in-memory snapshot.
    }
  }

  return {
    async read(day) {
      if (typeof day !== 'string' || !dayPattern.test(day)) return [];
      initialization ??= initialize();
      await initialization;
      const now = clock();
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
      return snapshot?.day === day ? snapshot.rows : [];
    },
  };
}

/** Old scores use actual three-stage time. New rows can carry a separate ranking time. */
export function mergeFjordScores({ scores, ...publicFields }, legacyRows, { limit = maxRows } = {}) {
  const oldEntries = legacyRows.flatMap(row => {
    const publicRow = readRow(row);
    return publicRow ? [{ publicRow, rankingTimeMs: publicRow.timeMs, sourceOrder: 0 }] : [];
  });
  const newEntries = scores.flatMap(row => {
    const publicRow = readRow(row);
    const rankingTimeMs = Number.isSafeInteger(row?.rankingTimeMs) && row.rankingTimeMs > 0
      ? row.rankingTimeMs : publicRow?.timeMs;
    return publicRow ? [{ publicRow, rankingTimeMs, sourceOrder: 1 }] : [];
  });
  const ranked = [...oldEntries, ...newEntries].sort((a, b) => b.publicRow.score - a.publicRow.score ||
    a.rankingTimeMs - b.rankingTimeMs || a.sourceOrder - b.sourceOrder || a.publicRow.rank - b.publicRow.rank);
  return {
    ...publicFields,
    scores: ranked.slice(0, limit).map(({ publicRow }, index) => ({ ...publicRow, rank: index + 1 })),
  };
}
