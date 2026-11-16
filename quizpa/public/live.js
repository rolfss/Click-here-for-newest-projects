import { api, escapeHtml as h, focusHeading, number, root, say, table } from './shared.js';

const id = location.pathname.split('/')[2];
const endpoint = '/api/live/' + id;
const list = new Intl.ListFormat('nb-NO');
const message = '<p class="message" data-message role="status"></p>';
const joinLink = '<a class="btn secondary" href="/bli-med">Bruk en annen spillkode</a>';
let state;
let view;
let deadlineAt = 0;
let pending = false;
let reading = false;
let version = 0;
let stopped = false;
let shown = 50;
let joinAttempt;

function gameBar() {
  return '<div class="game-bar"><div class="game-title">' + h(state.title) +
    (state.player ? '<span>' + h(state.player.nickname) + '</span>' : '') + '</div></div>';
}

function lobby() {
  const ready = state.player ? '<p>Du er med som <strong>' + h(state.player.nickname) +
    '</strong>. Det første spørsmålet vises her når arrangøren starter.</p>' :
    '<form class="form" data-nickname-form><label>Kallenavn<input name="nickname" required minlength="2" ' +
    'maxlength="24" autocomplete="off" aria-describedby="live-nickname-help"></label>' +
    '<p class="help" id="live-nickname-help">Deltakerne kan se kallenavnet ditt på topplisten.</p>' +
    '<div class="actions"><button class="btn primary" type="submit">Bli med i quizen</button></div></form>';
  return '<section class="panel full intro"><span class="eyebrow">Direktequiz</span><h1>' + h(state.title) + '</h1>' +
    (state.description ? '<p class="description">' + h(state.description) + '</p>' : '') +
    '<div class="meta"><span>' + number.format(state.questionCount) + ' spørsmål</span><span data-player-count></span></div>' +
    '<h2>Venter på start</h2>' + ready + message + '</section>';
}

function choices(reveal) {
  const { question, player } = state;
  return '<div class="choices">' + question.options.map((option, index) => {
    const right = reveal && index === question.correctIndex;
    const selected = reveal && index === player.answer;
    const style = right ? ' correct' : selected ? ' incorrect' : '';
    const mark = right ? (selected ? 'Riktig · Ditt svar' : 'Riktig svar') : selected ? 'Ditt svar' : '';
    const control = reveal ? 'disabled' : 'data-choice="' + index + '" aria-keyshortcuts="' + (index + 1) + '"';
    return '<button type="button" class="choice' + style + '" ' + control + '>' +
      '<b aria-hidden="true">' + (index + 1) + '</b><span>' + h(option) + '</span>' +
      '<span class="mark"' + (mark ? '' : ' hidden') + '>' + mark + '</span></button>';
  }).join('') + '</div>';
}

function answerFeedback() {
  const { player, question } = state;
  const right = player.answer === question.correctIndex;
  const text = player.answer === null ? 'Du svarte ikke i tide.' : right ? 'Riktig!' : 'Feil svar.';
  const tone = player.answer === null ? '' : right ? ' good' : ' bad';
  return '<div class="feedback' + tone + '" id="live-answer-feedback"><strong>' + text + '</strong>' +
    (question.explanation ? '<p>' + h(question.explanation) + '</p>' : '') + '</div>';
}

function questionPanel(reveal) {
  const { position, questionCount, question } = state;
  const clock = '<div class="clock"><progress aria-label="Tid igjen" max="' + question.seconds * 1000 +
    '"></progress><strong data-clock aria-hidden="true"></strong></div>';
  return gameBar() + '<section class="question-card"><p class="eyebrow">Spørsmål ' + (position + 1) +
    ' av ' + questionCount + (reveal ? ' · Fasit' : '') + '</p><h1' +
    (reveal ? ' aria-describedby="live-answer-feedback"' : '') + '>' + h(question.text) + '</h1>' +
    (reveal ? '' : clock) + choices(reveal) + (reveal ? answerFeedback() :
      '<div class="question-footer"><p data-answer-status role="status"></p></div>') + message + '</section>' +
    (reveal ? board('Stillingen') : '');
}

function board(title) {
  if (!state.leaderboard?.length) return '';
  return '<section class="panel result-leaderboard" aria-labelledby="live-board-heading">' +
    '<h2 id="live-board-heading">' + title + '</h2><div data-board-entries>' +
    table(state.leaderboard, state.player?.nickname, shown) + '</div></section>';
}

function stat(label, value) {
  return '<div class="stat"><span>' + label + '</span><strong>' + value + '</strong></div>';
}

function results() {
  const { player, questionCount } = state;
  const leaderboard = state.leaderboard ?? [];
  const winners = state.winners ?? leaderboard.filter(entry => entry.rank === 1).map(entry => entry.nickname);
  const headline = winners.length ? (winners.length === 1 ? 'Vinneren er ' : 'Vinnerne er ') + list.format(winners) :
    'Quizen er ferdig';
  const place = leaderboard.find(entry => entry.nickname === player?.nickname)?.rank;
  const stats = player ? '<div class="result-stats">' + (place ? stat('Din plass', number.format(place)) : '') +
    stat('Poeng', number.format(player.points)) + stat('Riktige svar', player.correct + ' av ' + questionCount) + '</div>' : '';
  return gameBar() + '<section class="panel"><h1>' + h(headline) + '</h1>' + stats +
    (!player ? joinLink : '') + '</section>' + board('Sluttstilling');
}

function unavailable(title, description) {
  return '<section class="panel full"><h1>' + title + '</h1><p>' + description + '</p>' + joinLink + '</section>';
}

function render() {
  const registrationClosed = !state.player && (state.phase === 'question' || state.phase === 'reveal');
  const nextView = registrationClosed ? 'registration-closed' : state.phase + '/' + state.position + '/' + Boolean(state.player);
  if (nextView !== view) {
    shown = 50;
    const screens = {
      lobby,
      question: () => questionPanel(false),
      reveal: () => questionPanel(true),
      finished: results,
      cancelled: () => unavailable('Quizen er avlyst', 'Arrangøren har avsluttet direktequizen.'),
    };
    const screen = registrationClosed ? unavailable('Quizen har startet', 'Påmeldingen er stengt.') : screens[state.phase]();
    root.innerHTML = screen + '<p class="message" data-connection role="status"></p>';
    if (view) focusHeading();
    view = nextView;
  }
  const count = root.querySelector('[data-player-count]');
  if (count) setText(count, number.format(state.playerCount) + (state.playerCount === 1 ? ' deltaker' : ' deltakere'));
  updateQuestion();
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function updateQuestion() {
  if (state?.phase !== 'question' || !state.question) return;
  const { answer } = state.player;
  const left = Math.max(0, deadlineAt - performance.now());
  const seconds = Math.ceil(left / 1000);
  const clock = root.querySelector('.clock');
  clock.querySelector('progress').value = left;
  setText(clock.querySelector('[data-clock]'), seconds + ' sek');
  clock.classList.toggle('urgent', left < 5000);
  const locked = pending || answer !== null || left === 0;
  for (const choice of root.querySelectorAll('[data-choice]')) {
    const selected = Number(choice.dataset.choice) === answer;
    if (choice.disabled !== locked) choice.disabled = locked;
    const mark = choice.querySelector('.mark');
    if (mark.hidden === selected) mark.hidden = !selected;
    if (selected) setText(mark, 'Ditt svar');
  }
  const status = answer !== null ? 'Svaret ditt er registrert.' : left === 0 ? 'Tiden er ute. Venter på fasit.' :
    pending ? 'Sender svaret …' : 'Velg ett svar før tiden går ut.';
  setText(root.querySelector('[data-answer-status]'), status);
}

function keep(next) {
  const candidate = next.phase === 'question' ? performance.now() + next.deadline - next.serverNow : 0;
  const sameDeadline = next.phase === 'question' && state?.phase === 'question' &&
    next.position === state.position && next.deadline === state.deadline;
  deadlineAt = sameDeadline ? Math.min(deadlineAt, candidate) : candidate;
  const justAnswered = sameDeadline && state.player?.answer === null && Number.isInteger(next.player?.answer);
  state = next;
  render();
  if (justAnswered) say('');
  setText(root.querySelector('[data-connection]'), '');
  if (state.phase === 'finished' || state.phase === 'cancelled') stop();
}

function stop() {
  stopped = true;
  clearInterval(pollTimer);
  clearInterval(clockTimer);
}

async function refresh() {
  if (stopped || pending || reading) return;
  reading = true;
  const startedAtVersion = version;
  try {
    const next = await api(endpoint);
    if (startedAtVersion === version) keep(next);
  } catch (error) {
    if (startedAtVersion !== version) return;
    if (!state && error.status === 404) {
      stop();
      root.innerHTML = unavailable('Fant ikke quizen', 'Sjekk spillkoden eller lenken fra arrangøren.');
      return;
    }
    if (!state && !root.querySelector('[data-connection]')) {
      root.innerHTML = '<section class="panel full"><h1>Direktequiz</h1><p class="message error" data-connection role="status"></p></section>';
    }
    setText(root.querySelector('[data-connection]'), 'Fikk ikke kontakt med quizen. Prøver igjen …');
  } finally {
    reading = false;
  }
}

async function send(path, data) {
  pending = true;
  version += 1;
  const joinButton = root.querySelector('[data-nickname-form] button');
  if (joinButton) joinButton.disabled = true;
  updateQuestion();
  say('');
  try {
    keep(await api(endpoint + path, { method: 'POST', data }));
  } catch (error) {
    say(error.status ? error.message : 'Fikk ikke sendt. Prøv igjen.', true);
  } finally {
    pending = false;
    if (joinButton) joinButton.disabled = false;
    updateQuestion();
    void refresh();
  }
}

root.addEventListener('submit', event => {
  const form = event.target.closest('[data-nickname-form]');
  if (!form) return;
  event.preventDefault();
  if (pending) return;
  const nickname = form.elements.nickname.value.trim();
  if (nickname !== joinAttempt?.nickname) {
    joinAttempt = { nickname, requestId: crypto.randomUUID().replaceAll('-', '') };
  }
  void send('/join', joinAttempt);
});

root.addEventListener('input', event => {
  if (event.target.matches('[name="nickname"]')) say('');
});

root.addEventListener('click', event => {
  const choice = event.target.closest('[data-choice]');
  if (choice && !choice.disabled && !pending && performance.now() < deadlineAt) {
    void send('/answer', { position: state.position, choice: Number(choice.dataset.choice) });
  }
  if (event.target.closest('[data-do="more"]')) {
    shown += 50;
    root.querySelector('[data-board-entries]').innerHTML = table(state.leaderboard, state.player?.nickname, shown);
    const more = root.querySelector('[data-do="more"]');
    const next = more ?? root.querySelector('#live-board-heading');
    if (!more) next.tabIndex = -1;
    next.focus({ preventScroll: true });
  }
});

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || !/^[1-9]$/.test(event.key) ||
      event.target.closest('input, select, textarea, [contenteditable]')) return;
  const choice = root.querySelector('[data-choice="' + (Number(event.key) - 1) + '"]');
  if (choice && !choice.disabled) {
    event.preventDefault();
    choice.click();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
window.addEventListener('online', refresh);
const pollTimer = setInterval(refresh, 1200);
const clockTimer = setInterval(updateQuestion, 125);
void refresh();
