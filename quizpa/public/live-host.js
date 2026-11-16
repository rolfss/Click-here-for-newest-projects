import { api, button, copyText, escapeHtml as h, number, root, table } from './shared.js';

const gameId = location.pathname.split('/').filter(Boolean).at(-1);
const endpoint = '/api/admin/live/' + encodeURIComponent(gameId);
const joinUrl = new URL('/bli-med', location.origin);
const phaseLabels = {
  lobby: 'Livequiz · Venterom', question: 'Livequiz · Spørsmål', reveal: 'Livequiz · Fasit',
  finished: 'Livequiz · Resultater', cancelled: 'Livequiz · Avbrutt',
};

let game;
let deadline;
let pollTimer;
let clockTimer;
let refreshing = false;
let busy = false;
let stopped = false;
let actionVersion = 0;

root.innerHTML = '<header class="page-heading"><div>' +
  '<span class="eyebrow" role="status" data-live-phase>Livequiz</span>' +
  '<h1 data-live-title>Livequiz</h1><p data-live-description hidden></p></div>' +
  '<div class="actions"><a class="btn secondary" href="/arrangor">Til oversikten</a>' +
  '<span data-live-cancel hidden>' + button('cancel', 'Avbryt livequizen', 'danger small') + '</span></div></header>' +
  '<p class="message error" role="alert" data-live-error></p>' +
  '<p class="message" role="status" data-live-connection></p>' +
  '<div data-live-stage><p role="status">Henter livequizen …</p></div>';

const stage = root.querySelector('[data-live-stage]');
const cancelControl = root.querySelector('[data-live-cancel]');

function text(selector, value) {
  const element = root.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function lobby() {
  return '<div class="live-lobby"><section class="panel"><h2>Bli med</h2>' +
    '<p>Åpne <a href="/bli-med" target="_blank" rel="noopener">' + h(joinUrl.host + joinUrl.pathname) +
    '</a> og skriv inn spillkoden.</p>' +
    '<span class="eyebrow">Spillkode</span><p class="live-code">' + h(game.pin) + '</p>' +
    '<p class="help">Koden gjelder frem til start, i opptil to timer.</p>' +
    '<div class="actions">' + button('copy-invite', 'Kopier invitasjon') + '</div>' +
    '<p class="message" role="status" data-live-copy></p></section>' +
    '<section class="panel live-roster"><h2>Venterom</h2>' +
    '<p role="status" data-live-player-count></p><ul class="live-player-list" data-live-roster aria-label="Deltakere"></ul>' +
    '<p class="help" data-live-readiness></p><div class="actions">' + button('advance', 'Start livequizen', 'primary') +
    '</div></section></div>';
}

function questionCard(reveal) {
  const { question, position, questionCount } = game;
  const lastQuestion = position + 1 === questionCount;
  return '<section class="question-card"><span class="eyebrow">Spørsmål ' + number.format(position + 1) +
    ' av ' + number.format(questionCount) + '</span>' +
    '<h2>' + h(question.text) + '</h2>' +
    (reveal ? '' : '<div class="clock" data-live-clock><progress aria-label="Tid igjen" max="' +
      (question.seconds * 1000) + '" value="' + (question.seconds * 1000) + '"></progress><strong></strong></div>') +
    '<div class="choices">' + question.options.map((option, index) => {
      const correct = reveal && index === question.correctIndex;
      return '<div class="choice' + (correct ? ' correct' : '') + '"><b>' + (index + 1) + '</b><span>' + h(option) +
        '</span>' + (correct ? '<span class="mark">✓ Riktig</span>' : '') + '</div>';
    }).join('') + '</div>' +
    (reveal && question.explanation ? '<div class="feedback good"><p>' + h(question.explanation) + '</p></div>' : '') +
    '<div class="question-footer"><p data-live-answered role="status"></p>' +
    (reveal ? button('advance', lastQuestion ? 'Avslutt og vis resultatet' : 'Neste spørsmål', 'primary') : '') +
    '</div></section>';
}

function results() {
  const winners = game.leaderboard.filter(entry => entry.rank === 1);
  const names = new Intl.ListFormat('nb-NO');
  return '<section class="panel live-board">' + (winners.length ? '<h2>' +
    (winners.length === 1 ? 'Vinner' : 'Delt førsteplass') + '</h2><p class="live-winners">' +
    h(names.format(winners.map(entry => entry.nickname))) + '</p><p>' + number.format(winners[0].points) +
    ' poeng</p><h3>Sluttstilling</h3>' : '<h2>Sluttstilling</h2>') + table(game.leaderboard) + '</section>';
}

function finished() {
  return game?.phase === 'finished' || game?.phase === 'cancelled';
}

function syncControls() {
  cancelControl.hidden = !game || finished() || stopped;
  cancelControl.querySelector('button').disabled = busy;
  const advance = stage.querySelector('[data-do=advance]');
  if (advance) advance.disabled = busy || (game.phase === 'lobby' && game.playerCount < 2);
}

function drawClock() {
  clearTimeout(clockTimer);
  const clock = stage.querySelector('[data-live-clock]');
  if (!clock) return;
  const remaining = Math.max(0, deadline - performance.now());
  const seconds = Math.ceil(remaining / 1000);
  clock.classList.toggle('urgent', seconds <= 5);
  clock.querySelector('progress').value = remaining;
  text('[data-live-clock] strong', number.format(seconds) + ' sek');
  if (remaining > 0) clockTimer = setTimeout(drawClock, 100);
}

function updateGame(next, requestStarted, focus = false) {
  const previous = game;
  const changedStage = previous?.phase !== next.phase || previous?.position !== next.position;
  const refocus = focus || stage.contains(document.activeElement);
  const receivedAt = performance.now();
  game = next;
  deadline = receivedAt + next.deadline - next.serverNow - (receivedAt - requestStarted) / 2;

  if (changedStage) {
    text('[data-live-phase]', phaseLabels[game.phase]);
    text('[data-live-title]', game.title);
    text('[data-live-description]', game.description || '');
    root.querySelector('[data-live-description]').hidden = !game.description;
    text('[data-live-error]', '');
    const views = {
      lobby,
      question: () => questionCard(false),
      reveal: () => questionCard(true),
      finished: results,
      cancelled: () => '<section class="panel"><h2 class="no-margin">Livequizen er avbrutt</h2></section>',
    };
    stage.innerHTML = views[game.phase]();
    if (refocus) {
      const heading = stage.querySelector('h2');
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  if (game.phase === 'lobby') {
    text('[data-live-player-count]', number.format(game.playerCount) + ' av 50 plasser fylt');
    text('[data-live-readiness]', game.playerCount < 2 ? 'Minst 2 deltakere for å starte.' : 'Klar til å starte.');
    if (changedStage || game.playerCount !== previous.playerCount) {
      stage.querySelector('[data-live-roster]').innerHTML = game.players.map(player =>
        '<li>' + h(player.nickname) + '</li>').join('');
    }
  }
  text('[data-live-answered]', number.format(game.answeredCount) + ' av ' + number.format(game.playerCount) + ' har svart');
  text('[data-live-connection]', '');
  syncControls();
  drawClock();
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (stopped || finished() || refreshing || busy) return;
  const delay = game?.phase === 'question' ? Math.max(250, Math.min(1000, deadline - performance.now())) : 1500;
  pollTimer = setTimeout(refresh, delay);
}

function stopIfUnavailable(error) {
  if (error.status !== 401 && error.status !== 404) return false;
  stopped = true;
  clearTimeout(clockTimer);
  syncControls();
  text('[data-live-error]', '');
  text('[data-live-connection]', '');
  stage.innerHTML = '<section class="panel"><h2>' + (error.status === 401 ? 'Logg inn igjen' : 'Fant ikke livequizen') +
    '</h2><p class="no-margin">Gå til arrangøroversikten.</p></section>';
  return true;
}

async function refresh() {
  if (stopped || finished() || refreshing || busy) return;
  clearTimeout(pollTimer);
  refreshing = true;
  const version = actionVersion;
  const started = performance.now();
  try {
    const next = await api(endpoint);
    if (version === actionVersion) updateGame(next, started);
  } catch (error) {
    if (version === actionVersion && !stopIfUnavailable(error)) {
      text('[data-live-connection]', 'Mistet forbindelsen. Prøver igjen …');
    }
  } finally {
    refreshing = false;
    schedulePoll();
  }
}

async function changeGame(action) {
  if (!game || busy || stopped || finished()) return;
  if (action === 'cancel' && !window.confirm('Avbryte livequizen? Deltakerne kan ikke fortsette etterpå.')) return;
  busy = true;
  actionVersion++;
  syncControls();
  text('[data-live-error]', '');
  const started = performance.now();
  try {
    updateGame(await api(endpoint + '/' + action, { method: 'POST', data: {} }), started, true);
  } catch (error) {
    if (!stopIfUnavailable(error)) {
      text('[data-live-error]', error.message === 'Failed to fetch' ? 'Mistet forbindelsen. Prøv igjen.' : error.message);
    }
  } finally {
    busy = false;
    syncControls();
    schedulePoll();
  }
}

root.addEventListener('click', async event => {
  const action = event.target.closest('[data-do]')?.dataset.do;
  if (action === 'advance' || action === 'cancel') {
    await changeGame(action);
  } else if (action === 'copy-invite' && game?.phase === 'lobby') {
    const invite = 'Bli med på ' + game.title + '!\n' + joinUrl.href + '\nSpillkode ' + game.pin;
    const copied = await copyText(invite);
    text('[data-live-copy]', copied ? 'Invitasjonen er kopiert.' : 'Kopier lenken og spillkoden ovenfor.');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});

void refresh();
