import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { access } from 'node:fs/promises';
import { createCodexBridge, createStdioTransport, CODEX_MODEL, CODEX_REASONING,
  resolveCodexExecutable } from '../scripts/codex-bridge.mjs';

const request = { systemPrompt: 'Analyze only this synthetic text.', prompt: 'Syntetisk dokument 2026-09-27.',
  outputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false } };

function fixture(options = {}) {
  const connections = [];
  const calls = [];
  const factory = settings => {
    const index = connections.length;
    const overrides = new Map();
    for (let i = 0; i < settings.args.length; i++) {
      if (settings.args[i] !== '-c') continue;
      const text = settings.args[++i]; const equals = text.indexOf('=');
      overrides.set(text.slice(0, equals), text.slice(equals + 1));
    }
    const profile = [...overrides.keys()].find(key => key.startsWith('permissions.')).slice('permissions.'.length);
    const config = {
      model: CODEX_MODEL, model_provider: 'openai', model_reasoning_effort: CODEX_REASONING,
      web_search: 'disabled', project_doc_max_bytes: 0, notify: [],
      chatgpt_base_url: 'https://chatgpt.com/backend-api/',
      features: { code_mode: { enabled: false } },
      mcp_servers: { 'fixture.server': { enabled: index === 0 } },
      apps: { _default: { enabled: false }, 'fixture.app': { enabled: false } },
      plugins: { 'fixture@plugin.example': { enabled: index === 0, mcp_servers: { nested: { enabled: index === 0 } } } },
      permissions: { [profile]: { filesystem: { ':root': 'deny', [settings.cwd.replaceAll('\\', '/')]: 'read' }, network: { enabled: false } } },
    };
    for (const [key, value] of overrides) {
      if (key.startsWith('features.') && !key.endsWith('.enabled')) config.features[key.slice(9)] = value === 'true';
    }
    if (index > 0) {
      config.mcp_servers['fixture.server'].enabled = false;
      config.plugins['fixture@plugin.example'].enabled = false;
      config.plugins['fixture@plugin.example'].mcp_servers.nested.enabled = false;
      options.config?.(config, profile);
    }
    const listeners = new Set();
    const pending = new Set();
    const connection = {
      settings, overrides, closed: false,
      emit(method, params) { for (const listener of listeners) listener({ method, params }); },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      notify(method) { calls.push({ method, index }); },
      close(error = new Error('closed')) {
        if (connection.closed) return;
        connection.closed = true;
        settings.signal?.removeEventListener('abort', abort);
        for (const reject of pending) reject(error);
        pending.clear();
        for (const listener of listeners) listener(null, error);
        listeners.clear();
      },
      async request(method, params) {
        calls.push({ method, params, index });
        if (options.hang === method && index > 0) return new Promise((resolve, reject) => pending.add(reject));
        if (method === 'initialize') return { userAgent: 'synthetic-test' };
        if (method === 'config/read') return { config };
        if (method === 'experimentalFeature/list') {
          const data = Object.entries(config.features).map(([name, value]) => ({ name, enabled: name === 'code_mode' ? value.enabled : value }));
          options.features?.(data);
          return { data, nextCursor: null };
        }
        if (method === 'account/read') return { account: { type: options.accountType || 'chatgpt', email: 'never-expose-this@example.invalid' } };
        if (method === 'model/list') return { data: options.models || [{ model: CODEX_MODEL,
          supportedReasoningEfforts: [{ reasoningEffort: CODEX_REASONING }] }], nextCursor: null };
        if (method === 'thread/start') {
          const response = { thread: { id: 'synthetic-thread' }, model: CODEX_MODEL, modelProvider: 'openai',
            reasoningEffort: CODEX_REASONING, activePermissionProfile: { id: profile, extends: null },
            sandbox: { type: 'readOnly', networkAccess: false }, instructionSources: [],
            approvalsReviewer: 'user',
            approvalPolicy: { granular: { rules: false, sandbox_approval: false, request_permissions: false,
              mcp_elicitations: false, skill_approval: false } } };
          options.thread?.(response);
          return response;
        }
        if (method === 'turn/start') {
          options.onTurn?.(connection);
          if (!options.onTurn) {
            connection.emit('item/completed', { threadId: 'synthetic-thread', item: { type: 'agentMessage', id: 'comment', phase: 'commentary', text: 'Working...' } });
            connection.emit('item/completed', { threadId: 'synthetic-thread', item: { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: options.output ?? '{"title":"Syntetisk dokument"}' } });
            connection.emit('turn/completed', { threadId: 'synthetic-thread', turn: { id: 'turn', status: 'completed', items: [] } });
          }
          return { turn: { id: 'turn' } };
        }
        throw new Error(`Unexpected test RPC ${method}`);
      },
    };
    const abort = () => connection.close(new Error('aborted'));
    settings.signal.addEventListener('abort', abort, { once: true });
    connections.push(connection);
    return connection;
  };
  const bridge = createCodexBridge({ executable: process.execPath, transportFactory: factory,
    timeoutMs: options.timeoutMs || 1000, statusTimeoutMs: options.timeoutMs || 1000 });
  return { bridge, connections, calls };
}

test('status verifies managed ChatGPT, exact model and isolated permissions without inference', async () => {
  const { bridge, connections, calls } = fixture();
  const result = await bridge.getStatus();
  assert.equal(result.configured, true);
  assert.equal(result.model, 'gpt-6-luna'); assert.equal(result.reasoning, 'medium'); assert.equal(result.authMode, 'chatgpt');
  assert.equal(calls.some(call => call.method === 'turn/start'), false);
  assert.equal(connections.length, 2);
  assert.ok(connections.every(connection => connection.closed));
  assert.match(connections[1].overrides.get('mcp_servers'), /"fixture.server"=\{"enabled"=false\}/);
  assert.match(connections[1].overrides.get('plugins'), /"fixture@plugin.example"=\{"enabled"=false/);
  const thread = calls.find(call => call.method === 'thread/start').params;
  assert.equal(thread.ephemeral, true); assert.deepEqual(thread.dynamicTools, []);
  assert.deepEqual(thread.selectedCapabilityRoots, []); assert.equal(thread.sandbox, undefined);
  assert.match(thread.permissions, /^archive_assist_[a-f0-9]{32}$/);
  assert.equal(connections[1].overrides.get('features.hooks'), 'false');
  assert.equal(connections[1].overrides.get('features.shell_tool'), 'false');
  assert.equal(connections[1].overrides.get('features.code_mode.enabled'), 'false');
  assert.equal(connections[1].overrides.get('features.skip_host_skill_discovery'), 'true');
  assert.equal(JSON.stringify(result).includes('never-expose'), false);
  await assert.rejects(access(connections[0].settings.cwd));
});

test('analysis returns final JSON and pins model/effort/schema without changing the permission profile', async () => {
  const { bridge, calls } = fixture();
  assert.deepEqual(await bridge.analyze(request), { title: 'Syntetisk dokument' });
  const turn = calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.model, CODEX_MODEL); assert.equal(turn.effort, CODEX_REASONING);
  assert.deepEqual(turn.outputSchema, request.outputSchema);
  assert.equal(turn.sandboxPolicy, undefined); // An override here would discard the narrower named profile.
  assert.deepEqual(turn.input, [{ type: 'text', text: request.prompt }]);
});

for (const [name, config] of [
  ['MCP left enabled', c => { c.mcp_servers['fixture.server'].enabled = true; }],
  ['new MCP appeared after inventory', c => { c.mcp_servers.new = { enabled: true }; }],
  ['connector left enabled', c => { c.apps['fixture.app'].enabled = true; }],
  ['plugin MCP left enabled', c => { c.plugins['fixture@plugin.example'].mcp_servers.nested.enabled = true; }],
  ['shell remains enabled', c => { c.features.shell_tool = true; }],
  ['code mode remains enabled', c => { c.features.code_mode.enabled = true; }],
  ['root remains readable', (c, p) => { c.permissions[p].filesystem[':root'] = 'read'; }],
  ['an extra write grant', (c, p) => { c.permissions[p].filesystem['/other'] = 'write'; }],
  ['network remains enabled', (c, p) => { c.permissions[p].network.enabled = true; }],
  ['provider is different', c => { c.model_provider = 'other'; }],
  ['provider has an override', c => { c.model_providers = { openai: { base_url: 'https://example.invalid' } }; }],
  ['auth endpoint is overridden', c => { c.chatgpt_base_url = 'https://example.invalid'; }],
]) {
  test(`fails closed before thread/model use when ${name}`, async () => {
    const { bridge, calls } = fixture({ config });
    await assert.rejects(bridge.analyze(request), { code: 'UNSAFE_CONFIG' });
    assert.equal(calls.some(call => call.method === 'thread/start' || call.method === 'turn/start'), false);
  });
}

test('API-key login does not fall back to paid API or start a model turn', async () => {
  const { bridge, calls } = fixture({ accountType: 'apiKey' });
  await assert.rejects(bridge.analyze(request), { code: 'AUTH_REQUIRED' });
  assert.equal(calls.some(call => call.method === 'thread/start'), false);
});

test('effective features override a reassuring config value and fail closed', async () => {
  const { bridge, calls } = fixture({ features: data => { data.find(feature => feature.name === 'shell_tool').enabled = true; } });
  await assert.rejects(bridge.analyze(request), { code: 'UNSAFE_CONFIG' });
  assert.equal(calls.some(call => call.method === 'thread/start'), false);
});

test('forced unified-exec implementation is harmless only while its shell capability is off', async () => {
  const { bridge } = fixture({ features: data => { data.find(feature => feature.name === 'unified_exec').enabled = true; } });
  assert.equal((await bridge.getStatus()).configured, true);
});

for (const models of [[{ model: 'gpt-6-sol', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }],
  [{ model: CODEX_MODEL, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }]]) {
  test('requires exact Luna and supported medium reasoning', async () => {
    const { bridge } = fixture({ models });
    await assert.rejects(bridge.analyze(request), { code: 'MODEL_UNAVAILABLE' });
  });
}

for (const [name, thread] of [
  ['model', t => { t.model = 'other'; }], ['provider', t => { t.modelProvider = 'other'; }],
  ['effort', t => { t.reasoningEffort = 'high'; }], ['profile', t => { t.activePermissionProfile.id = ':read-only'; }],
  ['write permission', t => { t.sandbox.type = 'workspaceWrite'; }], ['network', t => { t.sandbox.networkAccess = true; }],
  ['external instructions', t => { t.instructionSources = ['/unwanted/AGENTS.md']; }],
  ['approvals', t => { t.approvalPolicy.granular.sandbox_approval = true; }],
]) {
  test(`no inference after thread ${name} downgrade`, async () => {
    const { bridge, calls } = fixture({ thread });
    await assert.rejects(bridge.analyze(request), { code: 'UNSAFE_CONFIG' });
    assert.equal(calls.some(call => call.method === 'turn/start'), false);
  });
}

for (const output of ['```json\n{}\n```', '[]', 'null', '{broken', JSON.stringify({ title: 'x'.repeat(70_000) })]) {
  test(`rejects invalid or oversized structured output (${output.length} characters)`, async () => {
    const { bridge } = fixture({ output });
    await assert.rejects(bridge.analyze(request), { code: 'INVALID_OUTPUT' });
  });
}

test('tool event aborts the child; it is never returned as an analysis', async () => {
  const { bridge, connections } = fixture({ onTurn: connection => connection.emit('item/started', {
    threadId: 'synthetic-thread', item: { type: 'commandExecution', id: 'forbidden' },
  }) });
  await assert.rejects(bridge.analyze(request), { code: 'CAPABILITY_BLOCKED' });
  assert.ok(connections.every(connection => connection.closed));
});

test('a tool item only present in final turn is also rejected', async () => {
  const { bridge } = fixture({ onTurn: connection => connection.emit('turn/completed', {
    threadId: 'synthetic-thread', turn: { status: 'completed', items: [{ type: 'fileChange' }, { type: 'agentMessage', text: '{}' }] },
  }) });
  await assert.rejects(bridge.analyze(request), { code: 'CAPABILITY_BLOCKED' });
});

test('timeout cleans both child and scratch directory', async () => {
  const { bridge, connections } = fixture({ hang: 'turn/start', timeoutMs: 50 });
  await assert.rejects(bridge.analyze(request), { code: 'TIMEOUT' });
  assert.ok(connections.every(connection => connection.closed));
  await assert.rejects(access(connections[0].settings.cwd));
});

test('AbortSignal and concurrent request guard do not permit a second analysis', async () => {
  const { bridge, calls, connections } = fixture({ hang: 'turn/start' });
  const abort = new AbortController();
  const first = bridge.analyze({ ...request, signal: abort.signal });
  await assert.rejects(bridge.analyze(request), { code: 'BUSY' });
  while (!calls.some(call => call.method === 'turn/start')) await new Promise(resolve => setTimeout(resolve, 1));
  abort.abort();
  await assert.rejects(first, { code: 'ABORTED' });
  assert.equal(calls.filter(call => call.method === 'turn/start').length, 1);
  assert.ok(connections.every(connection => connection.closed));
});

test('close cancels an active operation and prevents reuse', async () => {
  const { bridge, calls } = fixture({ hang: 'turn/start' });
  const result = bridge.analyze(request);
  while (!calls.some(call => call.method === 'turn/start')) await new Promise(resolve => setTimeout(resolve, 1));
  bridge.close();
  await assert.rejects(result, { code: 'ABORTED' });
  await assert.rejects(bridge.analyze(request), { code: 'CLOSED' });
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kills = 0; child.kill = () => { child.kills++; child.exitCode = 0; child.emit('exit', 0); };
  return child;
}

test('stdio uses hidden child/no shell, strips secrets, rejects every server request and sanitizes errors', async () => {
  const child = fakeChild(); let spawnOptions; const written = [];
  child.stdin.on('data', data => written.push(JSON.parse(String(data))));
  const transport = createStdioTransport({ executable: 'codex', args: [], cwd: '/synthetic',
    env: { PATH: 'safe-path', CODEX_HOME: 'managed-login-location', OPENAI_API_KEY: 'do-not-forward', ACCESS_TOKEN: 'also-secret' },
    spawn: (executable, args, options) => { spawnOptions = options; return child; } });
  const pending = transport.request('turn/start', {});
  child.stderr.write('A diagnostic containing secret text must never escape');
  child.stdout.write(JSON.stringify({ id: 100, method: 'item/commandExecution/requestApproval', params: { secret: 'never expose' } }) + '\n');
  await assert.rejects(pending, { code: 'CAPABILITY_BLOCKED' });
  assert.equal(child.kills, 1); assert.equal(spawnOptions.windowsHide, true); assert.equal(spawnOptions.shell, false);
  assert.deepEqual(spawnOptions.env, { PATH: 'safe-path', CODEX_HOME: 'managed-login-location' });
  assert.equal(written.at(-1).error.code, -32601); assert.equal(written.some(value => value.result?.decision === 'accept'), false);
});

for (const line of ['null\n', '[]\n', 'not json\n', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
  test(`stdio rejects malformed or oversized protocol (${line.length} bytes)`, async () => {
    const child = fakeChild();
    const transport = createStdioTransport({ executable: 'codex', args: [], cwd: '/synthetic', spawn: () => child });
    const pending = transport.request('initialize', {});
    child.stdout.write(line);
    await assert.rejects(pending, { code: 'PROTOCOL' }); assert.equal(child.kills, 1);
  });
}

test('RPC errors never expose raw server messages or account data', async () => {
  const child = fakeChild();
  const transport = createStdioTransport({ executable: 'codex', args: [], cwd: '/synthetic', spawn: () => child });
  const pending = transport.request('account/read', {});
  child.stdout.write('{"id":1,"error":{"code":-1,"message":"secret@example.invalid token=abc"}}\n');
  await assert.rejects(pending, error => error.code === 'RPC_ERROR' && !error.message.includes('secret') && !error.message.includes('abc'));
  transport.close();
});

test('explicit executable is resolved and missing executable fails without fallback', async () => {
  assert.equal(await resolveCodexExecutable({ executable: process.execPath }), process.execPath);
  await assert.rejects(resolveCodexExecutable({ executable: '/does-not-exist/archive-assist-codex' }), { code: 'NOT_INSTALLED' });
});
