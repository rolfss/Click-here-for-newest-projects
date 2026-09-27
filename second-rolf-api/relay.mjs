import { DurableObject } from 'cloudflare:workers';
import { MODEL, PROFILE_REVISION, MAX_ANSWER, cleanConversation } from './protocol.mjs';
import { BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION, BONSAI_LIMITS,
  cleanBonsaiInput, validateBonsaiAnswer } from '../noark-api/bonsai-protocol.mjs';

// One object coordinates one physical GPU. Chat text is intentionally transient.
export class LocalRelay extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.pending = new Map(); }

  async fetch() {
    for (const old of this.ctx.getWebSockets()) old.close(1000, 'Reconnected');
    this.finishAll();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ available: false, modelReady: false, gpu: false, checkedAt: 0, profileRevision: '' });
    return new Response(null, { status: 101, webSocket: client });
  }

  health() {
    const socket = this.ctx.getWebSockets().find(s => s.readyState === 1);
    const state = socket?.deserializeAttachment();
    const current = state?.profileRevision === PROFILE_REVISION;
    const fresh = Boolean(state?.checkedAt && Date.now() - state.checkedAt < 45_000);
    const modelOnline = Boolean(fresh && state?.modelReady);
    const available = Boolean(current && fresh && state?.available);
    const reason = !socket ? 'pc_disconnected' : !state?.checkedAt ? 'model_starting' : !fresh ? 'heartbeat_expired' : !current ? 'connector_update_required' : !available ? 'model_unavailable' : this.pending.size ? 'busy' : 'ready';
    return { available, modelOnline, connected: Boolean(socket), gpu: Boolean(modelOnline && state?.gpu), busy: this.pending.size > 0, reason, profileRevision: current ? PROFILE_REVISION : '', connectorRevision: state?.profileRevision || '', checkedAt: state?.checkedAt || 0 };
  }

  noarkHealth() {
    const shared = this.health();
    const state = this.ctx.getWebSockets().find(s => s.readyState === 1)?.deserializeAttachment();
    const current = state?.noarkRevision === BONSAI_PROTOCOL_REVISION && state?.noarkCorpus === BONSAI_CORPUS_VERSION;
    return { available: shared.available && current, busy: shared.busy, model: MODEL,
      corpusVersion: BONSAI_CORPUS_VERSION, protocolRevision: BONSAI_PROTOCOL_REVISION,
      reason: !shared.available ? shared.reason : !current ? 'connector_update_required' : shared.busy ? 'busy' : 'ready' };
  }

  async noark(data) {
    let clean;
    try { clean = cleanBonsaiInput(data); } catch { return { error: 'invalid_request' }; }
    if (!this.noarkHealth().available) return { error: 'local_model_unavailable' };
    if (this.pending.size) return { error: 'busy' };
    const socket = this.ctx.getWebSockets().find(s => s.readyState === 1);
    const id = crypto.randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'cancel', id }));
        resolve({ error: 'local_model_unavailable' });
      }, 90_000);
      this.pending.set(id, { resolve, timer, socket, kind: 'noark', input: clean });
      try { socket.send(JSON.stringify({ type: 'noark-chat', id, ...clean })); }
      catch { this.finish(id, { error: 'local_model_unavailable' }); }
    });
  }

  async chat(data) {
    const conversation = cleanConversation(data);
    if (!this.health().available) return { error: 'local_model_unavailable' };
    if (this.pending.size) return { error: 'busy' };
    const socket = this.ctx.getWebSockets().find(s => s.readyState === 1);
    const id = crypto.randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'cancel', id }));
        resolve({ error: 'local_model_unavailable' });
      }, 90_000);
      this.pending.set(id, { resolve, timer, socket });
      try { socket.send(JSON.stringify({ type: 'chat', id, ...conversation, profileRevision: PROFILE_REVISION })); }
      catch { this.finish(id, { error: 'local_model_unavailable' }); }
    });
  }

  webSocketMessage(socket, raw) {
    if (typeof raw !== 'string' || raw.length > 40_000) { socket.close(1009, 'Message too large'); return; }
    let data;
    try { data = JSON.parse(raw); } catch { socket.close(1003, 'Invalid JSON'); return; }
    if (data.type === 'health') {
      const revision = typeof data.profileRevision === 'string' && data.profileRevision.length <= 100 ? data.profileRevision : '';
      const current = revision === PROFILE_REVISION;
      const modelReady = data.available === true && data.model === MODEL;
      const available = current && modelReady;
      const noarkRevision = data.noarkRevision === BONSAI_PROTOCOL_REVISION ? BONSAI_PROTOCOL_REVISION : '';
      const noarkCorpus = data.noarkCorpus === BONSAI_CORPUS_VERSION ? BONSAI_CORPUS_VERSION : '';
      socket.serializeAttachment({ available, modelReady, gpu: modelReady && data.gpu === true, checkedAt: Date.now(), profileRevision: revision,
        noarkRevision, noarkCorpus });
      if (!available) this.finishAll(socket);
      else if (!noarkRevision || !noarkCorpus) {
        for (const [id, pending] of this.pending) if (pending.kind === 'noark' && pending.socket === socket)
          this.finish(id, { error: 'local_model_unavailable' });
      }
      socket.send(JSON.stringify({ type: 'ack', profileRevision: PROFILE_REVISION, accepted: current }));
      return;
    }
    if (data.type === 'noark-answer' && this.pending.get(data.id)?.socket === socket) {
      const pending = this.pending.get(data.id);
      if (pending.kind !== 'noark') return;
      if (data.error === 'busy') { this.finish(data.id, { error: 'busy' }); return; }
      try {
        const result = data.result;
        if (!this.noarkHealth().available || result?.model !== MODEL || result.protocolRevision !== BONSAI_PROTOCOL_REVISION
            || result.corpusVersion !== BONSAI_CORPUS_VERSION || !Array.isArray(result.recordIds)
            || result.recordIds.length > BONSAI_LIMITS.sources || result.recordIds.some(id => !pending.input.recordIds.includes(id)))
          throw new Error('Invalid NOARK reply');
        cleanBonsaiInput({ ...pending.input, recordIds: result.recordIds });
        const parsed = validateBonsaiAnswer(result.parsed, pending.input.question, result.recordIds);
        this.finish(data.id, { parsed, recordIds: result.recordIds, model: MODEL,
          protocolRevision: BONSAI_PROTOCOL_REVISION, corpusVersion: BONSAI_CORPUS_VERSION });
      } catch { this.finish(data.id, { error: 'local_model_unavailable' }); }
      return;
    }
    if (data.type === 'answer' && this.pending.get(data.id)?.socket === socket) {
      if (this.pending.get(data.id).kind === 'noark') return;
      if (data.error === 'busy') { this.finish(data.id, { error: 'busy' }); return; }
      const current = data.profileRevision === PROFILE_REVISION && socket.deserializeAttachment()?.profileRevision === PROFILE_REVISION;
      const answer = current && typeof data.answer === 'string' ? data.answer.trim().slice(0, MAX_ANSWER) : '';
      if (!answer) socket.serializeAttachment({ available: false, modelReady: false, gpu: false, checkedAt: Date.now(), profileRevision: '' });
      this.finish(data.id, answer ? { answer } : { error: 'local_model_unavailable' });
    }
  }

  finish(id, result) {
    const request = this.pending.get(id);
    if (!request) return;
    clearTimeout(request.timer); this.pending.delete(id); request.resolve(result);
  }
  finishAll(socket) {
    for (const [id, request] of this.pending) if (!socket || request.socket === socket) this.finish(id, { error: 'local_model_unavailable' });
  }
  webSocketClose(socket) { this.finishAll(socket); }
  webSocketError(socket) { this.finishAll(socket); }
}
