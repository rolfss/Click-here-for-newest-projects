const testMode = new URLSearchParams(location.search).get("test") === "1";
const quizQuery = testMode ? "?test=1" : "";
const numberFormat = new Intl.NumberFormat("nb-NO");
const dateFormat = new Intl.DateTimeFormat("nb-NO", { dateStyle: "long", timeZone: "UTC" });
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const timeFormat = new Intl.DateTimeFormat("nb-NO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Oslo",
});
const clock = (value) => {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : timeFormat.format(date);
};

const createBoard = (id, endpoint) => {
  const element = document.getElementById(id);
  return {
    endpoint,
    results: element.querySelector(".board-results"),
    status: element.querySelector("[data-status]"),
    table: element.querySelector("[data-table]"),
    rows: element.querySelector("[data-rows]"),
    message: element.querySelector("[data-message]"),
    scores: null,
    previousLive: null,
    fingerprint: null,
  };
};

const fjord = createBoard("fjord", "/api/fjord/leaderboard");
const quiz = createBoard("quiz", `/api/quiz/leaderboard${testMode ? "?test=1&all=1" : "?all=1"}`);
const boards = [fjord, quiz];
const fjordDay = document.getElementById("fjord-day");
const quizJoin = document.getElementById("quiz-join");
const quizJoinLabel = document.getElementById("quiz-join-label");
const quizJoinHelp = document.getElementById("quiz-join-help");
const quizExport = document.getElementById("quiz-export");
const quizTest = document.getElementById("quiz-test");
const quizQr = document.getElementById("quiz-qr");
const fjordFallback = document.getElementById("fjord-fallback");
const organizerStorage = "fagdagen2026-organizer";
const organizerKey = loadOrganizer();
let quizStatus = null;
let organizerActive = false;
let refreshTimer;
let refreshing = false;
let fjordDays = [];
let fjordToday;
let fjordBoardTimer;
let boardPageTimer;
let fjordRequestVersion = 0;

function loadOrganizer() {
  const fragment = new URLSearchParams(location.hash.slice(1)).get("arrangor");
  if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment)) {
    try { sessionStorage.setItem(organizerStorage, fragment); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
    return fragment;
  }
  try { return sessionStorage.getItem(organizerStorage); } catch { return null; }
}

quizTest.hidden = false;
if (testMode) {
  quizTest.href = "/";
  quizTest.textContent = "Til konkurransen";
}

if (testMode) {
  document.getElementById("test-label").hidden = false;
  quizQr.src = "./quiz-test-qr.png";
  quizJoin.href = "./spill?test=1";
  quizJoinLabel.textContent = "Prøvespill quizen";
}

async function getJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Poengtjenesten svarte med " + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getScores(path) {
  const value = await getJson(path);
  if (!Array.isArray(value?.rows)) throw new Error("Ugyldig poengtavle");
  const rows = value.rows
    .filter((row) => Number.isSafeInteger(row?.rank) && row.rank > 0
      && typeof row.name === "string" && Number.isSafeInteger(row.score) && row.score >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank, name, score, entryId }) => ({ rank, name, score,
      entryId: typeof entryId === "string" ? entryId : null }));
  return { rows, day: value.day ?? null, days: Array.isArray(value.days) ? value.days : [],
    updatedAt: value.updatedAt ?? Date.now(), stale: value.stale === true };
}

async function getQuizStatus() {
  const value = await getJson("/api/quiz/status" + quizQuery);
  if (!["upcoming", "open", "closed"].includes(value?.state)) {
    throw new Error("Ugyldig konkurransestatus");
  }
  return value;
}

async function activateOrganizer() {
  if (!organizerKey || organizerActive) return;
  try {
    const response = await fetch("/api/organizer/activate", {
      method: "POST", headers: { Authorization: "Bearer " + organizerKey }, signal: AbortSignal.timeout(7000),
    });
    organizerActive = response.ok && (await response.json()).active === true;
    quizExport.hidden = !organizerActive;
  } catch {}
}

quizExport.addEventListener("click", async () => {
  if (!organizerActive) return;
  quizExport.disabled = true;
  try {
    const response = await fetch("/api/organizer/results" + quizQuery, {
      headers: { Authorization: "Bearer " + organizerKey }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Resultatene er utilgjengelige.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = testMode ? "fagdag-provespill.csv" : "fagdag-quizresultater.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    quizExport.textContent = "Last ned quizresultater";
  } catch {
    quizExport.textContent = "Prøv å laste ned igjen";
  } finally {
    quizExport.disabled = false;
  }
});

function setStatus(board, text, tone) {
  if (board.status.textContent !== text) board.status.textContent = text;
  if (board.status.dataset.tone !== tone) board.status.dataset.tone = tone;
}

function makeRow({ rank, name, score }, celebrate) {
  const row = document.createElement("tr");
  for (const value of [rank, name, numberFormat.format(score)]) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  row.cells[1].title = name;
  if (celebrate) {
    row.classList.add("board-arrival");
    setTimeout(() => row.classList.remove("board-arrival"), 4600);
  }
  return row;
}

function entryKey({ name, entryId }) {
  return entryId ? `id:${entryId}` : `name:${name.trim().normalize("NFC").toLocaleLowerCase("nb-NO")}`;
}

function newEntries(previous, latest) {
  if (!previous || previous.day !== latest.day) return new Set();
  const before = new Set(previous.rows.map(entryKey));
  const arrivals = new Set();
  const seen = new Set();
  for (const row of latest.rows) {
    const key = entryKey(row);
    if (!before.has(key) && !seen.has(key)) arrivals.add(key);
    else arrivals.delete(key);
    seen.add(key);
  }
  return arrivals;
}

function renderBoard(board, update, emptyText, stateText, stateTone) {
  const connected = update.status === "fulfilled" && !update.value.stale;
  if (update.status === "fulfilled") {
    const latest = update.value;
    if (!latest.stale || !board.scores || (board !== fjord && new Date(latest.updatedAt) >= new Date(board.scores.updatedAt))) {
      board.scores = latest;
    }
  }
  const rows = board.scores?.rows ?? [];
  const arrivals = connected ? newEntries(board.previousLive, board.scores) : new Set();
  if (connected) board.previousLive = board.scores;
  const fingerprint = JSON.stringify(rows);
  if (board.fingerprint !== fingerprint || arrivals.size) {
    board.rows.replaceChildren(...rows.map(row => makeRow(row, arrivals.has(entryKey(row)))));
    board.fingerprint = fingerprint;
  }
  board.table.hidden = rows.length === 0;
  board.message.hidden = rows.length > 0;
  if (rows.length === 0) {
    board.message.textContent = !board.scores ? "Poengtavlen er midlertidig utilgjengelig." : emptyText;
  }
  if (!connected) {
    const stamp = clock(board.scores?.updatedAt);
    setStatus(board, stamp ? "Sist oppdatert " + stamp : "Kobler til på nytt", "warning");
    return;
  }
  setStatus(board, stateText, stateTone);
}

function currentQuizState() {
  if (!quizStatus || testMode) return quizStatus?.state;
  const now = Date.now();
  const opens = Date.parse(quizStatus.opensAt);
  const closes = Date.parse(quizStatus.closesAt);
  if (Number.isFinite(closes) && now >= closes) return "closed";
  if (Number.isFinite(opens) && now >= opens && quizStatus.state === "upcoming") return "open";
  return quizStatus.state;
}

function renderQuiz(update) {
  quizQr.hidden = quizStatus?.active === false;
  if (quizQr.hidden) {
    quizJoinHelp.textContent = organizerKey ? "Starter quizen …" : "Arrangøren åpner quizen.";
    renderBoard(quiz, update, "Venter på oppstart.", "Venter", "muted");
    return;
  }
  const state = currentQuizState();
  const start = clock(quizStatus?.opensAt);
  if (state === "upcoming") {
    quizJoinHelp.textContent = start ? "Åpner kl. " + start : "Åpner snart";
    renderBoard(quiz, update, "Resultater vises når quizen åpner.", "Åpner snart", "muted");
    return;
  }
  if (state === "closed") {
    quizJoinLabel.textContent = "Se quizresultatene";
    quizJoinHelp.textContent = "Konkurransen er avsluttet";
    renderBoard(quiz, update, "Ingen registrerte resultater.", "Avsluttet", "muted");
    return;
  }
  quizJoinLabel.textContent = testMode ? "Prøvespill quizen" : "Ta quizen";
  quizJoinHelp.textContent = "Skann med mobilen";
  const badge = testMode ? "Prøvespill" : state === "open" ? "Åpen" : "Toppliste";
  renderBoard(quiz, update, "Ingen resultater ennå.", badge, state === "open" ? "live" : "muted");
}

function formatDay(day) {
  return dateFormat.format(new Date(`${day}T00:00:00Z`));
}

function renderFjordDays(days, today) {
  const validDays = [...new Set(days.filter(day => day !== today && typeof day === "string" && dayPattern.test(day)
    && Number.isFinite(Date.parse(day))))].sort().reverse();
  if (validDays.join() === fjordDays.join()) return;
  fjordDays = validDays;
  const selected = fjordDay.value;
  fjordDay.replaceChildren(new Option("Fjordsprint · I dag", ""),
    ...validDays.map(day => new Option(`Fjordsprint · ${formatDay(day)}`, day)));
  fjordDay.value = validDays.includes(selected) ? selected : "";
  fjordDay.hidden = validDays.length === 0;
}

async function refreshFjord() {
  const selectedDay = fjordDay.value;
  const version = ++fjordRequestVersion;
  const endpoint = selectedDay ? `${fjord.endpoint}?day=${encodeURIComponent(selectedDay)}` : fjord.endpoint;
  const [update] = await Promise.allSettled([getScores(endpoint)]);
  if (version !== fjordRequestVersion) return false;
  if (update.status === "fulfilled" && !update.value.stale) {
    const { days, day } = update.value;
    if (!selectedDay) fjordToday = day;
    renderFjordDays(days, fjordToday);
  }
  const heading = selectedDay ? formatDay(selectedDay) : "Direkte";
  renderBoard(fjord, update, "Ingen resultater denne dagen.", heading, selectedDay ? "muted" : "live");
  fjordFallback.hidden = update.status === "fulfilled" && !update.value.stale;
  return true;
}

async function pollFjord() {
  clearTimeout(fjordBoardTimer);
  if (await refreshFjord()) fjordBoardTimer = setTimeout(pollFjord, document.hidden ? 30000 : 10000);
}

fjordDay.addEventListener("change", () => {
  fjord.scores = null;
  fjord.previousLive = null;
  fjord.results.scrollTop = 0;
  fjord.table.hidden = true;
  fjord.message.hidden = false;
  fjord.message.textContent = "Henter poengtavlen …";
  setStatus(fjord, "Kobler til", "muted");
  void pollFjord();
});

function advanceBoardPage({ results, table, rows }) {
  const viewport = results.clientHeight;
  const maxScroll = results.scrollHeight - viewport;
  if (maxScroll <= 1) return;
  if (results.scrollTop >= maxScroll - 1) {
    results.scrollTop = 0;
    return;
  }
  const headerHeight = table.tHead?.offsetHeight ?? 0;
  const resultsTop = results.getBoundingClientRect().top;
  const nextRow = Array.from(rows.rows).find(row => row.getBoundingClientRect().bottom > resultsTop + viewport + 1);
  const pageTop = nextRow ? nextRow.getBoundingClientRect().top - resultsTop - headerHeight : maxScroll;
  results.scrollTop += pageTop > 1 ? pageTop : viewport - headerHeight;
}

async function refreshScores() {
  if (refreshing) return;
  clearTimeout(refreshTimer);
  refreshing = true;
  try {
    await activateOrganizer();
    const [quizUpdate, statusUpdate] = await Promise.allSettled([
      getScores(quiz.endpoint),
      getQuizStatus(),
    ]);
    if (statusUpdate.status === "fulfilled") quizStatus = statusUpdate.value;
    renderQuiz(quizUpdate);
  } finally {
    refreshing = false;
    refreshTimer = setTimeout(refreshScores, document.hidden ? 30000 : 10000);
  }
}

const fullscreen = document.getElementById("fullscreen");
if (!document.fullscreenEnabled) fullscreen.hidden = true;
let screenWakeLock;
let requestingWakeLock = false;

async function syncScreenWakeLock() {
  if (!document.fullscreenElement || document.hidden) {
    const lock = screenWakeLock;
    screenWakeLock = undefined;
    if (lock && !lock.released) await lock.release().catch(() => {});
    return;
  }
  if (!navigator.wakeLock || requestingWakeLock || (screenWakeLock && !screenWakeLock.released)) return;
  requestingWakeLock = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (document.fullscreenElement && !document.hidden) screenWakeLock = lock;
    else await lock.release();
  } catch {
    // Fullscreen still works if the browser or device denies a screen wake lock.
  } finally {
    requestingWakeLock = false;
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    fullscreen.title = "Fullskjerm er utilgjengelig i denne nettleseren. Prøv F11.";
  }
}

fullscreen.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  fullscreen.textContent = document.fullscreenElement ? "Avslutt fullskjerm" : "Fullskjerm";
  clearInterval(boardPageTimer);
  if (document.fullscreenElement) {
    for (const board of boards) board.results.scrollTop = 0;
    boardPageTimer = setInterval(() => {
      if (!document.hidden) boards.forEach(advanceBoardPage);
    }, 8000);
  }
  void syncScreenWakeLock();
});
document.addEventListener("visibilitychange", syncScreenWakeLock);
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "f" || event.repeat || event.altKey || event.ctrlKey || event.metaKey
    || event.target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
  if (!document.fullscreenEnabled) return;
  event.preventDefault();
  void toggleFullscreen();
});

window.addEventListener("online", refreshScores);
window.addEventListener("online", () => void pollFjord());
void pollFjord();
void refreshScores();
const presentation = document.getElementById("presentation");
import("./slides.js")
  .then(({ mountPresentation }) => mountPresentation(presentation))
  .catch(() => {
    const message = document.createElement("p");
    message.className = "presentation-message";
    message.textContent = "Lysbildevisningen kunne ikke åpnes. Last inn siden på nytt.";
    presentation.replaceChildren(message);
  });
