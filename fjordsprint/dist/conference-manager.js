import {CONFERENCE_API_URL, LEGACY_CONFERENCE_API_URL} from './conference-config.js?v=3.4.1';
import {RUN_BOARD} from './run-scoring.js';
import {
  conferenceApiEndpoint,
  formatConferenceDay,
  formatConferencePoints,
  formatConferenceTime,
  isConferenceDay,
  isConferenceScore
} from './conference-standings.js';

const element = id => document.getElementById(id);
const unlockForm = element('manager-unlock');
const searchForm = element('manager-search');
const tokenField = element('manager-token');
const dateField = element('manager-day');
const board = element('manager-board');
const result = element('manager-result');
const winnerFields = element('manager-winner');
const empty = element('manager-empty');
const lookup = element('manager-lookup');
const nickname = element('winner-nickname');
const score = element('winner-score');
const time = element('winner-time');
const username = element('winner-username');
const status = element('manager-status');
const legacy = new URLSearchParams(location.search).get('board') === 'legacy';
const threeStage = new URLSearchParams(location.search).get('board') === 'three-stage';
const apiUrl = legacy || threeStage ? LEGACY_CONFERENCE_API_URL : CONFERENCE_API_URL;
const historyLink = element('manager-history-link');
historyLink.href = legacy || threeStage ? './conference-manager.html' : './conference-manager.html?board=three-stage';
historyLink.textContent = legacy || threeStage ? 'Til Fagdagen (Fjordlinjen)' : 'Oppslag for treetappersløpet';
element('manager-scope').textContent = legacy ? 'Tidligere énetappes løp' : threeStage ? 'Treetappersløpet' : 'Fagdagen · Resultater fra den nye Fjordlinjen';
let token = '';
let activeRequest;

function message(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('is-error', isError);
}

function setBusy(busy) {
  for (const id of ['manager-token', 'manager-open', 'manager-day', 'manager-find', 'manager-today']) {
    element(id).disabled = busy;
  }
}

function clearWinner() {
  result.hidden = true;
  for (const field of [nickname, score, time, username]) field.textContent = '';
  empty.hidden = true;
  winnerFields.hidden = true;
  lookup.hidden = true;
}

function lockManager(text, isError = false) {
  activeRequest?.abort();
  activeRequest = undefined;
  token = '';
  tokenField.value = '';
  dateField.value = '';
  clearWinner();
  board.hidden = true;
  unlockForm.hidden = false;
  setBusy(false);
  message(text, isError);
  tokenField.focus();
}

function showWinner(day, resetsAt, winner) {
  dateField.value = day;
  const title = Date.now() < resetsAt ? 'Leder' : 'Vinner';
  element('manager-result-title').textContent = `${title} · ${formatConferenceDay(day)}`;
  if (winner) {
    nickname.textContent = winner.nickname;
    score.textContent = formatConferencePoints(winner.score);
    time.textContent = formatConferenceTime(winner.timeMs);
    username.textContent = winner.username;
    winnerFields.hidden = false;
    lookup.hidden = false;
  } else {
    empty.hidden = false;
  }
  result.hidden = false;
}

async function findWinner(requestToken, day = '') {
  if (activeRequest) return;
  clearWinner();
  setBusy(true);
  message('Henter resultatet …');
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const endpoint = conferenceApiEndpoint(apiUrl, 'conference/admin');
    if (!legacy) endpoint.searchParams.set('board', RUN_BOARD);
    if (day) endpoint.searchParams.set('day', day);
    const response = await fetch(endpoint, {
      headers: {Authorization: `Bearer ${requestToken}`},
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error'
    });
    if (activeRequest !== controller) return;
    if (response.status === 401 || response.status === 403) {
      lockManager('Tilgangen ble avvist. Sjekk arrangørnøkkelen.', true);
      return;
    }
    if (response.status === 400 && day) {
      message('Velg en gyldig konkurransedag.', true);
      return;
    }
    if (!response.ok) throw new Error('Kunne ikke hente resultatet.');
    const {day: resultDay, resetsAt, winner} = await response.json();
    if (activeRequest !== controller) return;
    if (!isConferenceDay(resultDay) || !Number.isSafeInteger(resetsAt) ||
        (winner !== null && (!isConferenceScore(winner) ||
          typeof winner.username !== 'string' || !winner.username))) {
      throw new Error('Ugyldig resultat fra poengtjenesten.');
    }
    const justUnlocked = !token;
    token = requestToken;
    tokenField.value = '';
    unlockForm.hidden = true;
    board.hidden = false;
    showWinner(resultDay, resetsAt, winner);
    message('');
    if (justUnlocked) element('manager-lock').focus();
  } catch {
    if (activeRequest === controller) {
      message('Kunne ikke hente resultatet. Prøv igjen.', true);
    }
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      activeRequest = undefined;
      setBusy(false);
    }
  }
}

unlockForm.addEventListener('submit', event => {
  event.preventDefault();
  const requestToken = tokenField.value.trim();
  if (requestToken) {
    tokenField.value = '';
    findWinner(requestToken);
  } else {
    message('Skriv inn arrangørnøkkelen.', true);
  }
});
searchForm.addEventListener('submit', event => {
  event.preventDefault();
  if (token && isConferenceDay(dateField.value)) findWinner(token, dateField.value);
});
element('manager-today').addEventListener('click', () => {
  if (token) findWinner(token);
});
element('manager-lock').addEventListener('click', () => lockManager('Visningen er låst.'));
element('manager-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(username.textContent);
    if (token) message('Brukernavnet er kopiert.');
  } catch {
    if (token) message('Merk og kopier brukernavnet fra resultatet.', true);
  }
});
window.addEventListener('pagehide', () => {
  if (token || activeRequest) lockManager('Visningen er låst.');
});

if (apiUrl) {
  setBusy(false);
} else {
  message('Arrangørvisningen er ikke koblet til poengtjenesten.', true);
}
