import { API_CONFIG } from './api-config.mjs';
import { BUILD_INFO, LEGACY_CORPUS_VERSION, LEGACY_RECORD_IDS } from './data.mjs';
import { getRecord, getSource, sourceUrl } from './engine.mjs';
import { MODEL_ID, ANSWER_LIMITS, cleanConversation, retrieveConversation } from './rag-shared.mjs';

export const BONSAI_MODEL_ID = 'Bonsai-2-27B-PQ2_0';

export function backendOrigin(value = API_CONFIG.origin) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Ugyldig backendadresse.');
  return url.origin;
}

export function acceptedCorpus(version) {
  return version === BUILD_INFO.corpusVersion || version === LEGACY_CORPUS_VERSION;
}

export function needsUpdatedCorpus(question, history = []) {
  return retrieveConversation(question, history).slice(0, 3).some((r) => !LEGACY_RECORD_IDS.has(r.record.id));
}

export function jevEnabled(status) {
  return status?.configured === true && status.retrieval?.provider === 'jev' && status.retrieval.enabled === true;
}

export function bonsaiEnabled(status) {
  return status?.configured === true && status.fallback?.enabled === true && status.fallback.model === BONSAI_MODEL_ID;
}

export function aiDisclosure(status) {
  const jev = jevEnabled(status);
  const bonsai = bonsaiEnabled(status);
  return {
    label: 'Bruk KI: Luna (OpenAI)' + (bonsai ? ' eller Bonsai' : '') + (jev ? ', med kildevalg fra JEV (TypeSafe)' : ''),
    text: 'Når du krysser av, samtykker du til behandlingen beskrevet her. Når Luna er valgt, sendes spørsmålet, opptil fire tidligere meldinger og relevante kildeposter til OpenAI for å skrive svaret.' +
      (jev ? ' Spørsmålet, relevant kontekst fra dine tidligere spørsmål og kildeposter sendes også til TypeSafe, der JEV velger kilder før svarmodellen skriver.' : '') +
      (bonsai ? ' Hvis du velger Bonsai, eller Luna er utilgjengelig eller har nådd bruksgrensen, kan spørsmålet, opptil fire tidligere meldinger og kildeposter sendes via en privat Cloudflare-forbindelse til appens eiers PC, der Bonsai kan skrive svaret. Når du velger Bonsai direkte, sendes ikke innholdet til OpenAI.' : '') +
      ' Dette går via en beskyttet backend. Ikke skriv personopplysninger, pasientinformasjon eller taushetsbelagt innhold. Lokalt kildesøk forlater ikke nettleseren. Nylige spørsmål lagres lokalt og kan slettes nedenfor.',
  };
}

export function answerModeLabel(answer) {
  if (answer.mode === 'bonsai') return 'Bonsai · på eierens PC';
  if (answer.mode === 'luna') return 'GPT-6 Luna · medium';
  return answer.mode === 'unavailable' ? 'KI-svar utilgjengelig' : 'Lokalt kildesøk';
}

export function providerNotice(answer) {
  if (answer.mode !== 'bonsai') return '';
  if (answer.fallbackReason === 'luna_capacity') return 'Bonsai svarte fordi Luna var utilgjengelig eller hadde nådd bruksgrensen.';
  if (answer.fallbackReason === 'app_budget') return 'Bonsai svarte fordi appens felles prøve- eller periodebudsjett var nådd. Ingen ny betalt modellforespørsel ble startet.';
  return '';
}

export function retrievalNotice(answer) {
  if (!['luna', 'bonsai'].includes(answer.mode)) return '';
  const writer = answer.mode === 'bonsai' ? 'Bonsai' : 'Luna';
  if (answer.retrieval?.status === 'completed') return `JEV valgte kildegrunnlaget, og ${writer} skrev svaret. Kontroller tolkningen i originalkildene.`;
  if (answer.retrieval?.status === 'unavailable') return `JEV var ikke tilgjengelig. ${writer} skrev svaret med kilder fra det vanlige kildesøket.`;
  if (answer.retrieval?.status === 'not_consented') return `JEV ble ikke brukt fordi samtykke til TypeSafe manglet. ${writer} brukte det vanlige kildesøket.`;
  return '';
}

export async function loadLunaStatus() {
  try {
    const origin = backendOrigin();
    if (!origin) return { configured: false, message: 'Luna er klargjort, men ikke aktivert. Lokalt kildesøk fungerer.' };
    const response = await fetch(`${origin}/api/health`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error();
    const status = await response.json();
    if (status.model !== MODEL_ID || !acceptedCorpus(status.corpusVersion))
      throw new Error('Backend og kildebase må oppdateres samtidig.');
    const configured = status.configured === true && typeof status.siteKey === 'string' && Boolean(status.siteKey);
    const retrieval = { provider: 'jev', enabled: status.retrieval?.provider === 'jev' && status.retrieval.enabled === true };
    const fallback = { enabled: status.fallback?.enabled === true && status.fallback.model === BONSAI_MODEL_ID,
      available: status.fallback?.available === true, model: BONSAI_MODEL_ID };
    let message = !configured ? 'Luna venter på sikker aktivering. Lokalt kildesøk fungerer.' : status.corpusVersion === BUILD_INFO.corpusVersion
        ? retrieval.enabled ? 'JEV kan velge kilder, og Luna kan skrive svaret. Aktiver KI nedenfor.' : 'Luna-backend er klar med utvidet kildegrunnlag. Aktiver KI nedenfor.'
        : 'Luna bruker foreløpig kildegrunnlaget fra 02.09.2026. Nye veiledere brukes i lokalt søk inntil bakenden er oppdatert.';
    if (configured && fallback.enabled) message += fallback.available ? ' Bonsai er tilgjengelig som reserve.' : ' Bonsai-reserven er ikke tilgjengelig akkurat nå.';
    return { ...status, currentCorpus: status.corpusVersion === BUILD_INFO.corpusVersion, configured, retrieval, fallback, message };
  } catch { return { configured: false, message: 'Luna-backend er ikke tilgjengelig. Lokalt kildesøk fungerer.' }; }
}

export function validateUiAnswer(answer) {
  if (!answer || !['luna', 'bonsai'].includes(answer.mode) || answer.model !== (answer.mode === 'bonsai' ? BONSAI_MODEL_ID : MODEL_ID) || !acceptedCorpus(answer.corpusVersion) ||
      !['ok', 'insufficient'].includes(answer.status) || !Array.isArray(answer.results) || answer.results.length > 12 ||
      typeof answer.lead !== 'string' || answer.lead.length > ANSWER_LIMITS.claimChars || !Array.isArray(answer.points) || answer.points.length >= ANSWER_LIMITS.claims)
    throw new Error('Ugyldig svar fra backend.');
  if (answer.retrieval !== undefined && (!answer.retrieval || Array.isArray(answer.retrieval) ||
      !['completed', 'unavailable', 'disabled', 'not_consented'].includes(answer.retrieval.status) ||
      answer.retrieval.method !== (answer.retrieval.status === 'completed' ? 'jev' : 'lexical')))
    throw new Error('Ugyldig status for kildevalg.');
  if (answer.fallbackReason !== undefined && (answer.mode !== 'bonsai' || !['luna_capacity', 'app_budget'].includes(answer.fallbackReason)))
    throw new Error('Ugyldig status for reservemodell.');
  const ids = new Set();
  const results = answer.results.map((r, i) => {
    const record = getRecord(r.record?.id);
    if (!record || (answer.corpusVersion === LEGACY_CORPUS_VERSION && !LEGACY_RECORD_IDS.has(record.id)) || ids.has(record.id) || r.rank !== i + 1 || !Number.isInteger(r.relevance) || r.relevance < 0 || r.relevance > 100 ||
        r.relevanceMethod !== answer.mode || typeof r.relevanceReason !== 'string' || r.relevanceReason.length > 160 || (i && answer.results[i - 1].relevance < r.relevance))
      throw new Error('Ugyldige kildehenvisninger.');
    ids.add(record.id);
    return { ...r, record, source: getSource(record.source), url: sourceUrl(record) };
  });
  for (const claim of [{ text: answer.lead, citations: answer.leadCitations }, ...answer.points]) {
    if (typeof claim.text !== 'string' || claim.text.length > 1000 || !Array.isArray(claim.citations) ||
        (answer.status === 'ok' && !claim.citations.length) || claim.citations.some((n) => !Number.isInteger(n) || n < 1 || n > results.length))
      throw new Error('Ugyldige påstandshenvisninger.');
  }
  if (!answer.confidence || !['høy', 'middels', 'lav'].includes(answer.confidence.level) ||
      !Number.isFinite(answer.confidence.score) || typeof answer.confidence.label !== 'string' ||
      typeof answer.guidance !== 'string' || answer.guidance.length > 500) throw new Error('Ugyldige svarfelt.');
  return { ...answer, results, guidance: answer.corpusVersion === LEGACY_CORPUS_VERSION ? `${answer.guidance.slice(0, 360)} Dette KI-svaret bruker det eldre kildegrunnlaget fra 02.09.2026.` : answer.guidance };
}

export async function askLuna(question, history, token, signal, options = {}) {
  const clean = cleanConversation(question, history);
  if (options.providerPreference !== undefined && !['luna', 'bonsai'].includes(options.providerPreference))
    throw new Error('Ukjent svarmodell. Velg svarmodell på nytt.');
  const directBonsai = options.providerPreference === 'bonsai';
  if (directBonsai && options.bonsaiConsent !== true)
    throw new Error('Bonsai krever samtykke før spørsmålet kan sendes. Aktiver KI og velg Bonsai på nytt.');
  if (options.corpusVersion === LEGACY_CORPUS_VERSION && needsUpdatedCorpus(question, history))
    throw new Error('Luna-serveren mangler de nye veilederne og må oppdateres før den kan besvare dette spørsmålet. Kildene til høyre kan leses nå.');
  if (!token) throw new Error('Fullfør sikkerhetskontrollen før du sender til Luna.');
  const response = await fetch(`${backendOrigin()}/api/chat`, { method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...clean, requestId: crypto.randomUUID(), turnstileToken: token,
      ...(options.jevConsent === true ? { ragConsent: '2026-09-26-jev-v1' } : {}),
      ...(options.bonsaiConsent === true ? { bonsaiConsent: '2026-09-26-bonsai-v1' } : {}),
      ...(options.bonsaiConsent === true && options.providerPreference === 'bonsai' ? { providerPreference: 'bonsai' } : {}),
      qualityConsent: options.qualityConsent === true ? '2026-09-review-v1' : '' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(210000)].filter(Boolean)),
  });
  const answer = await response.json();
  if (!response.ok) throw new Error(typeof answer.message === 'string' ? answer.message.slice(0, 300) : 'Luna er ikke tilgjengelig.');
  // The backend may abstain locally without making a paid model call.
  if (answer.mode === 'local') throw new Error('Kildesøket fant ikke tilstrekkelig grunnlag for Luna. Beskriv arkivspørsmålet nærmere, eller still et oppfølgingsspørsmål til et tidligere Luna-svar.');
  const checked = validateUiAnswer(answer);
  if (directBonsai && checked.mode !== 'bonsai')
    throw new Error('Svaret kom ikke fra valgt Bonsai-modell. Last inn siden på nytt før du prøver igjen.');
  if ((checked.mode === 'bonsai' && options.bonsaiConsent !== true) ||
      (checked.retrieval?.method === 'jev' && options.jevConsent !== true))
    throw new Error('Svaret oppgir en tjeneste uten samtykke i forespørselen. Last inn siden på nytt før du prøver igjen.');
  return checked;
}

let turnstileLoad;
export async function mountBotCheck(siteKey, target, onToken) {
  if (!turnstileLoad) turnstileLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { turnstileLoad = null; script.remove(); reject(new Error('Sikkerhetskontrollen kunne ikke lastes.')); };
    document.head.append(script);
  });
  await turnstileLoad;
  return window.turnstile.render(target, { sitekey: siteKey, action: 'noark-chat', theme: 'light',
    callback: (token) => onToken(token), 'expired-callback': () => onToken(''), 'error-callback': () => { onToken(''); return true; },
  });
}
export function resetBotCheck(widget) {
  if (widget !== null && window.turnstile) window.turnstile.reset(widget);
}
