import { it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import worker from '../worker.mjs';
import { MODEL, PROFILE_REVISION } from '../protocol.mjs';
import { BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION, prepareBonsaiRequest } from '../../noark-api/bonsai-protocol.mjs';
import { retrieveConversation } from '../../noark-assistent/rag-shared.mjs';

const sockets = [];
const stub = () => env.LOCAL_RELAY.getByName('rolf-workstation');
const input = () => ({ question: 'Hva er systemID?', history: [],
  recordIds: retrieveConversation('Hva er systemID?').map(r => r.record.id),
  protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION });
function next(ws) { return new Promise(resolve => ws.addEventListener('message', e => resolve(JSON.parse(e.data)), { once: true })); }
async function connect(noark = true) {
  const response = await worker.fetch(new Request('https://example.com/api/local/connect', { headers: {
    Upgrade: 'websocket', Authorization: `Bearer ${env.LOCAL_CONNECTOR_KEY}` } }), env);
  expect(response.status).toBe(101);
  const ws = response.webSocket; ws.accept(); sockets.push(ws);
  const ack = next(ws);
  ws.send(JSON.stringify({ type: 'health', model: MODEL, available: true, gpu: true, profileRevision: PROFILE_REVISION,
    ...(noark ? { noarkRevision: BONSAI_PROTOCOL_REVISION, noarkCorpus: BONSAI_CORPUS_VERSION } : {}) }));
  await ack; return ws;
}
function answer(message, changes = {}) {
  const recordIds = prepareBonsaiRequest(message).recordIds;
  return { type: 'noark-answer', id: message.id, result: { model: MODEL,
    corpusVersion: BONSAI_CORPUS_VERSION, protocolRevision: BONSAI_PROTOCOL_REVISION, recordIds,
    parsed: { status: 'answered', claims: [{ text: 'Identifikatoren følger kildebeskrivelsen.', recordIds: [recordIds[0]] }],
      limitation: '', relevance: recordIds.map(recordId => ({ recordId, score: 90, reason: 'Relevant kilde.' })) }, ...changes } };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const ws of sockets.splice(0)) ws.close(1000);
  await runInDurableObject(stub(), (instance, state) => {
    instance.finishAll(); for (const socket of state.getWebSockets()) { socket.serializeAttachment({ available: false }); socket.close(1000); }
  });
});

it('NOARK has no public generation route and keeps connector authentication', async () => {
  for (const path of ['/api/noark', '/api/bonsai', '/api/bonsai/generate'])
    expect((await worker.fetch(new Request(`https://example.com${path}`, { method: 'POST' }), env)).status).toBe(404);
  expect((await worker.fetch(new Request('https://example.com/api/local/connect', { headers: { Upgrade: 'websocket' } }), env)).status).toBe(401);
});

it('old connectors keep Second Rolf ready while NOARK requires its separate capability', async () => {
  await connect(false);
  expect((await stub().health()).available).toBe(true);
  expect((await stub().noarkHealth()).available).toBe(false);
  expect(await stub().noark(input())).toEqual({ error: 'local_model_unavailable' });
});

it('NOARK relay dispatches canonical IDs and validates a distinct structured answer', async () => {
  const ws = await connect();
  const pendingMessage = next(ws);
  const pending = stub().noark(input());
  const message = await pendingMessage;
  expect(message.type).toBe('noark-chat');
  expect(message.protocolRevision).toBe(BONSAI_PROTOCOL_REVISION);
  expect(message).not.toHaveProperty('system');
  ws.send(JSON.stringify(answer(message)));
  const result = await pending;
  expect(result.model).toBe(MODEL);
  expect(result.recordIds).toEqual(prepareBonsaiRequest(input()).recordIds);
  expect(result.parsed.status).toBe('answered');
});

it('both apps share one active GPU slot and disconnects fail pending NOARK work', async () => {
  const ws = await connect();
  const pendingMessage = next(ws);
  const pending = stub().noark(input());
  await pendingMessage;
  expect(await stub().noark(input())).toEqual({ error: 'busy' });
  expect(await stub().chat({ question: 'What is 2 + 2?', history: [] })).toEqual({ error: 'busy' });
  ws.close(1000);
  expect(await pending).toEqual({ error: 'local_model_unavailable' });
});

it('malformed NOARK IDs/revisions never dispatch and wrong-model replies fail closed', async () => {
  const ws = await connect();
  expect(await stub().noark({ ...input(), recordIds: ['invented'] })).toEqual({ error: 'invalid_request' });
  expect(await stub().noark({ ...input(), corpusVersion: 'old' })).toEqual({ error: 'invalid_request' });
  const pendingMessage = next(ws);
  const pending = stub().noark(input());
  ws.send(JSON.stringify(answer(await pendingMessage, { model: 'wrong-model' })));
  expect(await pending).toEqual({ error: 'local_model_unavailable' });
  expect((await stub().health()).available).toBe(true);
});

it('a Second Rolf answer cannot satisfy a NOARK request, and invalid citations are rejected', async () => {
  const ws = await connect();
  const pendingMessage = next(ws);
  const pending = stub().noark(input());
  const message = await pendingMessage;
  ws.send(JSON.stringify({ type: 'answer', id: message.id, answer: 'Wrong identity', profileRevision: PROFILE_REVISION }));
  const response = answer(message);
  response.result.parsed.claims[0].recordIds = ['invented'];
  ws.send(JSON.stringify(response));
  expect(await pending).toEqual({ error: 'local_model_unavailable' });
});

it('expired NOARK deadlines cancel the local request and release the GPU slot', async () => {
  await connect();
  const result = await runInDurableObject(stub(), async instance => {
    vi.useFakeTimers();
    try {
      const pending = instance.noark(input());
      await vi.advanceTimersByTimeAsync(90001);
      const result = await pending;
      expect(instance.pending.size).toBe(0);
      return result;
    } finally { vi.useRealTimers(); }
  });
  expect(result).toEqual({ error: 'local_model_unavailable' });
});
