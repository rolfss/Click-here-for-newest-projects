import { cleanConversation, retrieveConversation } from '../noark-assistent/rag-shared.mjs';
import { JEV_LIMITS, buildRerankRequest, callJev, selectReranked } from './jev-rag.mjs';

// A versioned, separate consent covers sending the question and relevant user
// context to TypeSafe. Existing Luna-only clients do not grant this consent.
export const RAG_CONSENT = '2026-09-26-jev-v1';

// Trial-ledger allowance, NOT a statement of TypeSafe's invoice prices. Use one
// microUSD per input/output token, payload UTF-8 bytes plus framing headroom for
// input, and the entire allowed response byte count as output-token headroom.
// The API does not offer a per-call monetary cap. Unknown usage retains this
// allowance; verified usage above it is still charged in full to the ledger.
export const JEV_BUDGET = Object.freeze({ microUsdPerToken: 1, inputHeadroom: 4096 });
const encoder = new TextEncoder();
const plans = new WeakMap();

function validKey(key) {
  return typeof key === 'string' && key.trim().length >= 12 && key.length <= 4096 && !/\s/.test(key.trim());
}

export function retrievalEnabled(env) {
  return env?.JEV_ENABLED === 'true' && validKey(env.TYPESAFE_API_KEY);
}

function freezePayload(value) {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freezePayload(nested);
    Object.freeze(value);
  }
  return value;
}

function makePlan(candidates, status, payload = null, pool = null) {
  const reserve = payload ? (encoder.encode(JSON.stringify(payload)).byteLength +
    JEV_BUDGET.inputHeadroom + JEV_LIMITS.responseBytes) * JEV_BUDGET.microUsdPerToken : 0;
  // Preserve the original corpus records/URLs. Freeze wrappers only, never the
  // shared corpus objects. Payload records are independent data-only objects.
  const plan = Object.freeze({ candidates: Object.freeze(candidates.map((entry) => Object.freeze(entry))),
    payload: freezePayload(payload), reserve, status });
  plans.set(plan, { pool, pending: null });
  return plan;
}

// Pure preparation: no keys in the plan, network requests or budget mutations.
// The caller must authenticate/rate-limit and reserve plan.reserve before run.
export function prepareRetrieval(question, history, env, consent) {
  const clean = cleanConversation(question, history);
  const candidates = retrieveConversation(clean.question, clean.history, JEV_LIMITS.selected);
  if (!retrievalEnabled(env)) return makePlan(candidates, 'disabled');
  if (consent !== RAG_CONSENT) return makePlan(candidates, 'not_consented');
  if (!candidates.length) return makePlan(candidates, 'unavailable');
  try {
    const pool = retrieveConversation(clean.question, clean.history, JEV_LIMITS.candidatePool);
    return makePlan(candidates, 'ready', buildRerankRequest(clean.question, clean.history, pool), pool);
  } catch {
    // Oversized/invalid curated context must never be truncated to fit a model.
    return makePlan(candidates, 'unavailable');
  }
}

function lexical(plan, status, charged = 0) {
  return { candidates: plan.candidates, retrieval: { method: 'lexical', status }, charged };
}

export async function runRetrieval(plan, env, { fetchImpl = fetch } = {}) {
  const state = plans.get(plan);
  if (!state) throw new Error('Invalid retrieval plan.');
  // One prepared, reserved request can never initiate a second paid request,
  // including when two callers accidentally execute the same plan concurrently.
  if (state.pending) return state.pending;
  state.pending = (async () => {
    if (plan.status !== 'ready') return lexical(plan, plan.status);
    if (!retrievalEnabled(env)) return lexical(plan, 'disabled');
    try {
      const result = await callJev(plan.payload, { apiKey: env.TYPESAFE_API_KEY, fetchImpl });
      const charged = (result.usage.input_tokens + result.usage.output_tokens) * JEV_BUDGET.microUsdPerToken;
      if (!Number.isSafeInteger(charged) || charged < 0) return lexical(plan, 'unavailable', plan.reserve);
      const candidates = selectReranked(state.pool, result.answers, JEV_LIMITS.selected)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
      return { candidates, retrieval: { method: 'jev', status: 'completed' }, charged };
    } catch {
      // No remote diagnostics or keys leave this boundary, and no retry. Once
      // dispatched, absent/malformed usage cannot justify a budget refund.
      return lexical(plan, 'unavailable', plan.reserve);
    }
  })();
  return state.pending;
}
