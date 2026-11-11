import {CONFERENCE_API_URL} from './conference-config.js';
import {
  fetchConferenceStandings,
  formatConferenceDay,
  renderConferenceStandings
} from './conference-standings.js';

const rows = document.querySelector('#standings');
const status = document.querySelector('#board-status');
let currentBoard;
let requestInProgress = false;
let resetTimer;
let staleBoard = false;

function message(text) {
  if (status.textContent !== text) status.textContent = text;
}

function replaceRowsWithMessage(text) {
  const row = rows.ownerDocument.createElement('tr');
  const cell = row.insertCell();
  cell.colSpan = 4;
  cell.textContent = text;
  rows.replaceChildren(row);
}

function checkReset() {
  if (currentBoard && currentBoard.resetsAt <= Date.now()) {
    currentBoard = undefined;
    replaceRowsWithMessage('Henter dagens poengtavle …');
  }
}

async function refreshStandings() {
  checkReset();
  if (requestInProgress) return;
  requestInProgress = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const standings = await fetchConferenceStandings(CONFERENCE_API_URL, {
      signal: controller.signal
    });
    if (standings.resetsAt <= Date.now()) throw new Error('Dagen er avsluttet.');
    if (standings.day !== currentBoard?.day ||
        JSON.stringify(standings.scores) !== JSON.stringify(currentBoard?.scores)) {
      renderConferenceStandings(rows, standings.scores);
    }
    currentBoard = standings;
    if (staleBoard) status.classList.remove('is-stale');
    staleBoard = false;
    message(formatConferenceDay(standings.day));
    clearTimeout(resetTimer);
    resetTimer = setTimeout(refreshStandings, Math.max(1, standings.resetsAt - Date.now()));
  } catch {
    checkReset();
    staleBoard = true;
    status.classList.add('is-stale');
    if (currentBoard) {
      message('Midlertidig uten kontakt. Viser sist hentede resultater.');
    } else {
      replaceRowsWithMessage('Poengtavlen er midlertidig utilgjengelig.');
      message('Prøver igjen automatisk.');
    }
  } finally {
    clearTimeout(timeout);
    requestInProgress = false;
  }
}

if (CONFERENCE_API_URL) {
  refreshStandings();
  setInterval(refreshStandings, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshStandings();
  });
} else {
  replaceRowsWithMessage('Poengtavlen er ikke koblet til poengtjenesten.');
}
