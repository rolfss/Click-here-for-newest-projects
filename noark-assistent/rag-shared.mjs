import { answerQuestion, searchRecords, findIntent, tokenize, getRecord, getSource, sourceUrl } from './engine.mjs';

export const MODEL_ID = 'gpt-6-luna';
export const MODEL_LABEL = 'GPT-6 Luna';
export const MAX_QUESTION = 1000;
export const MAX_HISTORY = 4;
export const ANSWER_LIMITS = Object.freeze({ claims: 6, claimChars: 1000, words: 650 });

function isFollowup(question) {
  return /^(og\b|men\b|hva med\b|gjelder (det|dette)|kan du (utdype|forklare|konkretisere|gi (meg |oss )?(et eksempel|en sjekkliste))|utdyp\b|hvorfor\b|hva betyr det\b|gi (meg |oss )?(et eksempel|en (konkret )?sjekkliste)|hva (bør|skal|må) (vi|jeg) gjøre (først|nå)|forklar (enklere|nærmere)|oppsummer\b|kortere\b)|\b(denne|disse|dette|det samme|i så fall)\b/i.test(question);
}

export function cleanConversation(question, history = []) {
  if (typeof question !== 'string' || question.trim().length < 2 || question.length > MAX_QUESTION)
    throw new Error('Spørsmålet må ha mellom 2 og 1000 tegn.');
  if (!Array.isArray(history) || history.length > MAX_HISTORY) throw new Error('For lang samtalehistorikk.');
  const messages = history.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || message.content.length > 1500)
      throw new Error('Ugyldig samtalehistorikk.');
    return { role: message.role, content: message.content.trim() };
  });
  return { question: question.trim(), history: messages };
}

export function retrievalQuery(question, history = []) {
  const previous = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
  // A self-contained new topic must not inherit unrelated earlier sources.
  const followup = isFollowup(question);
  if (!previous.length || (!followup && (findIntent(question) || tokenize(question).length >= 3))) return question;
  // Start at the latest independent question, so a follow-up cannot revive an old topic.
  const start = previous.findLastIndex((text) => !isFollowup(text) && (findIntent(text) || tokenize(text).length >= 3));
  return [...previous.slice(Math.max(0, start)), question, question].join(' ');
}

export function retrieveConversation(question, history = [], limit = 12) {
  const query = retrievalQuery(question, history);
  const candidates = answerQuestion(query, { limit }).results;
  const direct = searchRecords(question, { limit });
  const map = new Map(candidates.map((result) => [result.record.id, result]));
  for (const result of direct) {
    if (!map.has(result.record.id) && map.size < limit) map.set(result.record.id, result);
  }
  let selected = [...map.values()].sort((a, b) => b.relevance - a.relevance || b.score - a.score).slice(0, limit);
  if (selected.some((r) => r.record.source === 'na-formats') && limit >= 3) {
    // Keep the conditions with individual format rows. They are context, not fabricated high-score hits.
    const required = ['guide-format-agreement', 'guide-format-conversion'];
    const ranked = new Map(searchRecords(query, { limit: 50 }).map((r) => [r.record.id, r]));
    const context = required.map((id) => {
      const record = getRecord(id);
      return ranked.get(id) ?? { record, source: getSource(record.source), url: sourceUrl(record), score: 0,
        relevance: 0, relevanceMethod: 'lexical', relevanceReason: 'Avtalevilkår som kontekst til formatoppføringen.' };
    });
    selected = [...selected.filter((r) => !required.includes(r.record.id)).slice(0, limit - context.length), ...context];
  }
  return selected.sort((a, b) => b.relevance - a.relevance || b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function fallbackAnswer(question, history = [], note = '') {
  const query = retrievalQuery(question, history);
  const answer = answerQuestion(query, { limit: 8, pointCount: 2 });
  return { ...answer, query: question, mode: 'local', model: null,
    guidance: [note, 'Lokalt kildesøk uten språkmodell. Kontroller originalkildene.'].filter(Boolean).join(' ') };
}

// An explicitly requested AI answer must never be replaced by a canned answer.
export function lunaFailureAnswer(question, history = [], message = '') {
  return { status: 'insufficient', query: question, mode: 'unavailable', model: null,
    lead: 'KI svarte ikke på spørsmålet. Du har ikke fått en KI-vurdering.', leadCitations: [], points: [],
    confidence: { level: 'lav', label: 'Ingen KI-vurdering', score: 0 },
    results: retrieveConversation(question, history),
    guidance: message || 'Prøv igjen, eller slå av KI for å bruke lokalt kildesøk.' };
}

export function responseSchema(candidates) {
  const recordId = { type: 'string', enum: candidates.map(({ record }) => record.id) };
  return {
    type: 'object', additionalProperties: false,
    required: ['status', 'claims', 'limitation', 'relevance'],
    properties: {
      status: { type: 'string', enum: ['answered', 'insufficient'] },
      claims: { type: 'array', maxItems: ANSWER_LIMITS.claims, items: {
        type: 'object', additionalProperties: false, required: ['text', 'recordIds'],
        properties: { text: { type: 'string', maxLength: ANSWER_LIMITS.claimChars },
          recordIds: { type: 'array', minItems: 1, maxItems: 3, items: recordId } },
      } },
      limitation: { type: 'string', maxLength: 350 },
      relevance: { type: 'array', minItems: candidates.length, maxItems: candidates.length, items: {
        type: 'object', additionalProperties: false, required: ['recordId', 'score', 'reason'],
        properties: { recordId, score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', maxLength: 160 } },
      } },
    },
  };
}

function safeText(value, limit) {
  if (typeof value !== 'string' || value.length > limit || /https?:\/\/|www\.|<[^>]+>|\]\(/i.test(value))
    throw new Error('Ugyldig modelltekst.');
  return value.trim();
}

// Only server-owned corpus objects can supply links, sections and page anchors.
export function finalizeAnswer(question, parsed, candidates, provider = { mode: 'luna', model: MODEL_ID }) {
  if (!((provider.mode === 'luna' && provider.model === MODEL_ID) ||
      (provider.mode === 'bonsai' && provider.model === 'Bonsai-2-27B-PQ2_0')))
    throw new Error('Ukjent svarmodell.');
  if (!parsed || !['answered', 'insufficient'].includes(parsed.status) || !Array.isArray(parsed.relevance) ||
      parsed.relevance.length !== candidates.length || !Array.isArray(parsed.claims) || parsed.claims.length > ANSWER_LIMITS.claims)
    throw new Error('Ugyldig modellrespons.');
  const known = new Map(candidates.map((result) => [result.record.id, result]));
  const scores = new Map();
  for (const item of parsed.relevance) {
    if (!known.has(item.recordId) || scores.has(item.recordId) || !Number.isInteger(item.score) || item.score < 0 || item.score > 100)
      throw new Error('Ugyldig kilderelevans.');
    scores.set(item.recordId, { score: item.score, reason: safeText(item.reason, 160) });
  }
  const results = candidates.map((r) => ({ ...r, relevance: scores.get(r.record.id).score,
    relevanceReason: scores.get(r.record.id).reason, relevanceMethod: provider.mode, lexicalRelevance: r.relevance }))
    .sort((a, b) => b.relevance - a.relevance || b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const rank = new Map(results.map((r) => [r.record.id, r.rank]));
  const limitation = safeText(parsed.limitation, 350);
  const claims = parsed.claims.map((claim) => {
    const text = safeText(claim.text, ANSWER_LIMITS.claimChars);
    if (!text || !Array.isArray(claim.recordIds) || claim.recordIds.length < 1 || claim.recordIds.length > 3 ||
        new Set(claim.recordIds).size !== claim.recordIds.length ||
        claim.recordIds.some((id) => !rank.has(id) || scores.get(id).score < 50))
      throw new Error('Påstand uten tilstrekkelig kildehenvisning.');
    return { text, citations: claim.recordIds.map((id) => rank.get(id)) };
  });
  if ([...claims.map((c) => c.text), limitation].join(' ').split(/\s+/u).length > ANSWER_LIMITS.words)
    throw new Error('Svaret er for langt.');
  if (parsed.status === 'answered' && !claims.length) throw new Error('Svar mangler.');
  if (parsed.status === 'insufficient' && claims.length) throw new Error('Motstridende svarstatus.');
  const top = results[0]?.relevance ?? 0;
  const confidence = { level: top >= 80 ? 'høy' : top >= 50 ? 'middels' : 'lav',
    label: top >= 80 ? 'Høy anslått kilderelevans' : top >= 50 ? 'Delvis kilderelevans' : 'Svakt kildegrunnlag', score: top };
  return {
    status: parsed.status === 'answered' ? 'ok' : 'insufficient', query: question,
    mode: provider.mode, model: provider.model, confidence, results,
    lead: claims[0]?.text ?? 'Jeg fant ikke tilstrekkelig grunnlag for et presist svar i disse kildepostene.',
    leadCitations: claims[0]?.citations ?? [], leadCitation: claims[0]?.citations[0],
    points: claims.slice(1).map((p) => ({ ...p, citation: p.citations[0] })),
    guidance: [limitation, 'KI kan feile. Kontroller ordlyden i originalkildene.'].filter(Boolean).join(' '),
  };
}
