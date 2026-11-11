const pointsFormat = new Intl.NumberFormat('nb-NO');
const dateFormat = new Intl.DateTimeFormat('nb-NO', {
  dateStyle: 'long',
  timeZone: 'UTC'
});

export function conferenceApiEndpoint(apiUrl, path) {
  const base = new URL(apiUrl);
  const localHttp = base.protocol === 'http:' &&
    (base.hostname === '127.0.0.1' || base.hostname === 'localhost');
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password ||
      base.search || base.hash) {
    throw new Error('Poengtjenesten har en ugyldig adresse.');
  }
  base.pathname = base.pathname.replace(/\/$/, '') + '/';
  return new URL(path, base);
}

export function isConferenceDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function formatConferenceDay(day) {
  return dateFormat.format(new Date(day));
}

export function formatConferencePoints(score) {
  return pointsFormat.format(score);
}

export function formatConferenceTime(timeMs) {
  const hundredths = Math.round(timeMs / 10);
  const minutes = String(Math.floor(hundredths / 6000)).padStart(2, '0');
  const seconds = String(Math.floor(hundredths / 100) % 60).padStart(2, '0');
  return `${minutes}:${seconds}.${String(hundredths % 100).padStart(2, '0')}`;
}

export function isConferenceScore(row) {
  return row && Number.isSafeInteger(row.rank) && row.rank > 0 &&
    typeof row.nickname === 'string' && row.nickname.length > 0 &&
    Number.isSafeInteger(row.score) && row.score >= 0 &&
    Number.isSafeInteger(row.timeMs) && row.timeMs > 0;
}

export async function fetchConferenceStandings(apiUrl, {signal} = {}) {
  const response = await fetch(conferenceApiEndpoint(apiUrl, 'conference/scores'), {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Kunne ikke hente poengtavlen.');

  const {day, resetsAt, scores} = await response.json();
  if (!isConferenceDay(day) || !Number.isSafeInteger(resetsAt) || !Array.isArray(scores) ||
      !scores.every(isConferenceScore)) {
    throw new Error('Poengtjenesten svarte med ugyldige resultater.');
  }

  return {
    day,
    resetsAt,
    scores: scores.map(({rank, nickname, score, timeMs}) => ({rank, nickname, score, timeMs}))
  };
}

export function renderConferenceStandings(tableBody, scores) {
  const rows = scores.map(({rank, nickname, score, timeMs}) => {
    const row = document.createElement('tr');
    const position = row.insertCell();
    position.textContent = String(rank);

    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = nickname;
    row.append(name);

    const points = row.insertCell();
    points.className = 'points-cell';
    points.textContent = formatConferencePoints(score);
    row.insertCell().textContent = formatConferenceTime(timeMs);
    return row;
  });

  if (rows.length === 0) {
    const row = document.createElement('tr');
    const empty = row.insertCell();
    empty.colSpan = 4;
    empty.textContent = 'Ingen fullførte løp ennå.';
    rows.push(row);
  }
  tableBody.replaceChildren(...rows);
}
