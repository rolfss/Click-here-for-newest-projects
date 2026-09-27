import {
  BUILD_INFO,
  RECORDS,
  SOURCES,
  SUGGESTED_QUESTIONS,
  TOPICS,
} from "./data.mjs";
import {
  answerQuestion,
  corpusStats,
  formatLocation,
  listRecords,
  requirementTypeLabel,
  searchRecords,
  sourceUrl,
} from "./engine.mjs";
import { buildDecisionNote } from "./decision-note.mjs";
import { fallbackAnswer, lunaFailureAnswer, retrieveConversation, MAX_HISTORY as CHAT_HISTORY } from "./rag-shared.mjs";
import { askLuna, loadLunaStatus, mountBotCheck, resetBotCheck, needsUpdatedCorpus, jevEnabled, bonsaiEnabled, aiDisclosure, answerModeLabel, providerNotice, retrievalNotice } from "./luna-client.mjs";

const HISTORY_KEY = "noark-assistent-history-v1";
const MAX_HISTORY = 8;
const LIBRARY_PAGE_SIZE = 18;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  latestAnswer: null,
  turns: [], busy: false, runId: 0, controller: null,
  luna: { configured: false }, botToken: "", botWidget: null,
  libraryLimit: LIBRARY_PAGE_SIZE,
  libraryResults: [],
};

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== null && value !== undefined) node.setAttribute(name, String(value));
    }
  }
  return node;
}

function appendText(parent, text) {
  parent.append(document.createTextNode(text));
}

function formatCorpusDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2300);
}

function setStatus(label, busy = false) {
  const status = $(".status-dot");
  status.lastChild.textContent = label;
  status.classList.toggle("is-busy", busy);
}

function citationButton(rank, label = `[${rank}]`) {
  return element("button", {
    className: "citation-button",
    text: label,
    attrs: { type: "button", "data-citation": rank, "aria-label": `Vis kilde ${rank}` },
  });
}

function activateCitation(rank) {
  const card = $(`.evidence-item[data-rank="${rank}"]`);
  if (!card) return;
  $$(".evidence-item.is-active").forEach((item) => item.classList.remove("is-active"));
  card.classList.add("is-active");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setTimeout(() => card.classList.remove("is-active"), 2200);
}

function renderStats() {
  const stats = corpusStats();
  $("#stat-records").textContent = String(stats.records);
  $("#stat-sources").textContent = String(stats.sources);
  $("#stat-requirements").textContent = String(stats.requirements);
  $("#app-version").textContent = BUILD_INFO.version;
  const date = $("#corpus-date");
  date.dateTime = BUILD_INFO.corpusVersion;
  date.textContent = formatCorpusDate(BUILD_INFO.corpusVersion);
}

function renderSuggestions() {
  const container = $("#suggestion-list");
  container.replaceChildren(...SUGGESTED_QUESTIONS.map((question) => element("button", {
    className: "suggestion-button",
    text: question,
    attrs: { type: "button", "data-question": question },
  })));
}

function userMessage(question) {
  const article = element("article", { className: "message user-message" });
  article.append(
    element("div", { className: "message-role", text: "Du" }),
    element("div", { className: "message-content", text: question }),
  );
  return article;
}

function assistantMessage(answer) {
  const article = element("article", { className: "message assistant-message answer-message" });
  article.answer = answer;
  const role = element("div", { className: "message-role", text: "Assistent" });
  const content = element("div", { className: "message-content" });

  const answerHeader = element("div", { className: "answer-header" });
  answerHeader.append(
    element("span", {
      className: `confidence confidence-${answer.confidence.level}`,
      text: `${answer.confidence.label} · ${answer.confidence.score}/100`,
      attrs: { title: "Anslått kilderelevans, ikke sannsynlighet for at svaret er riktig. Kontroller originalkildene." },
    }),
    element("span", { className: "answer-mode", text: answerModeLabel(answer) }),
  );
  content.append(answerHeader);
  const generationNotice = providerNotice(answer);
  if (generationNotice) content.append(element("p", { className: "message-note", text: generationNotice }));
  const selectionNotice = retrievalNotice(answer);
  if (selectionNotice) content.append(element("p", { className: "message-note", text: selectionNotice }));

  const lead = element("p", { className: "answer-lead" });
  appendText(lead, answer.lead);
  for (const rank of answer.leadCitations ?? (answer.leadCitation ? [answer.leadCitation] : [])) {
    appendText(lead, " ");
    lead.append(citationButton(rank));
  }
  content.append(lead);

  if (answer.points.length) {
    const list = element("ul", { className: "answer-points" });
    for (const point of answer.points) {
      const item = element("li");
      appendText(item, point.text);
      appendText(item, " ");
      for (const rank of point.citations ?? [point.citation]) item.append(citationButton(rank));
      list.append(item);
    }
    content.append(list);
  }

  if (answer.guidance) content.append(element("p", { className: "message-note", text: answer.guidance }));

  const actions = element("div", { className: "answer-actions" });
  actions.append(
    element("button", { className: "quiet-button", text: "Kopier svar", attrs: { type: "button", "data-action": "copy-answer" } }),
    element("button", { className: "quiet-button", text: "Kopier beslutningsnotat", attrs: { type: "button", "data-action": "copy-decision-note" } }),
    element("button", { className: "quiet-button", text: "Kopier delingslenke", attrs: { type: "button", "data-action": "copy-link" } }),
  );
  content.append(actions);

  article.append(role, content);
  return article;
}

function insufficientMessage(answer) {
  return assistantMessage({ ...answer, points: answer.points ?? [], results: answer.results ?? [] });
}

function renderEvidence(results, query = "") {
  $("#evidence-query").textContent = query ? `Relevans for: ${query}` : "";
  const container = $("#evidence-list");
  const empty = $("#evidence-empty");
  const count = $("#result-count");
  container.replaceChildren();

  if (!results.length) {
    empty.hidden = false;
    count.textContent = "Ingen sikre treff";
    return;
  }

  empty.hidden = true;
  count.textContent = `${results.length} ${results.length === 1 ? "kildepost" : "kildeposter"}`;

  for (const result of results) {
    const { record, source, rank, relevance, url } = result;
    const card = element("article", {
      className: "evidence-item",
      attrs: { "data-rank": rank, id: `source-${rank}` },
    });
    const top = element("div", { className: "evidence-top" });
    top.append(
      element("span", { className: "source-number", text: String(rank) }),
      element("span", { className: "source-kind", text: source.type }),
      element("span", { className: "relevance", text: `${relevance}% treff`, attrs: {
        title: `${result.relevanceMethod === "bonsai" ? "Bonsai-vurdert" : result.relevanceMethod === "luna" ? "Luna-vurdert" : "Søkebasert"} relevansanslag for denne kildeposten. Ikke en sannsynlighet for at svaret er riktig.`,
      } }),
    );

    const heading = element("h3", { text: record.title });
    const location = element("p", { className: "source-location", text: formatLocation(record) || record.topic });
    const summary = element("p", { className: "source-summary", text: record.detail });
    const sourceLine = element("p", { className: "source-name" });
    sourceLine.append(element("strong", { text: source.shortTitle }), document.createTextNode(` · ${source.publisher}`));

    const footer = element("div", { className: "source-footer" });
    const bar = element("span", { className: "relevance-bar", attrs: { "aria-hidden": "true" } });
    bar.style.setProperty("--relevance", `${relevance}%`);
    const link = element("a", {
      className: "source-link",
      text: "Åpne originalkilden ↗",
      attrs: { href: url, target: "_blank", rel: "noreferrer" },
    });
    footer.append(bar, link);
    const explanation = element("p", { className: "relevance-explanation", text:
      `${result.relevanceMethod === "bonsai" ? "Bonsai-vurdering" : result.relevanceMethod === "luna" ? "Luna-vurdering" : "Søkebasert anslag"}: ${result.relevanceReason ?? "Ord- og kravtreff."}` });
    card.append(top, heading, location, summary, explanation, sourceLine, footer);
    container.append(card);
  }
}

function plainTextAnswer(answer) {
  const lines = [
    `Spørsmål: ${answer.query}`,
    "",
    `${answer.lead} ${(answer.leadCitations ?? (answer.leadCitation ? [answer.leadCitation] : [])).map((n) => `[${n}]`).join(" ")}`,
  ];
  for (const point of answer.points) lines.push(`- ${point.text} ${(point.citations ?? [point.citation]).map((n) => `[${n}]`).join(" ")}`);
  lines.push("", "Kilder:");
  for (const result of answer.results) {
    lines.push(`[${result.rank}] ${result.source.title} — ${formatLocation(result.record) || result.record.topic}`);
    lines.push(result.url);
  }
  lines.push("", "Fagstøtte: kontroller originalkildene før beslutninger.");
  lines.push(answerModeLabel(answer));
  const generationNotice = providerNotice(answer);
  if (generationNotice) lines.push(generationNotice);
  const selectionNotice = retrievalNotice(answer);
  if (selectionNotice) lines.push(selectionNotice);
  return lines.join("\n");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = element("textarea", { text });
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(message);
}

function shareUrl(question) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("q", question);
  return url.toString();
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(question) {
  const normalized = question.trim();
  const history = [normalized, ...readHistory().filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Private-mode storage may be unavailable. */ }
  renderHistory();
}

function renderHistory() {
  const history = readHistory();
  const section = $("#history-section");
  const list = $("#history-list");
  section.hidden = history.length === 0;
  list.replaceChildren(...history.map((question) => element("button", {
    className: "history-button",
    text: question,
    attrs: { type: "button", "data-question": question },
  })));
}

async function runQuestion(question, { save = true, updateUrl = true, allowAI = true, newTopic = false } = {}) {
  const clean = String(question ?? "").trim().slice(0, 1000);
  if (clean.length < 2) return;
  if (state.busy) { showToast("Et spørsmål behandles allerede."); return; }
  if (newTopic) state.turns = [];
  const previous = state.turns.slice(-CHAT_HISTORY);
  const needsNewSources = state.luna.configured && !state.luna.currentCorpus && needsUpdatedCorpus(clean, previous);
  const useAI = state.luna.configured === true && allowAI && $("#use-luna").checked;
  if (useAI && !state.botToken && !needsNewSources) { showToast("Fullfør sikkerhetskontrollen, eller slå av KI for lokalt søk."); return; }
  const runId = ++state.runId;
  const conversation = $("#conversation");
  state.busy = true;
  state.controller = new AbortController();
  $("#question-form button[type=submit]").disabled = true;
  conversation.append(userMessage(clean));
  $("#question").value = "";
  setStatus(useAI ? "Velger kilder og skriver svar" : "Søker lokalt", true);
  let answer = useAI ? null : fallbackAnswer(clean, previous);
  renderEvidence(useAI ? retrieveConversation(clean, previous) : answer.results, clean);
  try {
    if (useAI) answer = await askLuna(clean, previous, state.botToken, state.controller.signal, {
      corpusVersion: state.luna.corpusVersion,
      jevConsent: jevEnabled(state.luna) && $("#use-luna").checked,
      bonsaiConsent: bonsaiEnabled(state.luna) && $("#use-luna").checked,
      providerPreference: bonsaiEnabled(state.luna) && $("#use-luna").checked ? $("#answer-provider").value : undefined,
      qualityConsent: state.luna.questionLogging?.enabled === true && $("#quality-consent").checked,
    });
  } catch (error) {
    answer = lunaFailureAnswer(clean, previous, error.name === "AbortError" ? "KI-forespørselen ble avbrutt." : error.name === "TimeoutError" ? "KI-svaret brukte for lang tid. Prøv igjen; nettleseren sender ikke forespørselen på nytt automatisk." : error.message);
  } finally {
    if (useAI) { state.botToken = ""; resetBotCheck(state.botWidget); }
  }
  if (runId !== state.runId) return;
  state.latestAnswer = answer;
  conversation.append(answer.status === "ok" ? assistantMessage(answer) : insufficientMessage(answer));
  renderEvidence(answer.results, clean);
  if (answer.mode !== "unavailable") {
    state.turns.push({ role: "user", content: clean }, { role: "assistant", content: [answer.lead, ...answer.points.map((p) => p.text), answer.guidance].join(" ").slice(0, 1500) });
  } else {
    $("#question").value = clean;
  }
  state.turns = state.turns.slice(-CHAT_HISTORY);
  state.busy = false;
  $("#question-form button[type=submit]").disabled = false;
  setStatus(answer.mode === "unavailable" ? "KI-svar utilgjengelig" : "Klar", false);
  if (save) saveHistory(clean);
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete("q"); // Do not put new potentially personal questions into URL/history.
    history.replaceState(null, "", url);
  }
  conversation.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetConversation() {
  state.controller?.abort();
  state.runId++;
  state.busy = false;
  state.turns = [];
  $("#question-form button[type=submit]").disabled = false;
  $("#evidence-query").textContent = "";
  setStatus("Klar");
  const conversation = $("#conversation");
  conversation.replaceChildren();
  const welcome = element("article", { className: "message assistant-message" });
  const content = element("div", { className: "message-content" });
  content.append(
    element("p", { text: "Samtalen er nullstilt. Still et nytt spørsmål, eller velg en av problemstillingene over." }),
    element("p", { className: "message-note", text: "Lokalt søk sender ikke spørsmålet ut. Med Luna sendes spørsmålet, begrenset samtalehistorikk og kildeposter til OpenAI via backend." }),
  );
  welcome.append(element("div", { className: "message-role", text: "Assistent" }), content);
  conversation.append(welcome);
  state.latestAnswer = null;
  $("#evidence-list").replaceChildren();
  $("#evidence-empty").hidden = false;
  $("#result-count").textContent = "Ingen søk";
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

function setActiveTab(name, { updateHash = true } = {}) {
  $$(".tab-button").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  if (updateHash) history.replaceState(null, "", `${window.location.pathname}${window.location.search}${name === "chat" ? "" : `#${name}`}`);
  if (name === "library") renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function populateLibraryTopics() {
  const select = $("#library-topic");
  select.replaceChildren(...TOPICS.map((topic) => element("option", { text: topic, attrs: { value: topic } })));
}

function currentLibraryResults() {
  const query = $("#library-query").value.trim();
  const topic = $("#library-topic").value || "Alle";
  const requirementType = $("#library-type").value || "Alle";
  if (query) return searchRecords(query, { topic, requirementType, limit: 50 });
  return listRecords({ topic, requirementType }).map((item, index) => ({ ...item, rank: index + 1, relevance: 100 }));
}

function libraryCard(result) {
  const { record, source, url } = result;
  const card = element("article", { className: "library-item" });
  const meta = element("div", { className: "library-meta" });
  meta.append(element("span", { className: "topic-badge", text: record.topic }));
  if (record.requirementType) {
    meta.append(element("span", {
      className: `type-badge type-${record.requirementType.toLowerCase()}`,
      text: record.requirementType,
      attrs: { title: requirementTypeLabel(record.requirementType) },
    }));
  }
  if (record.requirement) meta.append(element("span", { className: "requirement-number", text: record.requirement }));

  const title = element("h2", { text: record.title });
  const summary = element("p", { className: "library-summary", text: record.summary });
  const detail = element("p", { className: "library-detail", text: record.detail });
  const location = element("p", { className: "library-location", text: `${source.shortTitle} · ${formatLocation(record) || record.section}` });
  const link = element("a", {
    className: "source-link",
    text: "Se originalkilden ↗",
    attrs: { href: url, target: "_blank", rel: "noreferrer" },
  });
  card.append(meta, title, summary, detail, location);
  if (source.scope) card.append(element("p", { className: "message-note", text: `${source.scope} · Kontrollert ${source.verifiedAt}` }));
  card.append(link);
  return card;
}

function renderLibrary({ resetLimit = false } = {}) {
  if (resetLimit) state.libraryLimit = LIBRARY_PAGE_SIZE;
  state.libraryResults = currentLibraryResults();
  const visible = state.libraryResults.slice(0, state.libraryLimit);
  $("#library-grid").replaceChildren(...visible.map(libraryCard));
  $("#library-count").textContent = `${state.libraryResults.length} ${state.libraryResults.length === 1 ? "treff" : "treff"}`;
  const more = $("#library-more");
  more.hidden = visible.length >= state.libraryResults.length;
  more.textContent = `Vis flere (${state.libraryResults.length - visible.length})`;
  if (!visible.length) {
    const empty = element("div", { className: "library-empty" });
    empty.append(element("h2", { text: "Ingen treff" }), element("p", { text: "Prøv et annet begrep, kravnummer eller en bredere filtrering." }));
    $("#library-grid").append(empty);
  }
}

function renderSources() {
  const container = $("#source-grid");
  container.replaceChildren(...SOURCES.map((source, index) => {
    const card = element("article", { className: "source-catalog-item" });
    card.append(
      element("span", { className: "source-index", text: String(index + 1).padStart(2, "0") }),
      element("span", { className: "source-kind", text: source.type }),
      element("h2", { text: source.title }),
      element("p", { text: source.note }),
      element("p", { className: "source-publisher", text: `${source.publisher} · ${source.verifiedAt ? `Kontrollert ${source.verifiedAt}` : source.published}` }),
      element("a", { className: "source-link", text: "Åpne kilden ↗", attrs: { href: source.url, target: "_blank", rel: "noreferrer" } }),
    );
    return card;
  }));
}

function bindEvents() {
  $("#question-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runQuestion($("#question").value);
  });
  $("#question").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      $("#question-form").requestSubmit();
    }
  });
  document.addEventListener("click", (event) => {
    const citation = event.target.closest("[data-citation]");
    if (citation) {
      const answer = citation.closest(".answer-message")?.answer;
      if (answer) renderEvidence(answer.results, answer.query);
      activateCitation(Number(citation.dataset.citation));
    }

    const question = event.target.closest("[data-question]");
    if (question) {
      setActiveTab("chat");
      runQuestion(question.dataset.question, { newTopic: true });
    }

    const tab = event.target.closest("[data-tab]");
    if (tab) {
      setActiveTab(tab.dataset.tab);
      if (tab.dataset.focus) document.getElementById(tab.dataset.focus)?.focus({ preventScroll: true });
    }

    const action = event.target.closest("[data-action]");
    const selectedAnswer = action?.closest(".answer-message")?.answer ?? state.latestAnswer;
    if (action?.dataset.action === "copy-answer" && selectedAnswer) {
      copyText(plainTextAnswer(selectedAnswer), "Svaret er kopiert");
    }
    if (action?.dataset.action === "copy-decision-note" && selectedAnswer) {
      copyText(buildDecisionNote(selectedAnswer), "Beslutningsnotatet er kopiert");
    }
    if (action?.dataset.action === "copy-link" && selectedAnswer) {
      copyText(shareUrl(selectedAnswer.query), "Delingslenken er kopiert");
    }
  });
  $("#clear-chat").addEventListener("click", resetConversation);
  $("#clear-history").addEventListener("click", () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* Storage may be blocked. */ }
    renderHistory();
    showToast("Historikken er slettet");
  });
  $("#library-filters").addEventListener("input", () => renderLibrary({ resetLimit: true }));
  $("#library-filters").addEventListener("change", () => renderLibrary({ resetLimit: true }));
  $("#library-filters").addEventListener("reset", () => setTimeout(() => renderLibrary({ resetLimit: true }), 0));
  $("#library-more").addEventListener("click", () => {
    state.libraryLimit += LIBRARY_PAGE_SIZE;
    renderLibrary();
  });
  window.addEventListener("hashchange", () => {
    const name = window.location.hash.slice(1);
    if (["library", "sources"].includes(name)) setActiveTab(name, { updateHash: false });
  });
}

function refreshAiControls() {
  const active = state.luna.configured === true && $("#use-luna").checked;
  const directBonsai = bonsaiEnabled(state.luna) && $("#answer-provider").value === "bonsai";
  $("#answer-provider").disabled = !active || !bonsaiEnabled(state.luna);
  $("#bot-check").hidden = !active;
  $("#model-badge").textContent = active
    ? `${directBonsai ? "Bonsai" : "Luna"}${jevEnabled(state.luna) ? " · JEV velger kilder" : " · kildebasert svar"}`
    : "Lokalt kildesøk";
  $("#question-form button[type=submit]").textContent = active ? directBonsai ? "Spør Bonsai" : "Spør Luna" : "Søk i kildene";
}

async function initializeLuna() {
  state.luna = await loadLunaStatus();
  const disclosure = aiDisclosure(state.luna);
  $("#ai-consent-label").textContent = disclosure.label;
  $("#ai-disclosure").textContent = disclosure.text;
  // A restored checkbox from an earlier page must not consent to new providers.
  $("#use-luna").checked = false;
  $("#provider-choice").hidden = !bonsaiEnabled(state.luna);
  $("#answer-provider").value = "luna";
  $("#answer-provider").disabled = true;
  $("#model-status").textContent = state.luna.message;
  $("#use-luna").disabled = !state.luna.configured;
  $("#quality-consent").disabled = state.luna.questionLogging?.enabled !== true;
  $("#quality-status").textContent = state.luna.questionLogging?.enabled === true
    ? "For godkjente KI-forespørsler registreres dato, kilde-ID-er, treffskårer og utfall. Spørsmålstekst lagres bare med ditt separate samtykke nedenfor."
    : "Spørsmålsloggen er ikke aktiv på den tilkoblede bakenden. Lokale søk blir ikke sendt inn til forbedringsloggen.";
  $("#model-badge").textContent = state.luna.configured ? jevEnabled(state.luna) ? "Luna og JEV klare" : "Luna-backend klar" : "Lokalt søk · Luna ikke aktivert";
  $("#answer-provider").addEventListener("change", refreshAiControls);
  $("#use-luna").addEventListener("change", async () => {
    const active = $("#use-luna").checked;
    refreshAiControls();
    if (active && state.botWidget === null) {
      try {
        state.botWidget = await mountBotCheck(state.luna.siteKey, $("#bot-widget"), (token) => { state.botToken = token; });
      } catch {
        $("#use-luna").checked = false;
        refreshAiControls();
        showToast("Sikkerhetskontrollen kunne ikke lastes. Lokalt søk er fortsatt tilgjengelig.");
      }
    }
  });
}

function initialize() {
  renderStats();
  renderSuggestions();
  renderHistory();
  renderSources();
  populateLibraryTopics();
  bindEvents();
  initializeLuna();

  const initialTab = ["library", "sources"].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "chat";
  setActiveTab(initialTab, { updateHash: false });
  const query = new URL(window.location.href).searchParams.get("q")?.slice(0, 1000).trim();
  if (query) {
    setActiveTab("chat", { updateHash: false });
    setTimeout(() => runQuestion(query, { save: false, updateUrl: false, allowAI: false }), 120);
  }
}

initialize();
