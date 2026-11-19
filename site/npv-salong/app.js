"use strict";

const API_ORIGIN = "https://npv-salong-minner-mening.rolfsselas.chatgpt.site";
const isPreview = /(?:^|\.)(?:chatgpt\.site|oaiusercontent\.com)$/.test(location.hostname);
const apiOrigin = isPreview || ["localhost", "127.0.0.1"].includes(location.hostname) ? location.origin : API_ORIGIN;
const questions = [
  "Kan et naturalistisk/materialistisk syn romme slike opplevelser, eller bør vi tenke nytt om virkeligheten? Hva taler sterkest for ditt syn?",
  "Når en opplevelse kjennes «mer virkelig enn hverdagen», hva kan det fortelle oss om virkeligheten, og hva kan det ikke avgjøre?",
  "Hvis en numinøs eller åndelig opplevelse hjelper noen, hva tror du bidrar til virkningen? Hva kunne undersøke forklaringen din?",
  "Kan samme opplevelse gi personlig vekst både med en åndelig og en naturalistisk tolkning? Hvorfor eller hvorfor ikke?",
  "Hva har du blitt mest usikker på eller endret mening om i kveld? Hva kunne få deg til å tenke annerledes videre?",
  "Hvilke forfattere finner du spesielt fascinerende, og hvilke temaer ønsker du at vi tar opp i kommende salonger?"
];
const ids = questions.map((_, i) => "q" + (i + 1));
const wallDeadline = Date.parse("2026-11-22T18:00:00Z");
const deadlineLabel = "22. november 2026 kl. 19.00 (norsk tid)";
const quizPrivacy = "Fram til " + deadlineLabel + " kan alle med lenken lese svarene dine straks du sender dem. Arrangøren beholder svarene etter fristen. Ikke skriv navn, deltakernummer eller opplysninger om andre.";
const storageKey = "npv-salong-minner-mening.quiz.v1";
const main = document.querySelector("main");
const emptyAnswers = () => Object.fromEntries(ids.map(id => [id, ""]));

function readQuiz() {
  let cached;
  try { cached = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* Use an in-memory draft. */ }
  const answers = emptyAnswers();
  for (const id of ids) {
    if (typeof cached?.answers?.[id] === "string") answers[id] = cached.answers[id].slice(0, 700);
  }
  return {
    answers,
    step: Number.isInteger(cached?.step) && cached.step >= 0 && cached.step <= questions.length ? cached.step : 0,
    submissionId: typeof cached?.submissionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cached.submissionId) ? cached.submissionId : "",
    saved: cached?.saved === true
  };
}
let quiz = readQuiz();
let quizBusy = false;
let quizTrap = "";
let editingReview = false;
let stopWall;
const feedback = { name: "", improve: "", keep: "", topic: "", website: "", submissionId: "" };
let feedbackSaved = false;
let feedbackBusy = false;

function persistQuiz() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(quiz.saved ? { saved: true } : quiz)); }
  catch { /* The current tab still holds the answers. */ }
}
function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function link(label, href, style) {
  const node = el("a", style, label);
  node.href = href;
  return node;
}
function button(label, style, action, type = "button") {
  const node = el("button", style, label);
  node.type = type;
  if (action) node.addEventListener("click", action);
  return node;
}
function honeypot(value, update) {
  const wrapper = el("div", "trap");
  wrapper.setAttribute("aria-hidden", "true");
  const label = el("label", "", "La dette feltet stå tomt");
  const input = el("input");
  Object.assign(input, { type: "text", name: "website", tabIndex: -1, autocomplete: "off", value });
  input.addEventListener("input", () => update(input.value));
  label.append(input);
  wrapper.append(label);
  return wrapper;
}
function page(title, intro, eyebrow) {
  const wrapper = el("section", "panel");
  wrapper.append(link("Til startsiden", "#start", "back"));
  if (eyebrow) wrapper.append(el("p", "eyebrow", eyebrow));
  const heading = el("h1", "", title);
  heading.tabIndex = -1;
  wrapper.append(heading);
  if (intro) wrapper.append(el("p", "lead", intro));
  main.replaceChildren(wrapper);
  return wrapper;
}
function focusTitle() {
  const heading = main.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}
function errorBox() {
  const box = el("p", "error");
  box.setAttribute("role", "alert");
  return box;
}
async function request(path, payload, controller = new AbortController()) {
  const timer = setTimeout(() => controller.abort(), 20000);
  let response, result;
  try {
    response = await fetch(apiOrigin + "/api/" + path, {
      method: payload ? "POST" : "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      ...(payload && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    });
    result = await response.json();
  } catch {
    throw new Error(payload ? "Vi fikk ikke bekreftet innsendingen. Teksten din er her. Prøv å sende igjen." : "Vi fikk ikke hentet svarene. Prøv å oppdatere.");
  } finally { clearTimeout(timer); }
  if (!response.ok || (payload && result?.saved !== true)) {
    throw new Error(typeof result?.error === "string" ? result.error : "Tjenesten kunne ikke fullføre forespørselen. Prøv igjen.");
  }
  return result;
}
function feedbackSuccess() {
  const wrapper = page("Takk for innspillet!", "Tilbakemeldingen din er sendt til arrangøren.", "Minner og mening");
  const actions = el("div", "actions");
  actions.append(link("Se quizsvarene", "#svar", "btn"), link("Gå til quizen", "#quiz", "btn secondary"));
  wrapper.append(actions);
}
function formField(key, labelText, hint, max, isText = false) {
  const group = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = key;
  const help = el("p", "hint", hint);
  help.id = key + "-hint";
  const input = el(isText ? "input" : "textarea");
  if (isText) { input.type = "text"; input.autocomplete = "off"; }
  else input.rows = key === "improve" ? 4 : 2;
  Object.assign(input, { id: key, name: key, maxLength: max, value: feedback[key] });
  if (key === "improve") { input.required = true; input.minLength = 10; }
  input.setAttribute("aria-describedby", help.id);
  input.addEventListener("input", () => { feedback[key] = input.value; input.setCustomValidity(""); });
  group.append(label, help, input);
  return group;
}
function drawFeedback() {
  if (feedbackSaved) { feedbackSuccess(); return; }
  const wrapper = page("Gi tilbakemelding", "Hva kan vi gjøre bedre neste gang?", "Minner og mening");
  wrapper.append(el("p", "notice", "Bare arrangøren kan lese tilbakemeldingen. Lar du navnefeltet stå tomt, sendes den anonymt."));
  const form = el("form", "surface");
  const fields = el("fieldset");
  fields.disabled = feedbackBusy;
  fields.append(
    formField("improve", "Hva ønsker du at vi forbedrer til neste salong?", "Påkrevd · 10–2 000 tegn", 2000),
    formField("keep", "Hva bør vi beholde?", "Valgfritt · inntil 1 000 tegn", 1000),
    formField("topic", "Forslag til tema eller spørsmål?", "Valgfritt · inntil 1 000 tegn", 1000),
    formField("name", "Navn (valgfritt)", "Fyll ut hvis du vil at arrangøren skal vite hvem innspillet kommer fra.", 100, true),
    honeypot(feedback.website, value => { feedback.website = value; })
  );
  const error = errorBox();
  const actions = el("div", "actions");
  const submit = button(feedbackBusy ? "Sender …" : "Send tilbakemelding", "", null, "submit");
  actions.append(submit);
  fields.append(error, actions);
  form.append(fields);
  wrapper.append(form);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (feedbackBusy) return;
    const data = Object.fromEntries(new FormData(form));
    Object.assign(feedback, data);
    if (feedback.improve.trim().length < 10) {
      form.elements.improve.setCustomValidity("Skriv minst 10 tegn om hva vi kan forbedre.");
      form.elements.improve.reportValidity();
      return;
    }
    feedbackBusy = true;
    fields.disabled = true;
    error.textContent = "";
    submit.textContent = "Sender …";
    let message = "";
    try {
      if (!feedback.submissionId) feedback.submissionId = crypto.randomUUID();
      await request("tilbakemelding", { ...feedback });
      feedbackSaved = true;
      Object.keys(feedback).forEach(key => { feedback[key] = ""; });
    } catch (err) { message = err.message; }
    finally { feedbackBusy = false; }
    if (currentRoute() !== "tilbakemelding") return;
    if (feedbackSaved) { drawFeedback(); focusTitle(); return; }
    const liveForm = main.querySelector("form");
    liveForm.querySelector("fieldset").disabled = false;
    liveForm.querySelector('button[type="submit"]').textContent = "Send tilbakemelding";
    liveForm.querySelector('[role="alert"]').textContent = message;
  });
}
function goToStep(index, editing = false) {
  quiz.step = index;
  editingReview = editing;
  persistQuiz();
  drawQuiz();
  const heading = main.querySelector(".question") || main.querySelector("h1");
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function progress(step) {
  const node = el("div");
  node.append(el("p", "progress-label", "Spørsmål " + (step + 1) + " av " + questions.length));
  const line = el("div", "progress");
  line.setAttribute("aria-hidden", "true");
  ids.forEach((_, i) => line.append(el("span", i <= step ? "filled" : "")));
  node.append(line);
  return node;
}
function drawQuiz() {
  if (quiz.saved) { drawResults(); return; }
  if (quiz.step === questions.length) { drawReview(); return; }
  const i = quiz.step;
  const wrapper = page("Avsluttende quiz", "Svar når verten avslutter samtalene, eller etter salongen. Seks åpne spørsmål om kveldens temaer og ønsker for kommende salonger. Du kan hoppe over spørsmål.", "Minner og mening");
  wrapper.append(el("p", "notice", quizPrivacy));
  const box = el("section", "surface");
  const heading = el("h2", "question", questions[i]);
  heading.id = "current-question";
  box.append(progress(i), heading);
  const label = el("label", "answer-label", "Ditt svar (valgfritt)");
  label.htmlFor = "quiz-answer";
  const input = el("textarea");
  Object.assign(input, { id: "quiz-answer", rows: 4, maxLength: 700, value: quiz.answers[ids[i]] });
  input.setAttribute("aria-describedby", "current-question answer-limit");
  const counter = el("span", "counter");
  counter.id = "answer-limit";
  const updateCounter = () => { counter.textContent = input.value.length + " / 700 tegn"; };
  updateCounter();
  const actions = el("div", "wizard-foot");
  const nextLabel = () => editingReview || i === questions.length - 1 ? "Se gjennom svarene" : input.value.trim() ? "Neste spørsmål" : "Hopp over";
  const next = button(nextLabel(), "", () => goToStep(editingReview ? questions.length : i + 1));
  input.addEventListener("input", () => { quiz.answers[ids[i]] = input.value; updateCounter(); next.textContent = nextLabel(); persistQuiz(); });
  const back = i > 0 ? button("Forrige", "secondary", () => goToStep(i - 1)) : link("Til startsiden", "#start", "btn secondary");
  actions.append(back, next);
  box.append(label, input, counter, actions);
  wrapper.append(box);
}
function drawReview() {
  const wrapper = page("Se gjennom svarene", "Les gjennom og endre det du vil før du sender.", "Avsluttende quiz");
  wrapper.append(el("p", "notice", quizPrivacy));
  const form = el("form", "surface");
  const fields = el("fieldset");
  fields.disabled = quizBusy;
  const answered = ids.filter(id => quiz.answers[id].trim());
  fields.append(el("p", "review-meta", answered.length + " av " + questions.length + " spørsmål besvart"));
  questions.forEach((q, i) => {
    const section = el("section", "review-item");
    section.append(el("p", "review-meta", "Spørsmål " + (i + 1)), el("h3", "", q));
    const answer = quiz.answers[ids[i]].trim();
    const edit = button(answer ? "Endre svar" : "Skriv et svar", "small-btn", () => goToStep(i, true));
    edit.setAttribute("aria-label", (answer ? "Endre svar på spørsmål " : "Skriv svar på spørsmål ") + (i + 1));
    section.append(el("p", answer ? "answer" : "muted", answer || "Hoppet over"), edit);
    fields.append(section);
  });
  const error = errorBox();
  const actions = el("div", "actions");
  const send = button(quizBusy ? "Sender …" : "Send anonyme quizsvar", "", null, "submit");
  actions.append(send, button("Tilbake", "secondary", () => goToStep(questions.length - 1)));
  fields.append(honeypot(quizTrap, value => { quizTrap = value; }), error, actions);
  form.append(fields);
  wrapper.append(form);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (quizBusy) return;
    if (!answered.length) {
      error.textContent = "Skriv et svar på minst ett spørsmål før du sender.";
      fields.querySelector("button").focus();
      return;
    }
    error.textContent = "";
    quizBusy = true;
    fields.disabled = true;
    send.textContent = "Sender …";
    let message = "";
    try {
      if (!quiz.submissionId) quiz.submissionId = crypto.randomUUID();
      persistQuiz();
      const answers = Object.fromEntries(ids.map(id => [id, quiz.answers[id].trim()]));
      await request("quiz", { submissionId: quiz.submissionId, answers, website: quizTrap });
      quiz = { saved: true, answers: emptyAnswers(), step: 0, submissionId: "" };
      quizTrap = "";
      persistQuiz();
    } catch (err) { message = err.message; }
    finally { quizBusy = false; }
    if (currentRoute() !== "quiz") return;
    if (quiz.saved) { location.hash = "svar"; return; }
    drawQuiz();
    main.querySelector('[role="alert"]').textContent = message;
  });
}
function validResults(data) {
  if (!Number.isSafeInteger(data?.totalRespondents) || data.totalRespondents < 0 || !Array.isArray(data.questions) || data.questions.length !== ids.length) return false;
  return ids.every(id => data.questions.some(q => q?.id === id && Array.isArray(q.answers) && q.answers.every(answer => typeof answer === "string")));
}
function drawResults() {
  const wrapper = page("Quizsvarene", "Svarene er åpne for alle med lenken fram til " + deadlineLabel + ".", "Minner og mening");
  if (quiz.saved) {
    wrapper.append(el("p", "notice", "Takk! Quizsvarene dine er lagret."));
    const membership = el("div", "actions");
    membership.append(link("Bli medlem i Norsk Psykedelisk Vitenskap", "https://www.psykedeliskvitenskap.no/pricing-plans/list", "btn"));
    wrapper.append(membership);
  }
  const container = el("section", "surface");
  const status = el("p", "summary-meta", "Henter svar …");
  status.setAttribute("role", "status");
  const body = el("div");
  const groups = [];
  container.append(status, body);
  wrapper.append(container);
  const actions = el("div", "actions");
  actions.append(quiz.saved ? link("Gi tilbakemelding", "#tilbakemelding", "btn secondary") : link("Gå til quizen", "#quiz", "btn secondary"));
  wrapper.append(actions);

  let pollTimer, deadlineTimer, activeRequest, closed = false;
  let expires = Infinity, expiresAtDevice = wallDeadline;

  function pause() {
    clearTimeout(pollTimer);
    activeRequest?.abort();
    activeRequest = undefined;
  }
  function closeWall() {
    closed = true;
    pause();
    clearTimeout(deadlineTimer);
    body.replaceChildren();
    groups.length = 0;
    status.textContent = "Visningen ble avsluttet " + deadlineLabel + ". Svarene er lagret hos arrangøren.";
  }
  function armDeadline() {
    clearTimeout(deadlineTimer);
    const left = Math.min(expires - performance.now(), expiresAtDevice - Date.now());
    if (left <= 0) { closeWall(); return; }
    deadlineTimer = setTimeout(armDeadline, Math.min(left, 2147483647));
  }
  function updateGroups(data) {
    if (!groups.length) {
      questions.forEach((q, i) => {
        const section = el("section", "result-question");
        const list = el("ul");
        const empty = el("p", "muted", "Ingen svar på dette spørsmålet ennå.");
        section.append(el("p", "review-meta", "Spørsmål " + (i + 1)), el("h2", "", q), empty, list);
        body.append(section);
        groups.push({ list, empty });
      });
    }
    groups.forEach(({ list, empty }, i) => {
      const answers = data.questions.find(q => q.id === ids[i]).answers;
      empty.hidden = answers.length > 0;
      let next = list.firstElementChild;
      for (const answer of answers) {
        // The API keeps existing answers in stable order when a new answer arrives.
        if (next?.textContent === answer) next = next.nextElementSibling;
        else list.insertBefore(el("li", "answer", answer), next);
      }
      while (next) {
        const unused = next;
        next = next.nextElementSibling;
        unused.remove();
      }
    });
  }
  async function loadResults() {
    if (closed || document.hidden || activeRequest) return;
    const operation = new AbortController();
    activeRequest = operation;
    const started = performance.now(), deviceStart = Date.now();
    try {
      const data = await request("svar?v=2", undefined, operation);
      if (operation.signal.aborted) return;
      if (data?.closed === true) { closeWall(); return; }
      if (!validResults(data) || data.closed !== false || !Number.isFinite(data.remainingMs) || data.remainingMs <= 0) {
        throw new Error("Ugyldig svar fra tjenesten.");
      }
      // Use the server clock and subtract the whole request time conservatively.
      expires = started + data.remainingMs;
      expiresAtDevice = deviceStart + data.remainingMs;
      armDeadline();
      if (closed) return;
      updateGroups(data);
      body.hidden = false;
      const count = data.totalRespondents === 1 ? "1 deltaker har svart" : data.totalRespondents + " deltakere har svart";
      const message = count + " · Oppdateres automatisk";
      if (status.textContent !== message) status.textContent = message;
    } catch {
      if (activeRequest !== operation) return;
      armDeadline();
      if (!closed) status.textContent = "Kunne ikke hente nye svar. Prøver igjen automatisk.";
    } finally {
      if (activeRequest === operation) {
        activeRequest = undefined;
        if (!closed && !document.hidden) pollTimer = setTimeout(loadResults, 2000);
      }
    }
  }
  function visibilityChanged() {
    pause();
    if (closed) return;
    body.hidden = true;
    if (!document.hidden) {
      armDeadline();
      loadResults();
    }
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  stopWall = () => {
    pause();
    clearTimeout(deadlineTimer);
    document.removeEventListener("visibilitychange", visibilityChanged);
    body.replaceChildren();
    groups.length = 0;
  };
  // The first API read supplies the authoritative time, including for a device with clock skew.
  loadResults();
  if (Date.now() < wallDeadline) armDeadline();
}
function currentRoute() { return location.hash.slice(1); }
function route(focus) {
  stopWall?.();
  stopWall = undefined;
  switch (currentRoute()) {
    case "tilbakemelding": drawFeedback(); break;
    case "quiz": drawQuiz(); break;
    case "svar": drawResults(); break;
    default: main.replaceChildren(document.querySelector("#home").content.cloneNode(true));
  }
  if (focus) focusTitle();
}
document.querySelector(".skip").addEventListener("click", event => { event.preventDefault(); main.focus(); });
window.addEventListener("hashchange", () => route(true));
window.addEventListener("pagehide", () => { stopWall?.(); stopWall = undefined; });
window.addEventListener("pageshow", event => { if (event.persisted) route(false); });
route(false);
