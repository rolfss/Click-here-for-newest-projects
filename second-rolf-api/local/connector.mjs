import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { MODEL, PROFILE_REVISION, modelRequest, MAX_ANSWER, readJsonBounded, parseModelAnswer, privacyReply } from '../protocol.mjs';
import { BONSAI_PROTOCOL_REVISION, BONSAI_CORPUS_VERSION, BONSAI_LIMITS,
  prepareBonsaiRequest, validateBonsaiAnswer } from '../../noark-api/bonsai-protocol.mjs';

const LOCAL_RUNTIME = 'http://127.0.0.1:8099';
const EXPECTED_GPU_LAYERS = 65;
const runFile = promisify(execFile);

async function readRuntimeStatus() {
  const file = process.env.SECOND_ROLF_MODEL_STATUS;
  if (!file) return null;
  return readPrivateStatus(file);
}

async function readPrivateStatus(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16_000) return null;
    return JSON.parse((await handle.readFile('utf8')).replace(/^\uFEFF/, ''));
  } finally { await handle.close(); }
}

async function windowsProcessIdentity(processId) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(processId) || processId <= 0) return null;
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Only an already-validated integer is interpolated, never a configured path or command.
  const command = `$ErrorActionPreference='Stop'; $p=Get-Process -Id ${processId}; [ordered]@{processId=$p.Id; executable=$p.Path; startTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress`;
  const { stdout } = await runFile(shell, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000, maxBuffer: 16_000 });
  return JSON.parse(stdout);
}

async function inspectProcess(processId, expectedPort) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(processId) || processId <= 0 || ![8099, 8100].includes(expectedPort)) return null;
  // netstat provides the owner PID without the CIM permission needed by Get-NetTCPConnection.
  const netstat = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netstat.exe');
  const [identity, listeners] = await Promise.all([
    windowsProcessIdentity(processId),
    runFile(netstat, ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 5000, maxBuffer: 1_000_000 })
  ]);
  const ownsListener = listeners.stdout.split(/\r?\n/).some(line => {
    const columns = line.trim().split(/\s+/);
    return columns.length === 5 && columns[0] === 'TCP' && columns[1] === `127.0.0.1:${expectedPort}`
      && columns[2] === '0.0.0.0:0' && columns[3] === 'LISTENING' && columns[4] === String(processId);
  });
  return { ...identity, listenerPort: ownsListener ? expectedPort : null };
}

// A supervised child may connect only after its exact identity has been saved.
// If the supervisor dies during spawn, the unrecorded child exits without a socket.
export async function awaitBridgeOwnership(configFile, { statusFile = process.env.SECOND_ROLF_BRIDGE_STATUS,
  readStatus = readPrivateStatus, identify = windowsProcessIdentity,
  scriptFile = process.argv[1], processId = process.pid, executable = process.execPath,
  attempts = 25, delay = () => new Promise(resolve => setTimeout(resolve, 200)) } = {}) {
  if (!statusFile) return;
  const identity = await identify(processId);
  const samePath = (a, b) => typeof a === 'string' && typeof b === 'string'
    && path.win32.resolve(a).toLowerCase() === path.win32.resolve(b).toLowerCase();
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const status = await readStatus(statusFile);
      if (status?.processId === processId && identity?.processId === processId
          && typeof status.startTicks === 'string' && status.startTicks === identity.startTicks
          && samePath(status.executable, executable) && samePath(status.executable, identity.executable)
          && samePath(status.connectorPath, scriptFile) && samePath(status.configPath, configFile)) return;
    } catch { /* The parent may still be committing the private identity record. */ }
    if (attempt + 1 < attempts) await delay();
  }
  throw new Error('Supervisor did not record this connector identity; refusing an untracked connection.');
}

async function gpuProcesses() {
  if (process.platform !== 'win32') return [];
  const binary = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe');
  const { stdout } = await runFile(binary, ['--query-compute-apps=pid', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000, maxBuffer: 16_000 });
  return stdout.trim().split(/\r?\n/).filter(line => /^\d+$/.test(line.trim())).map(line => Number(line.trim()));
}

function sameRuntime(status, live, expectedPort) {
  return status?.model === MODEL && Number.isSafeInteger(status.processId) && status.processId > 0
    && typeof status.executable === 'string' && path.win32.isAbsolute(status.executable)
    && path.win32.basename(status.executable).toLowerCase() === 'llama-server.exe'
    && typeof status.startTicks === 'string' && /^[1-9]\d{15,19}$/.test(status.startTicks)
    && live?.processId === status.processId && live.startTicks === status.startTicks && live.listenerPort === expectedPort
    && typeof live.executable === 'string'
    && path.win32.normalize(live.executable).toLowerCase() === path.win32.normalize(status.executable).toLowerCase();
}

function completionContent(data) {
  const choice = data?.choices?.[0], message = choice?.message;
  if (data?.model !== MODEL || data.object !== 'chat.completion'
      || !Array.isArray(data.choices) || data.choices.length !== 1 || choice.index !== 0 || choice.finish_reason !== 'stop'
      || message?.role !== 'assistant' || typeof message.content !== 'string' || !message.content.trim()
      || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))
      || message.function_call != null || message.refusal != null) throw new Error('Invalid local reply');
  // Reasoning fields are deliberately never interpreted or returned to the visitor.
  return message.content;
}

// Dependency injection is for local verification. Neither the private connector
// configuration nor any visitor request can change the production loopback endpoint.
export function createModelClient({ fetchImpl = (...args) => fetch(...args), baseUrl = LOCAL_RUNTIME,
  readRuntimeStatus: statusReader = readRuntimeStatus, inspectProcess: processInspector = inspectProcess,
  gpuProcesses: gpuReader = gpuProcesses } = {}) {
  if (baseUrl !== LOCAL_RUNTIME && baseUrl !== 'http://127.0.0.1:8100') throw new Error('Unexpected local runtime address');
  const expectedPort = Number(new URL(baseUrl).port);
  async function infer(conversation, signal) {
    if (conversation.profileRevision !== PROFILE_REVISION) throw new Error('Public profile revision mismatch');
    const privateReply = privacyReply(conversation);
    if (privateReply !== null) return privateReply;
    const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelRequest(conversation)),
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(85_000)])
    });
    if (!response.ok) throw new Error('Local inference failed');
    const data = await readJsonBounded(response, 100_000);
    return parseModelAnswer(completionContent(data)).slice(0, MAX_ANSWER);
  }
  async function inferNoark(input, signal) {
    const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(BONSAI_LIMITS.timeoutMs)]);
    const localPost = async (endpoint, body, maximum = BONSAI_LIMITS.responseBytes) => {
      const response = await fetchImpl(`${baseUrl}${endpoint}`, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: deadline });
      if (!response.ok) throw new Error('NOARK local request failed');
      return readJsonBounded(response, maximum);
    };
    let prepared;
    // Count the actual model template before generation. All endpoints and the
    // system prompt are pinned locally; cloud messages supply only corpus IDs.
    for (let count = BONSAI_LIMITS.sources; count >= 1 && !prepared; count--) {
      for (const historyLimit of [4, 2, 0]) {
        let proposal;
        try { proposal = prepareBonsaiRequest(input, { sourceLimit: count, historyLimit }); }
        catch { continue; }
        const rendered = await localPost('/apply-template', { messages: proposal.body.messages,
          chat_template_kwargs: proposal.body.chat_template_kwargs });
        if (typeof rendered.prompt !== 'string' || !rendered.prompt || rendered.prompt.length > 50000) throw new Error('Invalid local template');
        const tokenized = await localPost('/tokenize', { content: rendered.prompt, add_special: true, parse_special: true }, 160000);
        if (!Array.isArray(tokenized.tokens) || tokenized.tokens.some(t => !Number.isInteger(t) || t < 0)) throw new Error('Invalid local token count');
        if (tokenized.tokens.length + BONSAI_LIMITS.outputTokens + BONSAI_LIMITS.framingTokens <= BONSAI_LIMITS.contextTokens) {
          prepared = proposal; break;
        }
      }
    }
    if (!prepared) throw new Error('NOARK context exceeds local model capacity');
    const data = await localPost('/v1/chat/completions', prepared.body);
    const parsed = validateBonsaiAnswer(JSON.parse(completionContent(data)), input.question, prepared.recordIds);
    return { parsed, recordIds: prepared.recordIds, model: MODEL,
      corpusVersion: BONSAI_CORPUS_VERSION, protocolRevision: BONSAI_PROTOCOL_REVISION };
  }
  async function probeModel(warm = false) {
    const unavailable = { available: false, gpu: false, model: MODEL };
    const health = await fetchImpl(`${baseUrl}/health`, { signal: AbortSignal.timeout(4000) });
    if (!health.ok || (await readJsonBounded(health, 16_000)).status !== 'ok') return unavailable;
    const response = await fetchImpl(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return unavailable;
    const models = await readJsonBounded(response, 16_000);
    if (!Array.isArray(models.data) || models.data.length !== 1 || models.data[0]?.id !== MODEL) return unavailable;
    let status, live;
    try {
      status = await statusReader();
      if (!Number.isSafeInteger(status?.processId) || status.processId <= 0) return unavailable;
      live = await processInspector(status.processId, expectedPort);
    } catch { return unavailable; }
    if (!sameRuntime(status, live, expectedPort)) return unavailable;
    let gpu = false;
    try {
      gpu = status.totalLayers === EXPECTED_GPU_LAYERS && status.gpuLayers === EXPECTED_GPU_LAYERS
        && (await gpuReader()).includes(status.processId);
    } catch { /* GPU readiness must be evidenced by a current NVIDIA compute process. */ }
    if (warm) {
      const answer = await infer({ question: 'What is 2 + 2? Answer with only the digit 4.', history: [], profileRevision: PROFILE_REVISION });
      if (answer.trim() !== '4') throw new Error('Expected Bonsai model did not pass the answer check');
    }
    return { available: true, gpu, model: MODEL };
  }
  return { infer, inferNoark, probeModel };
}

const productionClient = createModelClient();
export const infer = productionClient.infer;
export const probeModel = productionClient.probeModel;

export function connect(config, { WebSocketClient = WebSocket, logger = console, modelClient = productionClient } = {}) {
  const url = new URL(config.workerUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'second-rolf-api.rolfsselas.workers.dev' || url.username || url.password) throw new Error('Unexpected Worker address');
  if (typeof config.key !== 'string' || config.key.length < 40) throw new Error('Missing connector key');
  url.protocol = 'wss:'; url.pathname = '/api/local/connect'; url.search = ''; url.hash = '';
  let stopping = false, socket, timer, reconnectTimer, active, probing = false, lastAck = 0, verifiedAt = 0, warnedRevision = false, modelReady = null;
  const send = data => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  function reportModelStatus(available, gpu = false) {
    if (modelReady === available) return;
    modelReady = available;
    if (available) logger.log('Local model ready: ' + MODEL + (gpu ? ' (GPU).' : '.'));
    else logger.warn('Local model unavailable. Start the Second Rolf Bonsai runtime and check its status file. The connector will retry automatically.');
  }
  async function heartbeat() {
    if (probing || socket?.readyState !== WebSocket.OPEN) return;
    if (lastAck && Date.now() - lastAck > 60_000) { socket.terminate(); return; }
    probing = true;
    try {
      let status = await modelClient.probeModel(false);
      if (!active && (!status.available || Date.now() - verifiedAt > 300_000)) {
        status = await modelClient.probeModel(true); verifiedAt = status.available ? Date.now() : 0;
      }
      const available = status.available && verifiedAt > 0;
      send({ type: 'health', ...status, profileRevision: PROFILE_REVISION, available,
        ...(available && typeof modelClient.inferNoark === 'function' ? {
          noarkRevision: BONSAI_PROTOCOL_REVISION, noarkCorpus: BONSAI_CORPUS_VERSION } : {}) });
      reportModelStatus(available, status.gpu);
    } catch {
      verifiedAt = 0;
      send({ type: 'health', available: false, gpu: false, model: MODEL, profileRevision: PROFILE_REVISION });
      reportModelStatus(false);
    }
    finally { probing = false; }
  }
  function open() {
    if (stopping) return;
    const ws = new WebSocketClient(url, { headers: { Authorization: `Bearer ${config.key}` }, handshakeTimeout: 15_000, maxPayload: 48_000 });
    socket = ws;
    ws.on('open', () => {
      lastAck = Date.now(); verifiedAt = 0; warnedRevision = false; modelReady = null;
      logger.log('Cloudflare connection established; checking local Bonsai model.');
      void heartbeat(); timer = setInterval(() => { void heartbeat(); }, 15_000);
    });
    ws.on('message', async raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      if (data.type === 'ack') {
        lastAck = Date.now();
        if (data.profileRevision !== PROFILE_REVISION && !warnedRevision) {
          warnedRevision = true;
          logger.warn('Worker/profile version mismatch. Update the checkout, deploy the Worker and restart this connector. A PC reboot is not required.');
        }
        return;
      }
      if (data.type === 'cancel' && active?.id === data.id) { active.controller.abort(); return; }
      if (!['chat', 'noark-chat'].includes(data.type) || typeof data.id !== 'string') return;
      const noark = data.type === 'noark-chat';
      const answerType = noark ? 'noark-answer' : 'answer';
      if (active || probing) { ws.send(JSON.stringify({ type: answerType, id: data.id, error: 'busy', profileRevision: PROFILE_REVISION })); return; }
      const controller = new AbortController();
      active = { id: data.id, controller };
      try {
        const answer = noark ? await modelClient.inferNoark(data, controller.signal) : await modelClient.infer(data, controller.signal);
        verifiedAt = Date.now();
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: answerType, id: data.id,
          ...(noark ? { result: answer } : { answer }), profileRevision: PROFILE_REVISION }));
      } catch {
        if (!noark) verifiedAt = 0;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: answerType, id: data.id, error: 'local_model_unavailable', profileRevision: PROFILE_REVISION }));
      } finally { if (active?.controller === controller) active = null; }
    });
    ws.on('error', () => {}); // No credentials, prompts or answers are written to logs.
    ws.on('close', () => {
      clearInterval(timer); active?.controller.abort();
      if (!stopping) { logger.log('Connection closed; retrying.'); reconnectTimer = setTimeout(open, 5000); }
    });
  }
  open();
  return () => { stopping = true; clearTimeout(reconnectTimer); clearInterval(timer); active?.controller.abort(); socket?.close(); };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configFile = process.env.SECOND_ROLF_CONFIG || process.argv[2];
  if (!configFile) throw new Error('Provide the private connector configuration file.');
  await awaitBridgeOwnership(configFile);
  const stop = connect(JSON.parse(fs.readFileSync(configFile, 'utf8')));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
