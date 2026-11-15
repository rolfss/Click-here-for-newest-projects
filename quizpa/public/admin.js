import { api, button, copyText, dateLabel, escapeHtml as h, focusHeading, number, root, say, table } from './shared.js';

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

function emptyQuestion() {
  return { text: '', options: ['', '', '', ''], correct: 0, seconds: 20, explanation: '' };
}

function newQuiz() {
  return { title: '', description: '', questions: [emptyQuestion()] };
}

function renderLogin() {
  const initializing = !session.configured;
  if (!session.ready) {
    root.innerHTML = '<section class="panel full"><h1>Arrangør</h1><p>Arrangørsiden er ikke konfigurert.</p></section>';
    return;
  }
  root.innerHTML = '<section class="panel full"><span class="eyebrow">Quizpå</span><h1>' +
    (initializing ? 'Sett opp arrangør' : 'Logg inn som arrangør') + '</h1>' +
    (initializing ? '<p>Velg et passord med minst 16 tegn.</p>' : '<p>Administrer quizer, runder og resultater.</p>') +
    '<form class="form" data-form="login">' +
    (initializing && !urlSetup ? '<label>Oppsettkode<input name="setup" required maxlength="48" autocomplete="off" spellcheck="false"></label>' : '') +
    '<label>Passord<input type="password" name="password" required maxlength="256" ' +
    (initializing ? 'minlength="16" autocomplete="new-password"' : 'autocomplete="current-password"') +
    '></label><div class="actions"><button class="btn primary" type="submit">' +
    (initializing ? 'Lagre passord' : 'Logg inn') + '</button></div></form>' +
    '<p class="message" data-message role="status"></p></section>';
}

const statuses = { open: 'Åpen', closed: 'Avsluttet', scheduled: 'Planlagt' };

function sidebarItem(label, detail, action, id, selected) {
  return '<button type="button" class="side-item' + (selected ? ' active' : '') + '" data-do="' +
    action + '" data-id="' + h(id) + '"' + (selected ? ' aria-current="true"' : '') + '><strong>' +
    h(label) + '</strong><small>' + h(detail) + '</small></button>';
}

function sidebar() {
  return '<aside class="panel side" aria-label="Quizzer og runder"><h2>Quizzer</h2>' +
    '<div class="side-items">' + (home.quizzes.length ? home.quizzes.map(quiz =>
      sidebarItem(quiz.title, quiz.questionCount + ' spørsmål', 'edit', quiz.id, draft?.id === quiz.id &&
        ['edit', 'publish', 'preview'].includes(view))).join('') : '<p class="help">Ingen lagrede quizzer.</p>') +
    '</div><h2>Runder</h2><div class="side-items">' + (home.rounds.length ? home.rounds.map(round =>
      sidebarItem(round.title, statuses[round.status] + ' · ' + number.format(round.completed) + ' fullført' +
        (round.status === 'scheduled' ? ' · ' + dateLabel(round.opensAt) : ''),
      'results', round.code, view === 'results' && currentRound?.round.code === round.code)).join('')
      : '<p class="help">Ingen publiserte runder.</p>') + '</div></aside>';
}

function questionEditor(question, index) {
  const allowRemove = question.options.length > 2;
  const rows = question.options.map((answer, option) => '<div class="option-editor"><input type="radio" name="right-' +
    index + '" value="' + option + '" aria-label="Marker alternativ ' + (option + 1) + ' som riktig" ' +
    (option === question.correct ? 'checked' : '') + '><input name="option-' + index + '-' + option +
    '" aria-label="Svaralternativ ' + (option + 1) + ' i spørsmål ' + (index + 1) +
    '" placeholder="Svaralternativ ' + (option + 1) + '" required maxlength="140" value="' + h(answer) + '">' +
    (allowRemove ? button('remove-option', 'Fjern', 'ghost small', 'data-index="' + index + '" data-option="' + option +
      '" aria-label="Fjern alternativ ' + (option + 1) + '"') : '') + '</div>').join('');
  return '<fieldset class="fieldset"><legend>Spørsmål ' + (index + 1) + '</legend><div class="question-editor">' +
    '<label>Spørsmål<input name="text-' + index + '" required maxlength="240" value="' + h(question.text) + '"></label>' +
    '<div><p class="help">Marker riktig svar til venstre.</p>' + rows + '</div>' +
    (question.options.length < 4 ? '<div class="actions">' + button('add-option', 'Legg til svaralternativ', 'ghost small',
      'data-index="' + index + '"') + '</div>' : '') +
    '<div class="grid-form"><label>Tid i sekunder<input type="number" name="seconds-' + index + '" required min="5" max="120" value="' +
    question.seconds + '"></label><label>Forklaring (valgfri)<input name="explanation-' + index +
    '" maxlength="500" value="' + h(question.explanation) + '"></label></div>' +
    (draft.questions.length > 1 ? '<div class="actions">' + button('remove-question', 'Fjern spørsmålet', 'ghost small',
      'data-index="' + index + '"') + '</div>' : '') + '</div></fieldset>';
}

function renderEdit() {
  return '<h2>' + (draft.id ? 'Rediger quiz' : 'Ny quiz') + '</h2><form class="form" data-form="quiz">' +
    '<label>Quiznavn<input name="title" required maxlength="90" value="' + h(draft.title) + '"></label>' +
    '<label>Beskrivelse (valgfri)<textarea name="description" maxlength="260">' + h(draft.description) + '</textarea></label>' +
    draft.questions.map(questionEditor).join('') + '<div class="actions">' +
    (draft.questions.length < 40 ? button('add-question', '+ Legg til spørsmål', 'secondary') : '') +
    '</div><div class="actions"><button class="btn primary" type="submit">Lagre quiz</button>' +
    button('preview', 'Forhåndsvis', 'secondary') + (draft.id ? button('publish', 'Publiser runde', 'secondary') : '') +
    '</div></form>';
}

function renderPublish() {
  return '<h2>Publiser runde</h2><p>' + h(draft.title) + ' · ' + draft.questions.length + ' spørsmål</p>' +
    '<form class="form" data-form="publish"><div class="grid-form">' +
    '<label>Åpner (Oslo-tid)<input name="opensAt" type="datetime-local"></label>' +
    '<label>Frist (Oslo-tid)<input name="closesAt" type="datetime-local"></label></div>' +
    '<p class="help">La feltene stå tomme hvis runden skal åpne nå og være åpen til du avslutter den.</p>' +
    '<div class="grid-form"><label>Vis fasit<select name="feedbackMode"><option value="immediate">Etter hvert svar</option>' +
    '<option value="after_close">Etter at runden er avsluttet</option></select></label>' +
    '<label>Vis toppliste<select name="boardMode"><option value="always">Mens runden pågår</option>' +
    '<option value="after_close">Etter at runden er avsluttet</option><option value="hidden">Kun for arrangør</option></select></label></div>' +
    '<div class="actions"><button class="btn primary" type="submit">Publiser runden</button>' +
    button('back-edit', 'Tilbake', 'ghost') + '</div></form>';
}

function renderPreview() {
  const question = draft.questions[previewIndex];
  return '<div class="game-bar"><span class="eyebrow">Forhåndsvisning · ' + question.seconds +
    ' sek</span>' + button('back-edit', 'Tilbake til redigering', 'ghost small') + '</div><div class="question-card">' +
    '<span class="eyebrow">Spørsmål ' + (previewIndex + 1) + ' av ' + draft.questions.length + '</span>' +
    '<h2>' + h(question.text || 'Spørsmålstekst') + '</h2><div class="choices">' +
    question.options.map((option, index) => '<button type="button" class="choice' +
      (previewAnswer !== null && index === question.correct ? ' correct' : '') +
      (previewAnswer === index && index !== question.correct ? ' incorrect' : '') +
      '" data-do="preview-answer" data-option="' + index + '"><b aria-hidden="true">' + (index + 1) +
      '</b><span>' + h(option || 'Svaralternativ ' + (index + 1)) + '</span>' +
      (previewAnswer !== null && index === question.correct ? '<span class="mark">✓ Riktig</span>' : '') + '</button>').join('') +
    '</div>' + (previewAnswer !== null && question.explanation ? '<div class="feedback">' + h(question.explanation) + '</div>' : '') +
    '<div class="question-footer">' + button('preview-previous', 'Forrige', 'secondary', previewIndex === 0 ? 'disabled' : '') +
    button('preview-next', 'Neste', 'primary', previewIndex + 1 === draft.questions.length ? 'disabled' : '') + '</div></div>';
}

function playUrl(round) {
  return new URL('/spill/' + round.code, location.origin).href;
}

function renderResults() {
  const { round, entries } = currentRound;
  return '<div class="page-heading"><div><span class="status-tag ' + round.status + '">' + statuses[round.status] +
    '</span><h2>' + h(round.title) + '</h2>' + (round.closesAt !== null ? '<p class="help">' +
      (round.status === 'closed' ? 'Avsluttet ' : 'Frist ') + dateLabel(round.closesAt) + '</p>' : '') +
    '</div>' + button('results', 'Oppdater', 'ghost small', 'data-id="' + round.code + '"') + '</div>' +
    '<div class="share-box"><label>Spill-lenke<input readonly data-link value="' + h(playUrl(round)) + '"></label>' +
    '<div class="actions">' + button('copy-link', 'Kopier lenken', 'primary') + button('copy-teams', 'Kopier Teams-melding') +
    '</div></div><div class="page-heading results"><div><h2>Resultater</h2><p class="help">' + number.format(entries.length) +
    ' fullført</p></div><a class="btn secondary small" href="' + endpoint + '/rounds/' + round.code + '/csv">Last ned CSV</a></div>' +
    table(entries, '', shown) + (round.status === 'closed' ? '' : '<div class="actions">' +
      button('close', 'Avslutt runden', 'danger', 'data-id="' + round.code + '"') + '</div>');
}

function render(focus = false) {
  const panels = {
    home: () => '<h2>Kom i gang</h2><p>Lag en quiz, publiser en runde og kopier lenken til Teams.</p>' +
      '<div class="actions">' + button('new', 'Ny quiz', 'primary') + button('demo', 'Bruk demoquizen') + '</div>',
    edit: renderEdit, publish: renderPublish, preview: renderPreview, results: renderResults,
  };
  root.innerHTML = '<div class="page-heading"><div><h1>Arrangør</h1></div><div class="actions">' +
    (view === 'home' ? '' : button('new', '+ Ny quiz', 'primary small')) +
    button('logout', 'Logg ut', 'ghost small') + '</div></div><div class="admin-layout">' + sidebar() +
    '<section class="panel work-panel">' + panels[view]() +
    '<p class="message" data-message role="status"></p></section></div>';
  if (focus) {
    const heading = root.querySelector('.work-panel h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    else focusHeading();
  }
}

function syncDraft(form = root.querySelector('[data-form=quiz]')) {
  if (!form) return;
  const data = new FormData(form);
  draft.title = data.get('title');
  draft.description = data.get('description');
  draft.questions = draft.questions.map((question, index) => ({
    text: data.get('text-' + index), explanation: data.get('explanation-' + index),
    seconds: Number(data.get('seconds-' + index)), correct: Number(data.get('right-' + index)),
    options: question.options.map((_, option) => data.get('option-' + index + '-' + option)),
  }));
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

async function showResults(id) {
  if (currentRound?.round.code !== id) shown = 50;
  currentRound = await api(endpoint + '/rounds/' + id);
  view = 'results';
  dirty = false;
  render(true);
}

async function run(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
  } catch (error) {
    if (error.code === 'admin_required' || error.code === 'already_configured') {
      await load();
    }
    say(error.message === 'Failed to fetch' ? 'Mistet forbindelsen. Prøv igjen.' : error.message, true);
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
      say('Quizen er lagret.');
    } else if (type === 'publish') {
      const data = Object.fromEntries(new FormData(form));
      const round = await request('/rounds', { ...data, quizId: draft.id, revision: draft.revision });
      await overview();
      await showResults(round.code);
      say('Runden er publisert. Spill-lenken er klar.');
    }
  });
});

window.addEventListener('beforeunload', event => {
  if (dirty) event.preventDefault();
});

root.addEventListener('click', event => {
  const control = event.target.closest('[data-do]');
  if (!control) return;
  const { do: action, id, index: indexValue, option: optionValue } = control.dataset;
  const index = Number(indexValue);
  const option = Number(optionValue);
  if (dirty && ['new', 'edit', 'results', 'logout'].includes(action) && !window.confirm('Vil du gå videre uten å lagre endringene?')) return;
  const actions = {
    new: () => { draft = newQuiz(); view = 'edit'; dirty = false; render(true); root.querySelector('[name=title]').focus(); },
    demo: async () => {
      draft = await request('/quizzes/demo', {});
      await overview();
      view = 'edit';
      render(true);
      say('Demoquizen er lagret og klar til publisering.');
    },
    edit: () => editQuiz(id),
    results: () => showResults(id),
    logout: async () => { await request('/session', undefined, 'DELETE'); dirty = false; draft = null; await load(); },
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
      if (item.correct === option) item.correct = 0;
      else if (item.correct > option) item.correct--;
      dirty = true;
      render();
      root.querySelector('[name=option-' + index + '-' + Math.min(option, item.options.length - 1) + ']').focus();
    },
    preview: () => { syncDraft(); view = 'preview'; previewIndex = 0; previewAnswer = null; render(true); },
    'back-edit': () => { view = 'edit'; render(true); },
    'preview-answer': () => { previewAnswer = option; render(); root.querySelector('[data-option="' + option + '"]').focus(); },
    'preview-previous': () => { previewIndex--; previewAnswer = null; render(true); },
    'preview-next': () => { previewIndex++; previewAnswer = null; render(true); },
    publish: () => {
      if (dirty) { say('Lagre endringene før du publiserer.', true); return; }
      view = 'publish';
      render(true);
    },
    'copy-link': async () => {
      const copied = await copyText(playUrl(currentRound.round), root.querySelector('[data-link]'));
      say(copied ? 'Lenken er kopiert.' : 'Marker og kopier lenken.');
    },
    'copy-teams': async () => {
      const round = currentRound.round;
      const message = 'Bli med på ' + round.title + '! Velg et kallenavn og spill når det passer.' +
        (round.closesAt !== null ? ' Frist ' + dateLabel(round.closesAt) + '.' : '') + '\n\n' + playUrl(round);
      const copied = await copyText(message, root.querySelector('[data-link]'));
      say(copied ? 'Lim meldingen inn i Teams.' : 'Marker og kopier spill-lenken.');
    },
    close: async () => {
      if (!window.confirm('Avslutte runden nå? Etterpå kan ingen sende inn flere svar.')) return;
      await request('/rounds/' + id + '/close', {});
      await overview();
      await showResults(id);
      say('Runden er avsluttet.');
    },
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

load().catch(error => {
  root.innerHTML = '<section class="panel full"><h1>Arrangørsiden kunne ikke åpnes</h1><p>' + h(error.message) +
    '</p><a href="/arrangor" class="btn secondary">Prøv igjen</a></section>';
});
