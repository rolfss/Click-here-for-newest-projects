import { buildPayload, readBounded } from '../worker.mjs';
import { finalizeAnswer } from '../../noark-assistent/rag-shared.mjs';

const FAILURE = 'Local Luna comparison failed; no automatic retry was made.';
const TIMEOUT_MS = 85000;
const RESPONSE_BYTES = 160000;

export async function evaluateLuna(question, history, candidates, { apiKey, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error(FAILURE);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(FAILURE));
    }, TIMEOUT_MS);
  });
  try {
    const operation = async () => {
      const { body } = buildPayload(question, history, candidates);
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(FAILURE);
      const result = await readBounded(response, RESPONSE_BYTES);
      const usage = result?.usage;
      if (result?.status !== 'completed' || !usage ||
          !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0 ||
          !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0) throw new Error(FAILURE);
      const text = result.output.filter((part) => part.type === 'message')
        .flatMap((part) => part.content ?? []).filter((part) => part.type === 'output_text')
        .map((part) => {
          if (typeof part.text !== 'string') throw new Error(FAILURE);
          return part.text;
        }).join('');
      const normalizedAnswer = finalizeAnswer(question, JSON.parse(text), candidates);
      return { candidates: normalizedAnswer.results,
        usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } };
    };
    // The deadline also covers a stalled body when an injected fetch ignores abort.
    return await Promise.race([operation(), deadline]);
  } catch {
    // Do not propagate upstream bodies, model text, network errors, or credentials.
    throw new Error(FAILURE);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
