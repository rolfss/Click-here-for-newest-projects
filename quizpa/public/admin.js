import { api, button, copyText, dateLabel, escapeHtml as h, focusHeading, number, root, table } from './shared.js';

const endpoint = '/api/admin';
const request = (path, data, method = 'POST') => api(endpoint + path, { method, data });
const urlSetup = new URLSearchParams(location.hash.slice(1)).get('oppsett');
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

let home = { quizzes: [], rounds: [] };
let session;
let draft;
let currentRound;
let view = 'home';
let dirty = false;
let busy = false;
let previewIndex = 0;
let previewAnswer = null;
let shown = 50;
let roundPin;

function emptyQuestion() {
  return { text: '', options: ['', ''], correct: null, seconds: 20, explanation: '' };
}

function newQuiz() {
  return { title: '', description: '', questions: [emptyQuestion()] };
}

function messageArea(area = 'view') {
  return '<div><span data-admin-status="' + area + '" role="status" aria-atomic="true"></span>' +
    '<span data-admin-error="' + area + '" role="alert" aria-atomic="true"></span></div>';
}

function showMessage(message, error = false, area = 'view') {
  const status = root.querySelector('[data-admin-status="' + area + '"]');
  const alert = root.querySelector('[data-admin-error="' + area + '"]');
  if (!status || !alert) {
    if (area !== 'view') showMessage(message, error);
    return;
  }
  (error ? status : alert).textContent = '';
  const target = error ? alert : status;
  target.parentElement.className = error ? 'message error' : 'message success';
  target.textContent = message;
}

function renderLogin() {
  stopRoundPin();
  const initializing = !session.configured;
  if (!session.ready) {
    root.innerHTML = '<section class="panel full"><h1>Arrangør</h1><p>Arrangørsiden er ikke konfigurert.</p></section>';
    return;
  }
  root.innerHTML = '<section class="panel full"><span class="eyebrow">Quizpå</span><h1>' +
    (initializing ? 'Velg passord for arrangøren' : 'Logg inn som arrangør') + '</h1>' +
    (initializing ? '<p>Velg et passord med minst 16 tegn. Du bruker det neste gang du logger inn.</p>' :
      '<p>Her kan du lage quizer, dele dem med deltakerne og se resultatene.</p>') +
    '<form class="form" data-form="login">' +
    (initializing && !urlSetup ? '<label>Oppsettkode<input name="setup" required maxlength="48" autocomplete="off" spellcheck="false"></label>' : '') +
    '<label>Passord<input type="password" name="password" required maxlength="256" ' +
    (initializing ? 'minlength="16" autocomplete="new-password"' : 'autocomplete="current-password"') +
    '></label><div class="actions"><button class="btn primary" type="submit">' +
    (initializing ? 'Lagre passord' : 'Logg inn') + '</button></div></form>' +
    messageArea() + '</section>';
}

const statuses = { open: 'Åpen', closed: 'Avsluttet', scheduled: 'Planlagt' };

function sidebarItem(label, detail, action, id, selected) {
  return '<button type="button" class="side-item' + (selected ? ' active' : '') + '" data-do="' +
    action + '" data-id="' + h(id) + '"' + (selected ? ' aria-current="true"' : '') + '><strong>' +
    h(label) + '</strong><small>' + h(detail) + '</small></button>';
}

function sidebar() {
  return '<aside class="panel side" aria-label="Quizer og runder"><h2>Lagrede quizer</h2>' +
    '<div class="side-items">' + (home.quizzes.length ? home.quizzes.map(quiz =>
      sidebarItem(quiz.title, quiz.questionCount + ' spørsmål', 'edit', quiz.id, draft?.id === quiz.id &&
        ['edit', 'publish', 'preview'].includes(view))).join('') : '<p class="help">Ingen lagrede quizer ennå.</p>') +
    '</div><h2>Publiserte runder</h2><div class="side-items">' + (home.rounds.length ? home.rounds.map(round =>
      sidebarItem(round.title, statuses[round.status] + ' · ' + number.format(round.completed) + ' fullført' +
        ' · ' + dateLabel(round.opensAt),
      'results', round.code, view === 'results' && currentRound?.round.code === round.code)).join('')
      : '<p class="help">Ingen publiserte runder ennå.</p>') + '</div></aside>';
}

function questionEditor(question, index) {
  const allowRemove = question.options.length > 2;
  const rows = question.options.map((answer, option) => '<div class="option-editor"><label>Riktig<input type="radio" name="right-' +
    index + '" value="' + option + '" aria-label="Merk svar ' + (option + 1) + ' som riktig" required ' +
    (option === question.correct ? 'checked' : '') + '></label><label>Svar ' + (option + 1) + '<input name="option-' + index +
    '-' + option + '" required maxlength="140" value="' + h(answer) + '"></label>' +
    (allowRemove ? button('remove-option', 'Fjern', 'ghost small', 'data-index="' + index + '" data-option="' + option +
      '" aria-label="Fjern svar ' + (option + 1) + '"') : '') + '</div>').join('');
  return '<fieldset class="fieldset"><legend>Spørsmål ' + (index + 1) + '</legend><div class="question-editor">' +
    '<label>Spørsmålstekst<input name="text-' + index + '" required maxlength="240" value="' + h(question.text) + '"></label>' +
    '<div><p class="help">Skriv inn 2–4 svar. Merk ett av dem som riktig.</p>' + rows + '</div>' +
    (question.options.length < 4 ? '<div class="actions">' + button('add-option', 'Legg til svaralternativ', 'secondary',
      'data-index="' + index + '"') + '</div>' : '') +
    '<div class="grid-form"><label>Svartid (sekunder)<input type="number" name="seconds-' + index +
    '" required min="5" max="120" value="' + question.seconds + '"><span class="help">Velg mellom 5 og 120 sekunder.</span></label>' +
    '<label>Forklaring til fasiten (valgfritt)<input name="explanation-' + index +
    '" maxlength="500" value="' + h(question.explanation) + '"><span class="help">Vises sammen med riktig svar.</span></label></div>' +
    (draft.questions.length > 1 ? '<div class="actions">' + button('remove-question', 'Fjern spørsmålet', 'ghost small',
      'data-index="' + index + '"') + '</div>' : '') + '</div></fieldset>';
}

function renderEdit() {
  return '<h2>' + (draft.id ? 'Rediger quiz' : 'Lag en quiz') + '</h2>' +
    '<p>Legg inn spørsmål og velg riktig svar på hvert av dem. Velg <strong>Lagre quiz</strong> nederst når du er klar.</p>' +
    '<form class="form" data-form="quiz">' +
    '<label>Quiznavn<input name="title" required maxlength="90" value="' + h(draft.title) + '"></label>' +
    '<label>Beskrivelse (valgfritt)<textarea name="description" maxlength="260">' + h(draft.description) +
    '</textarea><span class="help">Deltakerne ser denne teksten før de starter.</span></label>' +
    draft.questions.map(questionEditor).join('') + '<div class="actions">' +
    (draft.questions.length < 40 ? button('add-question', 'Legg til spørsmål', 'secondary') : '') +
    '</div><p class="help">Når du har lagret quizen, kan du gjøre klar en runde og få en lenke til deltakerne.</p>' +
    '<div class="actions"><button class="btn primary" type="submit">Lagre quiz</button>' +
    button('preview', 'Forhåndsvis som deltaker', 'secondary') + (draft.id ? button('publish', 'Gjør klar en runde', 'secondary') : '') +
    '</div>' + messageArea() + '</form>';
}

function renderPublish() {
  return '<h2>Gjør klar en runde</h2><p>' + h(draft.title) + ' · ' + draft.questions.length + ' spørsmål</p>' +
    '<p>Hver runde får sin egen deltakerlenke og toppliste. Runden bruker spørsmålene slik de er når du publiserer.</p>' +
    '<form class="form" data-form="publish"><div class="grid-form">' +
    '<label>Åpningstid (valgfritt)<input name="opensAt" type="datetime-local">' +
    '<span class="help">Tomt felt betyr at runden åpner med én gang.</span></label>' +
    '<label>Svarfrist (valgfritt)<input name="closesAt" type="datetime-local">' +
    '<span class="help">Tomt felt betyr at runden er åpen til du avslutter den.</span></label></div>' +
    '<p class="help">Alle klokkeslett er i Oslo-tid.</p>' +
    '<div class="grid-form"><label>Når får deltakerne se fasiten?<select name="feedbackMode"><option value="immediate">Etter hvert svar</option>' +
    '<option value="after_close">Etter at runden er avsluttet</option></select></label>' +
    '<label>Når får deltakerne se topplisten?<select name="boardMode"><option value="always">Med én gang</option>' +
    '<option value="after_close">Etter at runden er avsluttet</option><option value="hidden">Bare arrangøren ser topplisten</option></select></label></div>' +
    '<div class="actions"><button class="btn primary" type="submit">Publiser runde</button>' +
    button('back-edit', 'Tilbake til quizen', 'secondary') + '</div>' + messageArea() + '</form>';
}

function renderPreview() {
  const question = draft.questions[previewIndex];
  const showAnswer = previewAnswer !== null && question.correct !== null;
  return '<div class="game-bar"><span class="eyebrow">Forhåndsvisning · ' + question.seconds +
    ' sekunder</span>' + button('back-edit', 'Tilbake til quizen', 'secondary') + '</div>' +
    '<p class="help">Prøv et svar for å se hvordan spørsmålet ser ut for deltakerne.</p><div class="question-card">' +
    '<span class="eyebrow">Spørsmål ' + (previewIndex + 1) + ' av ' + draft.questions.length + '</span>' +
    '<h2>' + h(question.text || 'Spørsmålstekst') + '</h2><div class="choices">' +
    question.options.map((option, index) => '<button type="button" class="choice' +
      (showAnswer && index === question.correct ? ' correct' : '') +
      (showAnswer && previewAnswer === index && index !== question.correct ? ' incorrect' : '') +
      '" data-do="preview-answer" data-option="' + index + '"><b aria-hidden="true">' + (index + 1) +
      '</b><span>' + h(option || 'Svaralternativ ' + (index + 1)) + '</span>' +
      (showAnswer && index === question.correct ? '<span class="mark">✓ Riktig</span>' : '') + '</button>').join('') +
    '</div>' + (showAnswer && question.explanation ? '<div class="feedback">' + h(question.explanation) + '</div>' : '') +
    (previewAnswer !== null && !showAnswer ? '<p class="help">Merk riktig svar i quizen for å prøve fasiten.</p>' : '') +
    '<div class="question-footer">' + button('preview-previous', 'Forrige spørsmål', 'secondary', previewIndex === 0 ? 'disabled' : '') +
    button('preview-next', 'Neste spørsmål', 'primary', previewIndex + 1 === draft.questions.length ? 'disabled' : '') + '</div></div>' + messageArea();
}

function playUrl(round) {
  return new URL('/spill/' + round.code, location.origin).href;
}

function teamsMessage(round) {
  return 'Bli med på ' + round.title + '! Åpne lenken og velg et kallenavn.' +
    (round.status === 'scheduled' ? ' Runden åpner ' + dateLabel(round.opensAt) + '.' : '') +
    (round.closesAt !== null ? ' Svarfrist ' + dateLabel(round.closesAt) + '.' : '') + '\n\n' + playUrl(round);
}

function renderShare(round) {
  const qr = endpoint + '/rounds/' + round.code + '/qr';
  return '<section class="share-box"><h3>Del runden med deltakerne</h3>' +
    '<p>Kopier Teams-meldingen og lim den inn i en chat eller kanal. Du kan også dele bare lenken.</p>' +
    '<label>Deltakerlenke<input readonly data-link value="' + h(playUrl(round)) + '"></label>' +
    '<div class="actions">' + button('copy-teams', 'Kopier Teams-melding', 'primary') +
    button('copy-link', 'Kopier deltakerlenke') + '</div>' + messageArea('share') +
    '<details data-teams-details><summary>Se Teams-meldingen</summary>' +
    '<label>Melding til deltakerne<textarea rows="5" readonly data-teams-message>' + h(teamsMessage(round)) +
    '</textarea></label></details><div class="share-grid"><div class="qr-panel"><h3>QR-kode</h3>' +
    '<p class="help">Deltakerne kan skanne koden med mobilkameraet.</p>' +
    '<img src="' + qr + '" width="152" height="152" alt="QR-kode for spill-lenken">' +
    '<a class="btn secondary" href="' + qr + '?download=1" download>Last ned QR-kode</a></div>' +
    '<div class="pin-panel" data-pin-panel><h3>Spillkode</h3>' +
    '<p class="help" id="pin-help">Deltakerne velger Bli med og skriver inn den åttesifrede koden. Koden byttes hvert andre minutt.</p>' +
    '<label>Gjeldende kode<input class="round-pin" data-pin readonly inputmode="numeric" ' +
    'aria-describedby="pin-help pin-countdown"></label><p class="pin-countdown help" data-pin-message id="pin-countdown"></p>' +
    '<div class="actions">' + button('copy-pin', 'Kopier spillkoden', 'secondary', 'disabled') +
    '<a class="btn ghost" href="/bli-med" target="_blank" rel="noopener">Åpne Bli med i ny fane</a></div>' +
    messageArea('pin') + '</div></div></section>';
}

function stopRoundPin() {
  clearTimeout(roundPin?.timer);
  roundPin = undefined;
}

function pinTimeLeft(pin) {
  return pin.expiresAt - performance.now();
}

function drawRoundPin(pin) {
  if (pin !== roundPin) return;
  const panel = root.querySelector('[data-pin-panel]');
  if (!panel) return;
  clearTimeout(pin.timer);
  const now = performance.now();
  const left = pinTimeLeft(pin);
  const active = pin.code && left > 0;
  const field = panel.querySelector('[data-pin]');
  if (field.value !== (active ? pin.code : '')) field.value = active ? pin.code : '';
  panel.querySelector('[data-do=copy-pin]').disabled = !active;
  let message;
  if (active) {
    const seconds = Math.ceil(left / 1000);
    const clock = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    message = 'Byttes om ' + clock;
    pin.timer = setTimeout(() => drawRoundPin(pin), Math.max(25, left - (seconds - 1) * 1000));
  } else {
    message = pin.error || (pin.status === 'scheduled' ? 'Koden vises når runden åpner.' :
      pin.status === 'closed' ? 'Runden er avsluttet.' : 'Henter spillkode …');
    if (!pin.loading && Number.isFinite(pin.refreshAt)) {
      pin.timer = setTimeout(() => refreshRoundPin(pin), Math.max(0, pin.refreshAt - now));
    }
  }
  const note = panel.querySelector('[data-pin-message]');
  if (note.textContent !== message) note.textContent = message;
  const badge = root.querySelector('[data-round-status]');
  if (badge && Object.hasOwn(statuses, pin.status) && badge.textContent !== statuses[pin.status]) {
    badge.className = 'status-tag ' + pin.status;
    badge.textContent = statuses[pin.status];
  }
}

async function refreshRoundPin(pin) {
  if (pin !== roundPin || pin.loading) return;
  pin.loading = true;
  drawRoundPin(pin);
  const startedAt = performance.now();
  try {
    const reply = await api(endpoint + '/rounds/' + pin.roundCode + '/join-code');
    if (pin !== roundPin) return;
    const now = performance.now();
    const serverNow = reply.serverNow + (now - startedAt) / 2;
    pin.error = '';
    pin.status = reply.status;
    pin.code = pin.status === 'open' && typeof reply.code === 'string' && /^\d{8}$/.test(reply.code) &&
      Number.isFinite(reply.expiresAt) ? reply.code : '';
    pin.expiresAt = pin.code ? now + reply.expiresAt - serverNow : 0;
    if (pin.code) {
      pin.refreshAt = Math.max(pin.expiresAt, now + 150);
    } else if (pin.status === 'scheduled' && Number.isFinite(reply.opensAt)) {
      pin.refreshAt = now + Math.min(60_000, Math.max(250, reply.opensAt - serverNow));
    } else {
      pin.refreshAt = pin.status === 'closed' ? Infinity : now + 5000;
    }
  } catch (error) {
    if (pin !== roundPin) return;
    if (error.status === 401) {
      pin.error = 'Logg inn igjen for å vise koden.';
      pin.refreshAt = Infinity;
    } else {
      pin.error = 'Spillkoden kunne ikke hentes. Prøver igjen …';
      pin.refreshAt = performance.now() + 5000;
    }
  } finally {
    pin.loading = false;
    drawRoundPin(pin);
  }
}

function syncRoundPin() {
  if (view !== 'results') {
    stopRoundPin();
    return;
  }
  const round = currentRound.round;
  if (roundPin?.roundCode !== round.code || (round.status === 'closed' && roundPin.status !== 'closed')) {
    stopRoundPin();
    roundPin = { roundCode: round.code, status: round.status, expiresAt: 0, code: '', refreshAt: Infinity };
    if (round.status !== 'closed') void refreshRoundPin(roundPin);
  }
  drawRoundPin(roundPin);
}

function renderResults() {
  const { round, entries } = currentRound;
  return '<div class="page-heading"><div><span data-round-status class="status-tag ' + round.status + '">' + statuses[round.status] +
    '</span><h2>' + h(round.title) + '</h2>' +
    (round.status === 'scheduled' ? '<p class="help">Åpner ' + dateLabel(round.opensAt) + '</p>' : '') +
    (round.closesAt !== null ? '<p class="help">' + (round.status === 'closed' ? 'Avsluttet ' : 'Svarfrist ') +
      dateLabel(round.closesAt) + '</p>' : '') + '</div></div>' + messageArea() +
    renderShare(round) + '<div class="page-heading results"><div><h2>Resultater</h2><p class="help">' + number.format(entries.length) +
    ' har fullført</p></div><div class="actions">' + button('refresh-results', 'Oppdater resultater', 'secondary', 'data-id="' + round.code + '"') +
    '<a class="btn secondary" href="' + endpoint + '/rounds/' + round.code + '/csv">Last ned resultater (CSV)</a></div></div>' +
    messageArea('results') + table(entries, '', shown) + (round.status === 'closed' ? '' : '<div class="actions">' +
      button('close', 'Avslutt runden', 'danger', 'data-id="' + round.code + '"') + '</div>' + messageArea('close'));
}

function render(focus = false) {
  const panels = {
    home: () => '<h2>Kom i gang</h2><ol><li><strong>Lag en quiz.</strong> Skriv spørsmål og merk riktig svar.</li>' +
      '<li><strong>Publiser en runde.</strong> Velg når deltakerne kan spille, og få en lenke.</li>' +
      '<li><strong>Del runden.</strong> Send lenken til deltakerne, for eksempel i Teams.</li></ol>' +
      '<div class="actions">' + button('new', 'Lag ny quiz', 'primary') + button('demo', 'Bruk en eksempelquiz') +
      '</div><p class="help">Åpne en lagret quiz for å redigere den, eller velg en publisert runde for å se resultatene.</p>' + messageArea(),
    edit: renderEdit, publish: renderPublish, preview: renderPreview, results: renderResults,
  };
  root.innerHTML = '<div class="page-heading"><div><h1>Arrangør</h1></div><div class="actions">' +
    (view === 'home' ? '' : button('home', 'Til oversikten') + button('new', 'Lag ny quiz', 'primary')) +
    button('logout', 'Logg ut', 'ghost small') + '</div></div><div class="admin-layout">' + sidebar() +
    '<section class="panel work-panel">' + panels[view]() + '</section></div>';
  syncRoundPin();
  if (focus) {
    const heading = root.querySelector('.work-panel h2');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    else focusHeading();
  }
}

function syncDraft(form = root.querySelector('[data-form=quiz]')) {
  if (!form) return;
  const data = new FormData(form);
  draft.title = data.get('title');
  draft.description = data.get('description');
  draft.questions = draft.questions.map((question, index) => {
    const correct = data.get('right-' + index);
    return {
      text: data.get('text-' + index), explanation: data.get('explanation-' + index),
      seconds: Number(data.get('seconds-' + index)), correct: correct === null ? null : Number(correct),
      options: question.options.map((_, option) => data.get('option-' + index + '-' + option)),
    };
  });
}

async function overview() {
  home = await api(endpoint + '/overview');
}

async function load() {
  session = await api(endpoint + '/session');
  if (session.authenticated) {
    await overview();
    render();
  } else {
    renderLogin();
  }
}

async function editQuiz(id) {
  draft = await api(endpoint + '/quizzes/' + id);
  view = 'edit';
  dirty = false;
  render(true);
}

async function showResults(id, focus = true) {
  if (currentRound?.round.code !== id) shown = 50;
  currentRound = await api(endpoint + '/rounds/' + id);
  view = 'results';
  dirty = false;
  render(focus);
}

async function run(action, area = 'view') {
  if (busy) return;
  busy = true;
  try {
    await action();
  } catch (error) {
    if (error.code === 'admin_required' || error.code === 'already_configured') {
      await load();
    }
    showMessage(error.message === 'Failed to fetch' ? 'Mistet forbindelsen. Prøv igjen.' : error.message, true, area);
  } finally {
    busy = false;
  }
}

root.addEventListener('input', event => {
  if (event.target.closest('[data-form=quiz]')) dirty = true;
});

root.addEventListener('submit', event => {
  const form = event.target;
  const type = form.dataset.form;
  if (!type) return;
  event.preventDefault();
  run(async () => {
    if (type === 'login') {
      const formData = new FormData(form);
      await request('/session', { setup: urlSetup ?? formData.get('setup'), password: formData.get('password') });
      await overview();
      view = 'home';
      render(true);
    } else if (type === 'quiz') {
      syncDraft(form);
      draft = draft.id ? await request('/quizzes/' + draft.id, draft, 'PUT') : await request('/quizzes', draft);
      dirty = false;
      await overview();
      render();
      root.querySelector('[data-form=quiz] button[type=submit]').focus();
      showMessage('Quizen er lagret. Velg Gjør klar en runde når du vil dele den.');
    } else if (type === 'publish') {
      const data = Object.fromEntries(new FormData(form));
      const round = await request('/rounds', { ...data, quizId: draft.id, revision: draft.revision });
      await overview();
      await showResults(round.code);
      showMessage('Runden er publisert. Du kan nå dele deltakerlenken.');
    }
  });
});

window.addEventListener('beforeunload', event => {
  if (dirty) event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && roundPin) drawRoundPin(roundPin);
});

root.addEventListener('click', event => {
  const control = event.target.closest('[data-do]');
  if (!control) return;
  const { do: action, id, index: indexValue, option: optionValue } = control.dataset;
  const index = Number(indexValue);
  const option = Number(optionValue);
  if (dirty && ['home', 'new', 'edit', 'results', 'logout'].includes(action) && !window.confirm('Vil du gå videre uten å lagre endringene?')) return;
  const actions = {
    home: () => { view = 'home'; dirty = false; render(true); },
    new: () => { draft = newQuiz(); view = 'edit'; dirty = false; render(); root.querySelector('[name=title]').focus(); },
    demo: async () => {
      draft = await request('/quizzes/demo', {});
      await overview();
      view = 'edit';
      render();
      root.querySelector('[data-do=publish]').focus();
      showMessage('Eksempelquizen er lagret. Du kan redigere den eller gjøre klar en runde.');
    },
    edit: () => editQuiz(id),
    results: () => showResults(id),
    'refresh-results': async () => {
      await showResults(id, false);
      root.querySelector('[data-do=refresh-results]').focus();
      showMessage('Resultatene er oppdatert.', false, 'results');
    },
    logout: async () => {
      await request('/session', undefined, 'DELETE');
      dirty = false;
      draft = null;
      await load();
      root.querySelector('[name=password]')?.focus();
    },
    'add-question': () => {
      syncDraft();
      draft.questions.push(emptyQuestion());
      dirty = true;
      render();
      root.querySelector('[name=text-' + (draft.questions.length - 1) + ']').focus();
    },
    'remove-question': () => {
      syncDraft();
      draft.questions.splice(index, 1);
      dirty = true;
      render();
      root.querySelector('[name=text-' + Math.min(index, draft.questions.length - 1) + ']').focus();
    },
    'add-option': () => {
      syncDraft();
      const item = draft.questions[index];
      item.options.push('');
      dirty = true;
      render();
      root.querySelector('[name=option-' + index + '-' + (item.options.length - 1) + ']').focus();
    },
    'remove-option': () => {
      syncDraft();
      const item = draft.questions[index];
      item.options.splice(option, 1);
      if (item.correct === option) item.correct = null;
      else if (item.correct !== null && item.correct > option) item.correct--;
      dirty = true;
      render();
      root.querySelector('[name=option-' + index + '-' + Math.min(option, item.options.length - 1) + ']').focus();
    },
    preview: () => { syncDraft(); view = 'preview'; previewIndex = 0; previewAnswer = null; render(true); },
    'back-edit': () => {
      const previousAction = view === 'preview' ? 'preview' : 'publish';
      view = 'edit';
      render();
      root.querySelector('[data-do=' + previousAction + ']').focus();
    },
    'preview-answer': () => { previewAnswer = option; render(); root.querySelector('[data-option="' + option + '"]').focus(); },
    'preview-previous': () => { previewIndex--; previewAnswer = null; render(true); },
    'preview-next': () => { previewIndex++; previewAnswer = null; render(true); },
    publish: () => {
      if (dirty) { showMessage('Velg Lagre quiz før du gjør klar en runde.', true); return; }
      view = 'publish';
      render(true);
    },
    'copy-link': async () => {
      const copied = await copyText(playUrl(currentRound.round), root.querySelector('[data-link]'));
      showMessage(copied ? 'Deltakerlenken er kopiert.' : 'Kopier den markerte deltakerlenken.', !copied, 'share');
    },
    'copy-pin': async () => {
      if (!roundPin?.code || pinTimeLeft(roundPin) <= 0) {
        showMessage('Koden har utløpt. Vent på neste kode.', true, 'pin');
        return;
      }
      const copied = await copyText(roundPin.code, root.querySelector('[data-pin]'));
      showMessage(copied ? 'Spillkoden er kopiert.' : 'Kopier den markerte spillkoden.', !copied, 'pin');
    },
    'copy-teams': async () => {
      const message = root.querySelector('[data-teams-message]');
      const copied = await copyText(message.value);
      if (!copied) {
        root.querySelector('[data-teams-details]').open = true;
        message.focus();
        message.select();
      }
      showMessage(copied ? 'Meldingen er kopiert. Lim den inn i Teams.' : 'Kopier den markerte meldingen.', !copied, 'share');
    },
    close: async () => {
      if (!window.confirm('Avslutte runden nå? Etterpå kan ingen sende inn flere svar.')) return;
      await request('/rounds/' + id + '/close', {});
      await overview();
      await showResults(id);
      showMessage('Runden er avsluttet.');
    },
    more: () => {
      const firstNewRow = shown;
      shown += 50;
      render();
      const row = root.querySelectorAll('tbody tr')[firstNewRow];
      if (row) { row.tabIndex = -1; row.focus(); }
    },
  };
  const messageAreas = { 'copy-link': 'share', 'copy-teams': 'share', 'copy-pin': 'pin', 'refresh-results': 'results', close: 'close' };
  if (Object.hasOwn(actions, action)) run(actions[action], messageAreas[action]);
});

load().catch(error => {
  root.innerHTML = '<section class="panel full"><h1>Arrangørsiden kunne ikke åpnes</h1><p>' + h(error.message) +
    '</p><a href="/arrangor" class="btn secondary">Prøv igjen</a></section>';
});
