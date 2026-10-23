const BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_MODEL = 'jev-latest';
const MAX_STATE_CHARS = 60000;
const MAX_QUESTION_CHARS = 4000;
const MAX_OPTIONS = 100;

function requiredKey(env = process.env) {
  const key = env.TYPESAFE_API_KEY;
  if (typeof key !== 'string' || key.trim().length < 12) {
    throw new Error('TYPESAFE_API_KEY is not configured for this process.');
  }
  return key.trim();
}

function boundedString(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  if (value.length > max) throw new Error(`${name} exceeds ${max} characters.`);
  return value;
}

function cleanOptions(options) {
  if (!Array.isArray(options) || options.length < 2 || options.length > MAX_OPTIONS) {
    throw new Error(`options must contain 2-${MAX_OPTIONS} entries.`);
  }
  const out = {};
  for (const item of options) {
    if (!item || typeof item.label !== 'string' || !item.label.trim()) throw new Error('Each option needs a label.');
    const label = item.label.trim();
    if (Object.hasOwn(out, label)) throw new Error(`Duplicate option label: ${label}`);
    out[label] = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null;
  }
  return out;
}

function cleanLevels(levels) {
  if (!Array.isArray(levels) || levels.length < 2 || levels.length > MAX_OPTIONS) {
    throw new Error(`levels must contain 2-${MAX_OPTIONS} entries.`);
  }
  return levels.map((x, i) => boundedString(x, `levels[${i}]`, 2000));
}

export function buildNoulRequest({ state, question, yesCriteria, noCriteria, model = DEFAULT_MODEL }) {
  const q = { type: 'noul', instructions: boundedString(question, 'question', MAX_QUESTION_CHARS) };
  if ((yesCriteria && String(yesCriteria).trim()) || (noCriteria && String(noCriteria).trim())) {
    q.criteria = {
      true: yesCriteria ? boundedString(String(yesCriteria), 'yesCriteria', 2000) : null,
      false: noCriteria ? boundedString(String(noCriteria), 'noCriteria', 2000) : null
    };
  }
  return { model, state: boundedString(state, 'state', MAX_STATE_CHARS), questions: { decision: q } };
}

export function buildChoiceRequest({ state, question, options, model = DEFAULT_MODEL }) {
  return {
    model,
    state: boundedString(state, 'state', MAX_STATE_CHARS),
    questions: {
      decision: {
        type: 'choice',
        instructions: boundedString(question, 'question', MAX_QUESTION_CHARS),
        criteria: cleanOptions(options)
      }
    }
  };
}

export function buildScoreRequest({ state, question, levels, model = DEFAULT_MODEL }) {
  return {
    model,
    state: boundedString(state, 'state', MAX_STATE_CHARS),
    questions: {
      decision: {
        type: 'score',
        instructions: boundedString(question, 'question', MAX_QUESTION_CHARS),
        criteria: cleanLevels(levels)
      }
    }
  };
}

async function readJson(response, maxBytes = 100000) {
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('TypeSafe response exceeded the local safety limit.');
  try { return JSON.parse(text); } catch { throw new Error('TypeSafe returned invalid JSON.'); }
}

export async function callJev(payload, { fetchImpl = fetch, env = process.env } = {}) {
  const response = await fetchImpl(`${BASE_URL}/v1/systemone`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredKey(env)}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const data = await readJson(response);
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : `HTTP ${response.status}`;
    throw new Error(`TypeSafe request failed: ${detail}`);
  }
  if (!data?.answers?.decision) throw new Error('TypeSafe response did not contain answers.decision.');
  return { answer: data.answers.decision, model: data.model ?? payload.model, usage: data.usage ?? null };
}

export async function listModels({ fetchImpl = fetch, env = process.env } = {}) {
  const response = await fetchImpl(`${BASE_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${requiredKey(env)}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`TypeSafe model lookup failed with HTTP ${response.status}.`);
  return data;
}

export { DEFAULT_MODEL };
