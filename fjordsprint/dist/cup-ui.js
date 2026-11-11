import { formatConferencePoints as points, formatConferenceTime as time } from './conference-standings.js';
import { cleanName } from './rally-rules.js?v=3.2.0';
import { RUN_STAGES, scoreStages, validStageTelemetry } from './run-scoring.js';

const CUP_KEY = 'fjordsprint-cup-v1';
const TWO_DAYS = 48 * 60 * 60 * 1000;
const scoreLabels = { finish: 'Målgang', pace: 'Tempo', control: 'Ren kjøring', line: 'Flyt', boost: 'Effektiv boost', knowledge: 'Arkivspørsmål', trolls: 'Troll' };
const order = (a, b) => b.score - a.score || a.timeMs - b.timeMs || a.finishedAt - b.finishedAt;

export function renderCupResult(summary, courseNames, onBoard) {
  const host = document.getElementById('score-entry');
  const latest = summary.stages.at(-1);
  const complete = summary.stages.length === courseNames.length;
  host.innerHTML = `
    <section class="cup-result" aria-label="Poeng i fjellcupen">
      <div class="cup-total"><span>${complete ? 'Totalt' : 'Så langt'} · ${summary.stages.length} av ${courseNames.length} etapper</span><strong>${points(summary.score)} poeng</strong></div>
      <ol class="cup-stage-scores" aria-label="Poeng per etappe"></ol>
      <div class="cup-breakdown" aria-label="Poeng i siste etappe"></div>
      <p class="board-note cup-save-status" role="status"></p>
      <div class="inline-buttons"><button class="secondary cup-submit-retry" type="button" hidden>Send på nytt</button><button class="text-btn cup-open-board" type="button">Se poengtavlen →</button></div>
    </section>`;
  const list = host.querySelector('.cup-stage-scores');
  for (const [index, name] of courseNames.entries()) {
    const row = document.createElement('li');
    const stage = summary.stages[index];
    row.textContent = `${name} · ${stage ? `${points(stage.score)} poeng` : 'Gjenstår'}`;
    if (stage) row.classList.add('is-complete');
    list.append(row);
  }
  const breakdown = host.querySelector('.cup-breakdown');
  for (const [category, score] of Object.entries(latest.breakdown)) {
    const label = document.createElement('span');
    label.textContent = `${scoreLabels[category] ?? category} ${points(score)}`;
    breakdown.append(label);
  }
  host.querySelector('.cup-open-board').onclick = onBoard;
  host.classList.remove('hidden');
  return { status: host.querySelector('.cup-save-status'), retry: host.querySelector('.cup-submit-retry') };
}

export function createLocalCupBoard(openModal) {
  let storage;
  try { storage = window.localStorage; } catch {}
  let entries = [];
  function load() {
    if (storage) {
      try { entries = JSON.parse(storage.getItem(CUP_KEY) ?? '[]'); } catch { storage = undefined; }
    }
    const cutoff = Date.now() - TWO_DAYS;
    entries = (Array.isArray(entries) ? entries : []).filter(entry => entry &&
      Number.isSafeInteger(entry.finishedAt) && entry.finishedAt > cutoff && entry.finishedAt <= Date.now() &&
      typeof entry.mode === 'string' && Array.isArray(entry.stages) && entry.stages.length === RUN_STAGES.length &&
      entry.stages.every((stage, index) => validStageTelemetry(stage, RUN_STAGES[index])));
    return entries;
  }
  function save(nickname, mode, stages) {
    const entriesToSave = [...load(), { nickname: cleanName(nickname), mode, stages, finishedAt: Date.now() }].slice(-200);
    entries = entriesToSave;
    try { storage?.setItem(CUP_KEY, JSON.stringify(entriesToSave)); } catch { storage = undefined; }
    return !!storage;
  }
  function display(mode) {
    const ranked = load().filter(entry => entry.mode === mode).flatMap(entry => {
      try { return [{ ...entry, ...scoreStages(entry.stages), nickname: cleanName(entry.nickname) }]; } catch { return []; }
    }).sort(order);
    const names = new Set();
    const rows = ranked.filter(entry => {
      const name = entry.nickname.toLocaleLowerCase('nb-NO');
      if (names.has(name)) return false;
      names.add(name);
      return true;
    }).slice(0, 50);
    openModal('Fjellcupens poengtavle', '<p>Beste fullførte runde per kallenavn og kjøreklasse, rangert etter poeng og deretter tid. Resultatene lagres i 48 timer på denne enheten.</p><div class="table-scroll"><table class="score-table"><thead><tr><th scope="col">#</th><th scope="col">Kallenavn</th><th scope="col">Poeng</th><th scope="col">Tid</th></tr></thead><tbody id="cup-board-rows"></tbody></table></div>');
    const tbody = document.getElementById('cup-board-rows');
    if (!rows.length) {
      const cell = tbody.insertRow().insertCell();
      cell.colSpan = 4;
      cell.textContent = 'Fullfør alle tre etappene for å sette en poengsum.';
    }
    for (const [index, row] of rows.entries()) {
      const tr = tbody.insertRow();
      for (const value of [index + 1, row.nickname, points(row.score), time(row.timeMs)]) tr.insertCell().textContent = value;
    }
  }
  return { save, display };
}
