import { api, button, copyText, dateLabel, escapeHtml as h, focusHeading, number, root, say, table } from './shared.js';

const code = location.pathname.split('/')[2];
const endpoint = '/api/play/' + code;
const post = (path, data = {}) => api(endpoint + path, { method: 'POST', data });
let state;
let receivedAt = 0;
let pending = false;
let timer;
let recoveryCode = '';
let board;
let resultBoard;
let resultBoardPending = false;
let resultBoardError = false;
let review;
let shown = 50;
let feedback;
let activeRequest;

function keep(next) {
  state = next;
  receivedAt = performance.now();
  if (next.recoveryCode) recoveryCode = next.recoveryCode;
}

function savedJoin() {
  try {
    return JSON.parse(sessionStorage.getItem('quizpa-join-' + code) || 'null');
  } catch {
    // Play remains available in browsers that block session storage.
    return null;
  }
}

function rememberJoin(value) {
  try {
    const key = 'quizpa-join-' + code;
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    // In-memory retries still work while this page stays open.
  }
}

function stat(label, value, attributes = '') {
  return '<div class="stat"><span>' + label + '</span><strong' + attributes + '>' + value + '</strong></div>';
}

function gameBar(allowBoard = false) {
  const { round, player } = state;
  return '<div class="game-bar"><div class="game-title">' + h(round.title) +
    (player ? '<span>' + h(player.nickname) + '</span>' : '') + '</div><div class="actions">' +
    (allowBoard && round.boardVisible ? button('board', 'Toppliste', 'ghost small') : '') +
    (player ? button('code', 'Min personlige kode', 'ghost small') : '') + '</div></div>';
}

function intro() {
  const round = state.round;
  const status = round.status === 'closed' ? 'Runden er avsluttet' :
    round.status === 'scheduled' ? 'Åpner ' + dateLabel(round.opensAt) :
    round.closesAt === null ? '' : 'Spill innen ' + dateLabel(round.closesAt);
  const open = round.status === 'open';
  return '<section class="panel full intro"><span class="eyebrow">' +
    (code === 'demo' ? 'Demoquiz' : 'Invitasjon til quiz') + '</span><h1>' + h(round.title) + '</h1>' +
    (round.description ? '<p class="description">' + h(round.description) + '</p>' : '') +
    '<div class="meta"><span>' + round.questionCount + ' spørsmål</span>' +
    (status ? '<span>' + status + '</span>' : '') + '</div>' +
    (open ? '<p>Du spiller på egen hånd når det passer deg.</p>' +
      '<form class="form" data-form="join"><label>Kallenavn<input required name="nickname" maxlength="24" autocomplete="off" aria-describedby="nickname-help" placeholder="F.eks. Fjordfalk"></label>' +
      '<p class="help" id="nickname-help">Bruk fornavnet ditt eller et kallenavn. Det kan bli synlig på topplisten.</p>' +
      '<div class="actions"><button class="btn primary" type="submit">Bli med i quizen <span aria-hidden="true">→</span></button></div></form>' : '') +
    '<details><summary>Fortsett et spill du har startet</summary><form class="form" data-form="recover"><label>Personlig kode' +
    '<input name="code" maxlength="55" required spellcheck="false" autocapitalize="characters" autocomplete="off" aria-describedby="recover-help"></label>' +
    '<p class="help" id="recover-help">Bruk den lange koden med bindestreker fra «Min personlige kode» i spillet. Arrangørens åttesifrede spillkode brukes for å åpne quizen.</p>' +
    '<div class="actions"><button class="btn secondary" type="submit">Fortsett spillet</button></div></form></details>' +
    '<p class="message" data-message role="status"></p>' +
    '<div class="actions">' + (round.boardVisible ? button('board', 'Se toppliste', 'ghost') : '') +
    (!open ? button('refresh', 'Oppdater', 'ghost') : '') + '</div></section>';
}

function choices(options, answer) {
  return '<div class="choices">' + options.map((option, index) => {
    const right = answer?.correctIndex === index;
    const selected = answer?.selected === index;
    const marked = right ? (selected ? '✓ Ditt svar' : '✓ Riktig') : selected ? 'Ditt svar' : '';
    const css = right ? ' correct' : selected && answer.correctIndex !== undefined ? ' incorrect' : '';
    return '<button type="button" class="choice' + css + '" ' +
      (answer ? 'disabled' : 'data-do="answer" data-choice="' + index + '" aria-keyshortcuts="' + (index + 1) + '"') +
      '><b aria-hidden="true">' + (index + 1) + '</b><span>' + h(option) + '</span>' +
      (marked ? '<span class="mark">' + marked + '</span>' : '') + '</button>';
  }).join('') + '</div>';
}

function answerDetails(answer) {
  const outcome = {
    correct: 'Riktig!', wrong: 'Feil svar', timeout: 'Tiden gikk ut', skip: 'Spørsmålet ble hoppet over', submitted: 'Svar registrert',
  }[answer.outcome];
  const tone = answer.outcome === 'correct' ? ' good' : answer.outcome === 'wrong' ? ' bad' : '';
  return '<div class="feedback' + tone + '" role="status"><strong>' + outcome +
    (answer.points !== undefined ? ' · ' + number.format(answer.points) + ' poeng' : '') + '</strong>' +
    (answer.explanation ? '<p>' + h(answer.explanation) + '</p>' : '') +
    (answer.correctIndex === undefined ? '<p>Fasiten vises når runden er avsluttet.</p>' : '') + '</div>';
}

function questionPanel(question, answer) {
  const total = state.round.questionCount;
  const isLast = question.index + 1 === total;
  return gameBar(Boolean(answer)) + '<section class="question-card"><div class="eyebrow">Spørsmål ' +
    (question.index + 1) + ' av ' + total + '</div>' +
    '<h1>' + h(question.text) + '</h1>' +
    (answer ? '' : '<div class="clock"><progress aria-label="Tid igjen" max="' + question.duration +
      '" value="' + question.duration + '"></progress><strong data-clock aria-hidden="true"></strong></div>') +
    choices(question.options, answer) + (answer ? answerDetails(answer) : '') +
    '<div class="question-footer">' +
    (answer ? button(isLast ? 'finish' : 'next', isLast ? 'Se resultatet ditt' : 'Neste spørsmål', 'primary')
      : '<p>Velg ett svar før tiden går ut. Svaret sendes med én gang. På PC kan du bruke tastene 1–' + question.options.length + '.</p>' + button('skip', 'Hopp over', 'ghost')) +
    '</div><p class="message" data-message role="status"></p></section>';
}

function ready() {
  const { round, player } = state;
  if (round.status === 'closed') {
    return gameBar(true) + '<div class="panel"><h1>Runden er avsluttet</h1><p>' +
      (player.position ? 'Du rakk ' + player.position + ' av ' + round.questionCount + ' spørsmål.' : 'Runden er over.') +
      '</p><div class="actions">' + (player.position ? button('review', 'Se dine svar', 'secondary') : '') +
      (round.boardVisible ? button('board', 'Se toppliste', 'primary') : '') + '</div><p class="message" data-message role="status"></p></div>';
  }
  return gameBar(true) + '<section class="panel full"><h1>Klar, ' + h(player.nickname) + '?</h1>' +
    '<p>Nedtellingen starter når et spørsmål vises. Når du har svart, velger du selv når du vil gå videre.</p>' +
    '<div class="meta"><span>' + round.questionCount +
    ' spørsmål</span><span>1 000 poeng per riktig svar</span><span>Opptil 500 bonuspoeng totalt for raske, riktige svar</span></div>' +
    '<div class="actions">' + button('next', player.position ? 'Fortsett spillet' : 'Start quizen', 'primary') + '</div>' +
    (recoveryCode ? '<details><summary>Ta vare på din personlige kode</summary><p class="help">Bruk den hvis du vil fortsette samme spill på en annen mobil eller PC.</p>' +
      '<code class="recovery-code">' + h(recoveryCode) + '</code>' + button('code', 'Vis eller kopier koden', 'ghost small') + '</details>' : '') +
    '<p class="message" data-message role="status"></p></section>';
}

function result() {
  const { round, player } = state;
  const reveal = round.feedbackMode === 'immediate' || round.status === 'closed';
  const boardAfterClose = round.boardMode === 'after_close' && !round.boardVisible;
  const delayed = [!reveal && 'fasiten', boardAfterClose && 'topplisten'].filter(Boolean).join(' og ');
  const rank = resultRank();
  return gameBar() + '<section class="panel"><h1>Quizen er fullført</h1><p>Resultatet ditt er lagret som «' + h(player.nickname) +
    '».</p><div class="result-stats">' + stat('Poeng', number.format(player.points)) +
    stat('Riktige svar', player.correct + ' av ' + round.questionCount) +
    (rank ? stat('Din plass', rank, ' data-result-rank') : '') + '</div><div class="actions">' +
    (reveal ? button('review', 'Se fasiten', 'secondary') : '') +
    (!reveal || boardAfterClose ? button('refresh', 'Oppdater resultat', 'ghost') : '') +
    '</div>' + (delayed ? '<p class="help">Du får se ' + delayed + ' når quizen stenger for alle.</p>' : '') +
    '<p class="message" data-message role="status"></p></section>';
}

function resultRank() {
  return resultBoard?.find(entry => entry.nickname === state.player.nickname)?.rank ?? state.player.rank;
}

function resultBoardContents() {
  if (!resultBoard && !resultBoardError) return '<p class="help" role="status">Henter topplisten …</p>';
  const entries = resultBoard ? table(resultBoard, state.player.nickname, shown) : '';
  return entries + (resultBoardError
    ? '<p class="message error" role="status">Kunne ikke hente topplisten. Prøv igjen.</p>' : '');
}

function resultBoardSection() {
  return '<section class="panel result-leaderboard" aria-labelledby="result-leaderboard-heading">' +
    '<div class="game-bar"><h2 id="result-leaderboard-heading">Toppliste</h2>' +
    button('refresh-result-board', 'Oppdater topplisten', 'ghost small') +
    '</div><div data-result-entries>' + resultBoardContents() + '</div></section>';
}

async function refreshResultBoard() {
  if (resultBoardPending) return;
  resultBoardPending = true;
  resultBoardError = false;
  try {
    resultBoard = (await api(endpoint + '/board')).entries;
  } catch {
    resultBoardError = true;
  } finally {
    resultBoardPending = false;
    const entries = root.querySelector('[data-result-entries]');
    if (entries) entries.innerHTML = resultBoardContents();
    const place = root.querySelector('[data-result-rank]');
    if (place) place.textContent = resultRank();
  }
}

function render(focus = false) {
  clearTimeout(timer);
  if (board) {
    root.innerHTML = '<div class="game-bar">' + button('back', '← Tilbake', 'ghost') + button('board', 'Oppdater', 'ghost') +
      '</div><section class="panel"><div class="eyebrow">' + h(board.round.title) +
      '</div><h1>Toppliste</h1>' + table(board.entries, state.player?.nickname, shown) +
      '<p class="message" data-message role="status"></p></section>';
  } else if (review) {
    root.innerHTML = '<div class="game-bar">' + button('back', '← Tilbake', 'ghost') + '</div><section class="panel"><h1>Dine svar</h1>' +
      (review.answers.length ? review.answers.map(answer => '<article class="review-item question-card"><span class="eyebrow">Spørsmål ' +
        (answer.index + 1) + '</span><h2>' + h(answer.text) + '</h2>' + choices(answer.options, answer) + answerDetails(answer) +
        '</article>').join('') : '<p>Du har ingen registrerte svar i runden.</p>') + '</section>';
  } else if (!state.player) {
    root.innerHTML = intro();
    if (state.round.status === 'scheduled') {
      const wait = Math.max(300, Math.min(30_000, state.round.opensAt - state.round.serverNow + 100));
      timer = setTimeout(() => run(() => load()), wait);
    }
  } else if (feedback) {
    root.innerHTML = questionPanel(feedback, feedback);
  } else if (state.question) {
    root.innerHTML = questionPanel(state.question);
    updateClock();
  } else if (state.player.completed) {
    root.innerHTML = result() + (state.round.boardVisible ? resultBoardSection() : '');
    if (state.round.boardVisible && !resultBoard && !resultBoardError) void refreshResultBoard();
  } else if (state.last && state.round.status === 'open') {
    root.innerHTML = questionPanel(state.last, state.last);
  } else {
    root.innerHTML = ready();
  }
  if (focus) focusHeading();
}

function updateClock() {
  const question = state.question;
  const left = Math.max(0, question.deadline - state.round.serverNow - (performance.now() - receivedAt));
  root.querySelector('progress').value = Math.ceil(left);
  root.querySelector('[data-clock]').textContent = Math.ceil(left / 1000) + ' sek';
  root.querySelector('.clock').classList.toggle('urgent', left < 5000);
  if (left > 0 || pending) {
    timer = setTimeout(updateClock, 125);
  } else {
    const submitting = run(() => answer(null, true));
    submitting.then(succeeded => {
      if (!succeeded && state.question && root.querySelector('[data-clock]')) {
        root.querySelector('[data-clock]').textContent = '0 sek';
      }
    });
  }
}

async function load() {
  keep(await api(endpoint));
  feedback = null;
  render();
}

async function answer(choice, timeout = false) {
  const index = state.question.index;
  try {
    keep(await post('/answer', { index, choice, timeout }));
    feedback = state.answer;
    render(true);
  } catch (error) {
    if (['timer_running', 'round_closed', 'question_changed'].includes(error.code)) {
      await load();
      return;
    }
    throw error;
  }
}

async function next() {
  try {
    keep(await post('/next', { index: state.player.position }));
    feedback = null;
    render(true);
  } catch (error) {
    if (['round_closed', 'question_changed'].includes(error.code)) await load();
    else throw error;
  }
}

function showError(error) {
  say(error.message === 'Failed to fetch' ? 'Mistet forbindelsen. Prøv igjen.' : error.message, true);
}

async function run(action) {
  if (pending) return false;
  pending = true;
  try {
    await action();
    return true;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    pending = false;
  }
}

function privateCode() {
  const dialog = document.createElement('dialog');
  dialog.className = 'panel';
  dialog.innerHTML = '<h2>Din personlige kode</h2><p>Denne koden lar deg fortsette samme spill på en annen mobil eller PC. Hold den for deg selv.</p>' +
    '<label>Personlig kode<input class="recovery-code" readonly value="' + h(recoveryCode) + '"></label>' +
    '<div class="actions"><button class="btn secondary" type="button">Kopier</button>' +
    '<form method="dialog"><button class="btn primary">Lukk</button></form></div><p class="message" data-message role="status"></p>';
  document.body.append(dialog);
  dialog.querySelector('button').addEventListener('click', async () => {
    const copied = await copyText(recoveryCode, dialog.querySelector('input'));
    say(copied ? 'Kopiert.' : 'Marker og kopier koden.', false, dialog);
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

root.addEventListener('submit', event => {
  const form = event.target;
  const mode = form.dataset.form;
  if (!mode) return;
  event.preventDefault();
  const data = new FormData(form);
  run(async () => {
    if (mode === 'join') {
      const name = data.get('nickname');
      const saved = savedJoin();
      if (!activeRequest || activeRequest.name !== name) {
        activeRequest = saved?.name === name ? saved : { name, id: crypto.randomUUID().replaceAll('-', '') };
        rememberJoin(activeRequest);
      }
      keep(await post('/join', { nickname: name, requestId: activeRequest.id }));
      rememberJoin(null);
    } else {
      keep(await post('/recover', { code: data.get('code') }));
    }
    render(true);
  });
});

root.addEventListener('click', event => {
  const control = event.target.closest('[data-do]');
  if (!control) return;
  const action = control.dataset.do;
  const actions = {
    next, skip: () => answer(null), answer: () => answer(Number(control.dataset.choice)),
    finish: () => { feedback = null; render(true); },
    board: async () => { board = await api(endpoint + '/board'); render(true); },
    review: async () => { review = await api(endpoint + '/review'); render(true); },
    back: () => { board = null; review = null; render(true); },
    code: async () => {
      if (!recoveryCode) recoveryCode = (await api(endpoint + '/code')).code;
      privateCode();
    },
    refresh: load,
    'refresh-result-board': refreshResultBoard,
    more: () => {
      const firstNewRow = shown;
      shown += 50;
      render();
      const row = root.querySelectorAll('tbody tr')[firstNewRow];
      if (row) { row.tabIndex = -1; row.focus(); }
    },
  };
  if (Object.hasOwn(actions, action)) run(actions[action]);
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
      !state?.question || board || review || feedback || document.querySelector('dialog[open]')) return;
  if (!/^[1-4]$/.test(event.key)) return;
  const choice = Number(event.key) - 1;
  if (choice >= state.question.options.length) return;
  event.preventDefault();
  run(() => answer(choice));
});

window.addEventListener('online', () => {
  if (state && !board && !review) run(load);
});

load().catch(error => {
  root.innerHTML = '<section class="panel full"><h1>Quizen kunne ikke åpnes</h1><p>' + h(error.message) +
    '</p><a class="btn secondary" href="/">Til forsiden</a></section>';
});
