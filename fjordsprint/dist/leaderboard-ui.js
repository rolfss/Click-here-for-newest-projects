import { ScoreStore, cleanName, remainingTime, scoreTime, uniqueId, rankScores, SCORE_TTL, getStorage } from './leaderboard.js';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = getStorage();
function pref(key, fallback = '') { try { return storage?.getItem(key) || fallback; } catch { return fallback; } }
/** No API key is ever shipped to the browser. An empty API URL means local-only. */
export function createLeaderboard({ openModal, currentBoard, courseName }) {
  const store = new ScoreStore();
  const api = (document.querySelector('meta[name="leaderboard-api"]')?.content || '').replace(/\/$/, '');
  let pending = null, session = null, boardTimer = null, requestSequence = 0;
  async function request(path, data) {
    const response = await fetch(api + path, { method: data ? 'POST' : 'GET', mode: 'cors', credentials: 'omit',
      cache: 'no-store', headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(7000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Rekordserveren er utilgjengelig.');
    return body;
  }
  function description(board) {
    return `${courseName(board.split('-')[0])} · ${board.endsWith('-sport') ? 'Sport' : 'Assistert'} · ${board.includes('-time-') ? 'Tidsløp' : 'Arkivrally, sett ' + (Number(board.match(/archive2-(\d)/)?.[1] || 0) + 1)}`;
  }
  function drawRows(rows, board, serverNow = Date.now()) {
    const root = $('#leaderboard-rows'); if (!root) return;
    const ranked = rankScores(rows, board, serverNow);
    root.innerHTML = ranked.length ? ranked.map((row, index) => `<tr${row.id === pending?.id ? ' class="your-score"' : ''}><td>${String(index + 1).padStart(2, '0')}</td><th scope="row" dir="auto">${escapeHTML(row.name)}</th><td>${scoreTime(row.timeMs)}</td><td>${remainingTime(row.expiresAt, serverNow)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-board">Ingen resultater ennå. Fullfør en etappe og sett navnet ditt på listen.</td></tr>';
  }
  async function display(board = currentBoard(), scope = 'local') {
    clearInterval(boardTimer);
    const sequence = ++requestSequence;
    openModal('Topplisten · 72 timer', `<p class="board-subtitle">${escapeHTML(description(board))}</p><div class="board-tabs"><button id="board-local" class="secondary" aria-pressed="${scope === 'local'}">Denne enheten</button>${api ? `<button id="board-shared" class="secondary" aria-pressed="${scope === 'shared'}">Felles liste</button>` : ''}</div><p id="board-state" role="status" class="board-note">${scope === 'local' ? 'Lokale resultater. Ikke delt med andre enheter.' : 'Henter felles resultater …'}</p><div class="table-scroll"><table class="score-table"><thead><tr><th scope="col">#</th><th scope="col">Navn</th><th scope="col">Tid</th><th scope="col">Igjen</th></tr></thead><tbody id="leaderboard-rows"></tbody></table></div><p class="board-note">Hvert resultat forsvinner etter 72 timer. Beste aktive tid per navn vises. Baner, styring og spørsmålssett har egne lister. Bruk gjerne kallenavn.</p>${!api ? '<p class="board-note">Felles nettbasert liste er ikke tilkoblet i denne utgaven.</p>' : '<p class="board-note">Den felles listen har enkle gyldighetskontroller, ikke full juksesikring.</p>'}<button id="board-refresh" class="text-btn">Oppdater listen</button>`);
    $('#board-local').onclick = () => display(board, 'local');
    if ($('#board-shared')) $('#board-shared').onclick = () => display(board, 'shared');
    $('#board-refresh').onclick = () => display(board, scope);
    if (scope === 'local') {
      drawRows(store.all(), board);
      if (!store.persistent) $('#board-state').textContent = 'Lagring er blokkert. Resultatene varer bare i denne økten.';
      boardTimer = setInterval(() => {
        if (!$('#leaderboard-rows') || $('#modal-backdrop').classList.contains('hidden')) { clearInterval(boardTimer); return; }
        drawRows(store.all(), board);
      }, 1000);
      return;
    }
    try {
      const data = await request('/scores?board=' + encodeURIComponent(board));
      if (sequence !== requestSequence || !$('#leaderboard-rows')) return;
      const offset = data.now - Date.now();
      drawRows(data.scores, board, Date.now() + offset);
      $('#board-state').textContent = 'Felles liste · automatisk utløp etter tre døgn';
      boardTimer = setInterval(() => {
        if (sequence !== requestSequence || !$('#leaderboard-rows') || $('#modal-backdrop').classList.contains('hidden')) { clearInterval(boardTimer); return; }
        drawRows(data.scores, board, Date.now() + offset);
      }, 1000);
    } catch (error) { if (sequence === requestSequence && $('#board-state')) { $('#board-state').textContent = error.message + ' Den lokale listen er fortsatt tilgjengelig.'; drawRows([], board); } }
  }
  function begin(board, demo = false) {
    pending = null; session = null; $('#score-entry')?.classList.add('hidden');
    if (!api || demo) return;
    const thisSession = { board, ticket: null, error: null }; session = thisSession;
    request('/sessions', { board }).then(data => { thisSession.ticket = data.ticket; }).catch(error => { thisSession.error = error.message; });
  }
  function finish({ board, timeMs, splits, crashes, demo = false }) {
    const host = $('#score-entry'); if (!host) return;
    if (demo) { host.classList.add('hidden'); return; }
    pending = { id: uniqueId(), board, timeMs, splits, crashes, ticket: session?.ticket || null };
    host.classList.remove('hidden');
    host.innerHTML = `<div class="score-entry-heading"><span class="eyebrow">SETT NAVN PÅ TUREN</span><span class="expiry-pill">72 TIMER</span></div><form id="score-form"><label for="driver-name">Navn eller kallenavn</label><div class="score-input-row"><input id="driver-name" name="driver" autocomplete="nickname" minlength="2" maxlength="20" placeholder="Ditt kallenavn" value="${escapeHTML(pref('fjordsprint-driver'))}" required><button type="submit" class="primary">LAGRE TID</button></div>${api && pending.ticket ? '<label class="share-score"><input type="checkbox" id="share-score"> Vis også navnet og tiden på den felles listen i 72 timer.</label>' : ''}<p id="score-feedback" role="status" aria-live="polite" class="board-note">${api && pending.ticket ? 'Du velger selv om resultatet skal deles.' : 'Lagres bare på denne enheten. Forsvinner etter tre døgn.'}</p></form><button id="result-leaderboard" class="text-btn">Se topplisten →</button>`;
    $('#result-leaderboard').onclick = () => display(board);
    $('#score-form').onsubmit = async event => {
      event.preventDefault();
      const run = pending, button = event.currentTarget.querySelector('button[type="submit"]'), message = $('#score-feedback');
      if (!run || button.disabled) return;
      try {
        const name = cleanName($('#driver-name').value); const share = $('#share-score')?.checked === true;
        button.disabled = true;
        const row = store.add({ ...run, name }); $('#driver-name').disabled = true;
        try { storage?.setItem('fjordsprint-driver', name); } catch { /* ScoreStore reports unavailable persistence. */ }
        let text = store.persistent ? `Lagret lokalt · ${name} · ${scoreTime(row.timeMs)} · ${remainingTime(row.expiresAt)} igjen.` : 'Lagret bare i denne økten. Nettleseren tillater ikke varig lagring.';
        if (share) {
          message.textContent = 'Lokalt lagret. Sender til felles liste …';
          try { await request('/scores', { ticket: run.ticket, name, board: run.board, timeMs: run.timeMs, splits: run.splits, crashes: run.crashes }); text = 'Publisert på felles liste i 72 timer. ' + text; }
          catch (error) { if (pending === run) { message.textContent = 'Lokalt lagret. Deling mislyktes: ' + error.message; button.disabled = false; button.textContent = 'PRØV DELING IGJEN'; } return; }
        }
        if (pending !== run) return;
        message.textContent = text; button.textContent = 'LAGRET'; $('#driver-name').disabled = true;
        if ($('#share-score')) $('#share-score').disabled = true;
      } catch (error) { if (pending === run) { message.textContent = error.message; button.disabled = false; } }
    };
  }
  addEventListener('storage', event => { if (event.key === 'fjordsprint-scores-v2') store.all(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) store.all(); });
  store.all();
  return { begin, finish, display, store, enabled: !!api };
}
