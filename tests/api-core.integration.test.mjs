// Coverage of src/utils/api.js — credentials, ATLAS sync, provider model
// discovery, model queries, custom/raw connectors, connection testing, the AI
// judge transport, source-excerpt helpers, and the rate limiter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { dump as yamlDump } from 'js-yaml';
import { jsonRes, textRes, stubFetch, withFastTimers, hostIs } from './helpers/httpx.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear()
};
const window = new JSDOM('').window;
globalThis.window = window;
globalThis.DOMParser = window.DOMParser;

let savedFetch;
before(() => { 
  savedFetch = globalThis.fetch; 
  // Set up a default fetch mock that blocks all network calls during initialization
  globalThis.fetch = async (url) => {
    throw new Error(`Network call blocked during test initialization: ${url}`);
  };
});
after(() => { globalThis.fetch = savedFetch; });

const {
  fetchATLASFramework, fetchProviderModels, testProvider, queryModel,
  queryAI, truncateText, resetRateLimiter, repairTruncatedJson,
  assertProviderEndpointAllowed, findSecretQueryParam, providerRouteFor,
  extractJsonBlocks, stripFencesCandidates, parseJSONObject, fetchWithRetry
} = await import('../src/utils/api.js');
// ── ATLAS framework ────────────────────────────────────────────────────────

const v6Yaml = {
  'format-version': '2026.01',
  tactics: {
    'AML.TA0000': { name: 'Recon', description: 'd' },
    'AML.TA0001': { name: 'Execution', description: 'd' }
  },
  mitigations: { 'AML.M0001': { name: 'Filter', description: 'm' } },
  techniques: {
    'AML.T0000': { name: 'Tech', description: 't' },
    'AML.T0000.001': { name: 'Sub', description: 's' },
    'AML.T0001': { name: 'Injection', description: 't' }
  },
  relationships: {
    'AML.T0000': {
      // Duplicates exercise the dedupe guards (find callbacks).
      achieves: [
        { source: 'AML.T0000', target: 'AML.TA0000', 'relationship-type': 'achieves' },
        { source: 'AML.T0000', target: 'AML.TA0000', 'relationship-type': 'achieves' }
      ],
      mitigates: [
        { source: 'AML.M0001', target: 'AML.T0000', 'relationship-type': 'mitigates' },
        { source: 'AML.M0001', target: 'AML.T0000', 'relationship-type': 'mitigates' }
      ]
    },
    'AML.T0000.001': {
      specializes: [
        { source: 'AML.T0000.001', target: 'AML.T0000', 'relationship-type': 'specializes' },
        { source: 'AML.T0000.001', target: 'AML.T0000', 'relationship-type': 'specializes' }
      ]
    },
    'AML.T0001': {
      achieves: [{ source: 'AML.T0001', target: 'AML.TA0001', 'relationship-type': 'achieves' }]
    }
  }
};

test('fetchATLASFramework parses the v6 format via the pointer file', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { calls.push('ptr'); return textRes('ATLAS-2026.07.yaml'); }],
    [(r) => r.url.includes('/v6/ATLAS-2026.07.yaml'), () => { calls.push('v6'); return textRes(yamlDump(v6Yaml)); }]
  ]);
  const res = await fetchATLASFramework();
  assert.equal(calls.join(','), 'ptr,v6');
  assert.equal(res.version, 'ATLAS-2026.07');
  assert.equal(res.matrix.length, 2);
  assert.ok(res.matrix.some((t) => t.id === 'AML.TA0000'));
  assert.ok(res.matrix.some((t) => t.id === 'AML.TA0001'));
  const recon = res.matrix.find((t) => t.id === 'AML.TA0000');
  assert.equal(recon.techniques.length, 1, 'subtechnique excluded + duplicates deduped');
  assert.equal(recon.techniques[0].mitigations.length, 1, 'duplicate mitigations deduped');
  assert.equal(recon.techniques[0].subtechniques.length, 1, 'duplicate specializes deduped');
});

test('fetchATLASFramework falls back to the legacy v5 format', async () => {
  const v5 = {
    tactics: { 'AML.TA0000': { name: 'Recon' } }, // top-level for the structural check
    matrices: [{ tactics: [{ id: 'AML.TA0000', name: 'Recon' }] }],
    techniques: { 'AML.T0000': { name: 'Tech', description: 't' } },
    relationships: [{ source_ref: 'AML.T0000', target_ref: 'AML.TA0000', relationship_type: 'achieves' }],
    mitigations: { 'AML.M0001': { name: 'F', description: 'm' } }
  };
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { throw new Error('network'); }],
    [(r) => r.url.includes('/ATLAS.yaml'), () => textRes(yamlDump(v5))]
  ]);
  const res = await fetchATLASFramework();
  assert.equal(res.matrix.length, 1);
  assert.equal(res.matrix[0].techniques[0].id, 'AML.T0000');
});

test('fetchATLASFramework aborts a hung fetch after the timeout', async () => {
  let signalAborted = false;
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), (req) => new Promise((resolve, reject) => {
      req.signal.addEventListener('abort', () => { signalAborted = true; reject(new DOMException('Aborted', 'AbortError')); });
    })]
  ]);
  await assert.rejects(fetchATLASFramework({ timeout: 20 }), /Timed out/i);
  assert.equal(signalAborted, true, 'the fetch signal must be aborted by the timeout');
});

test('fetchATLASFramework surfaces HTTP + structural + network errors', async () => {
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => jsonRes({}, 404)],
    [(r) => r.url.includes('/ATLAS.yaml'), () => textRes('not yaml', 500)]
  ]);
  await assert.rejects(fetchATLASFramework(), /HTTP error 500/);

  stubFetch([
    [(r) => r.url.includes('/ATLAS.yaml'), () => textRes(yamlDump({ nope: 1 }))]
  ]);
  await assert.rejects(fetchATLASFramework(), /Invalid ATLAS YAML/);

  stubFetch([], () => { throw new Error('network down'); });
  await assert.rejects(fetchATLASFramework(), /network down/);
});

// ── model discovery ────────────────────────────────────────────────────────
// Every provider is a user-defined provider; model discovery goes
// through fetchProviderModels (covered under "providers" below).

// ── model queries (queryModel routing) ─────────────────────────────────────

const chatOk = jsonRes({ choices: [{ message: { content: 'REPLY' } }] });
const groqCp = { id: 'groq', connector: 'openai', endpoint: 'https://api.groq.com/openai/v1', apiKey: 'g' };

test('queryModel routes an OpenAI-compatible provider by endpoint', async () => {
  stubFetch([[(r) => hostIs(r.url, 'api.groq.com'), () => chatOk]]);
  assert.equal(await queryModel('groq', 'm', 'sys', 'user', [groqCp]), 'REPLY');
});

test('queryModel throws for an unknown or disabled provider', async () => {
  await assert.rejects(queryModel('ghost', 'm', 's', 'u', []), /Unknown provider/);
  const off = { id: 'off', connector: 'openai', endpoint: 'https://h/v1', enabled: false };
  await assert.rejects(queryModel('off', 'm', 's', 'u', [off]), /Unknown provider/);
});

test('queryModel surfaces provider error payloads', async () => {
  const cp = { id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' };
  stubFetch([[(_unused) => true, () => jsonRes({ error: { message: 'boom' } }, 401)]]);
  await assert.rejects(queryModel('cp', 'm', 's', 'u', [cp]), /boom/);
});

test('queryModel returns an empty string for an empty provider answer', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: '' } }] })]]);
  assert.equal(await queryModel('groq', 'm', 'sys', 'user', [groqCp]), '');
});

test('provider error paths tolerate non-JSON error bodies', async () => {
  // OpenAI-compatible provider: invalid JSON error body.
  const cp = { id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' };
  stubFetch([[(_unused) => true, () => textRes('html error', 401)]]);
  await assert.rejects(queryModel('cp', 'm', 's', 'u', [cp]), /Provider Error \(HTTP 401\)/);

  // Raw connector: invalid JSON error body → generic status message.
  const raw = { id: 'r', connector: 'raw', endpoint: 'https://raw/api', apiKey: 'k', bodyTemplate: '{"u":"{{userPrompt}}"}' };
  stubFetch([[(_unused) => true, () => textRes('boom', 400)]]);
  await assert.rejects(queryModel('r', 'm', 's', 'u', [raw]), /Provider Error: 400/);
});

// ── providers ───────────────────────────────────────────────────────────────

test('queryModel routes OpenAI-compatible providers', async () => {
  const cp = { id: 'cp', connector: 'openai', endpoint: 'https://gateway/v1', apiKey: 'k' };
  stubFetch([[(r) => r.url.includes('/chat/completions'), () => chatOk]]);
  assert.equal(await queryModel('cp', 'model', 'sys', 'u', [cp]), 'REPLY');
});

test('OpenAI-compatible providers honor configured headers and method', async () => {
  const cp = {
    id: 'hdr', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'fallback-key',
    method: 'PATCH', headers: '{"X-Tenant":"acme","Authorization":"Bearer override"}'
  };
  stubFetch([[(r) => r.url.includes('/chat/completions'), (req) => {
    assert.equal(req.method, 'PATCH');
    assert.equal(req.headers['X-Tenant'], 'acme');
    assert.equal(req.headers.Authorization, 'Bearer override', 'configured auth must win over the apiKey fallback');
    return chatOk;
  }]]);
  assert.equal(await queryModel('hdr', 'model', 'sys', 'u', [cp]), 'REPLY');
});

test('provider requests carry the key in a header, not the URL', async () => {
  const cp = { id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'geminikey' };
  stubFetch([[(r) => r.url.includes('/chat/completions'), (req) => {
    assert.ok(!req.url.includes('key='), 'key must not appear in the request URL');
    assert.equal(req.headers.Authorization, 'Bearer geminikey');
    return chatOk;
  }]]);
  await queryModel('cp', 'gm', 'sys', 'u', [cp]);
});

test('AI judge on an OpenAI-compatible endpoint merges custom headers and method', async () => {
  stubFetch([[(r) => r.url.includes('/chat/completions'), (req) => {
    assert.equal(req.method, 'PUT');
    assert.equal(req.headers['X-Custom'], 'yes');
    return jsonRes({ choices: [{ message: { content: 'J' } }] });
  }]]);
  const out = await queryAI({
    provider: 'cp', model: 'm', endpoint: 'https://h/v1/chat/completions', apiKey: 'k',
    method: 'put', headers: { 'X-Custom': 'yes' }
  }, 's', 'u', 300);
  assert.equal(out, 'J');
});

test('queryModel surfaces custom-provider errors and unknown providers', async () => {
  const cp = { id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' };
  stubFetch([[(_unused) => true, () => jsonRes({ error: { message: 'gateway denied' } }, 401)]]);
  await assert.rejects(queryModel('cp', 'm', 's', 'u', [cp]), /gateway denied/);
  await assert.rejects(queryModel('ghost', 'm', 's', 'u', []), /Unknown provider/);
});

test('queryModel raw connectors substitute placeholders and extract the response path', async () => {
  const cp = {
    id: 'raw', connector: 'raw', method: 'POST', endpoint: 'https://raw:9/api',
    apiKey: 'k', bodyTemplate: '{"model":"{{model}}","system":"{{systemPrompt}}","user":"{{userPrompt}}","tokens":{{maxTokens}},"msg":"{{userPrompt}}"}',
    responsePath: 'data.out'
  };
  stubFetch([[(r) => r.url.includes('/api'), (req) => {
    assert.deepEqual(JSON.parse(JSON.stringify(req.body)), {
      model: 'm1', system: 'SYS', user: 'USR', tokens: 300,
      msg: 'USR'
    });
    return jsonRes({ data: { out: 'RAW VAL' } });
  }]]);
  assert.equal(await queryModel('raw', 'm1', 'SYS', 'USR', [cp]), 'RAW VAL');
});

test('raw connector errors: empty template, invalid JSON, response fallback, auth header', async () => {
  const noTemplate = { id: 'r', connector: 'raw', endpoint: 'https://raw', bodyTemplate: '', responsePath: 'choices.0.message.content' };
  await assert.rejects(queryModel('r', 'm', 's', 'u', [noTemplate]), /no Body Template/);

  const badJson = { ...noTemplate, bodyTemplate: '{"a": {{userPrompt}}' };
  await assert.rejects(queryModel('r', 'm', '{{', 'u', [badJson]), /invalid JSON/);

  const withHeader = {
    ...noTemplate, apiKey: 'k', method: 'put', headers: { Authorization: 'Basic xyz' },
    bodyTemplate: '{"u":"{{userPrompt}}"}', responsePath: ''
  };
  stubFetch([[(r) => r.url.includes('/api'), (req) => {
    assert.equal(req.body.u, 'hi');
    return jsonRes({ complex: true });
  }]]);
  // responsePath '' → falls back to JSON.stringify(data)
  assert.equal(await queryModel('r', 'm', 's', 'hi', [{ ...withHeader, endpoint: 'https://raw/api' }]), JSON.stringify({ complex: true }));
});

// ── fetchProviderModels / testProvider ────────────────────────────────────

test('provider endpoint policy blocks private destinations unless approved', () => {
  for (const endpoint of ['https://localhost:11434', 'https://127.0.0.1:8080', 'https://10.0.0.1', 'https://[::1]:8080', 'https://metadata.google.internal']) {
    assert.throws(() => assertProviderEndpointAllowed(endpoint), /Private or loopback/);
  }
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://localhost:11434', { allowPrivate: true }));
  for (const endpoint of ['https://192.0.2.1', 'https://[fd00::1]']) {
    assert.throws(() => assertProviderEndpointAllowed(endpoint), /Private or loopback/);
    assert.doesNotThrow(() => assertProviderEndpointAllowed(endpoint, { allowPrivate: true }));
  }
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://example.com/v1'));
});

test('provider endpoint policy rejects userinfo and query-string secrets', () => {
  assert.throws(() => assertProviderEndpointAllowed('https://user:pass@example.com/v1'), /userinfo/i);
  assert.throws(() => assertProviderEndpointAllowed('https://example.com/v1?api_key=abc'), /query string/i);
  assert.throws(() => assertProviderEndpointAllowed('https://example.com/v1?X-Api-Key=abc'), /query string/i);
  assert.throws(() => assertProviderEndpointAllowed('https://example.com/v1?token=abc'), /query string/i);
  assert.throws(() => assertProviderEndpointAllowed('https://example.com/v1?client_secret=abc'), /query string/i);
  // The same rules apply even when private access is explicitly approved.
  assert.throws(() => assertProviderEndpointAllowed('https://user@example.com/v1', { allowPrivate: true }), /userinfo/i);
  assert.throws(() => assertProviderEndpointAllowed('https://localhost:11434?key=abc', { allowPrivate: true }), /query string/i);
  // Non-secret query parameters remain fine.
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://example.com/v1?stream=true&model=x'));
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://example.com/v1?e=abc'));
});

test('extended secret query params are blocked case-insensitively', () => {
  for (const name of ['access_key', 'accessKey', 'bearer', 'session', 'session_token', 'client_secret', 'client-secret', 'id_token', 'refresh_token', 'auth', 'auth_token', 'sig']) {
    assert.throws(() => assertProviderEndpointAllowed(`https://example.com/v1?${name}=abc`), /query string/i, `${name} must be blocked`);
  }
});

test('findSecretQueryParam detects secret params and tolerates junk input', () => {
  assert.equal(findSecretQueryParam('https://example.com/v1?api_key=abc'), 'api_key');
  assert.equal(findSecretQueryParam('https://example.com/v1?Bearer=abc'), 'Bearer');
  assert.equal(findSecretQueryParam('https://example.com/v1?model=x&stream=true'), null);
  assert.equal(findSecretQueryParam('https://example.com/v1'), null);
  assert.equal(findSecretQueryParam(''), null);
  assert.equal(findSecretQueryParam(null), null);
  assert.equal(findSecretQueryParam('not a url at all'), null);
  assert.equal(findSecretQueryParam(undefined), null);
});

test('providerRouteFor always routes directly and enforces endpoint policy', () => {
  assert.equal(providerRouteFor('https://example.com/v1').via, 'direct');
  assert.equal(providerRouteFor('https://ollama:11434').via, 'direct');
  assert.equal(providerRouteFor('https://93.184.216.34/v1').via, 'direct');
  assert.equal(providerRouteFor('https://[2606:4700:4700::1111]/v1').via, 'direct');
  // Explicit private approval stays allowed.
  assert.equal(providerRouteFor('https://localhost:11434', { allowPrivate: true }).via, 'direct');
  assert.equal(providerRouteFor('https://internal-gateway/v1', { allowPrivate: true }).via, 'direct');
  // Without approval, private/special-use endpoints are still rejected outright.
  assert.throws(() => providerRouteFor('https://localhost:11434'), /explicit approval/);
  assert.throws(() => providerRouteFor('https://metadata.google.internal'), /explicit approval/);
});

test('fetchProviderModels normalizes ids and errors', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ data: [{ id: 'models/gemini-2.5' }, { id: 'plain' }] })]]);
  assert.deepEqual(await fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }), ['gemini-2.5', 'plain']);
  assert.deepEqual(await fetchProviderModels({ connector: 'raw' }), []);
  stubFetch([[(_unused) => true, () => jsonRes({}, 404)]]); // 404 → not retried
  await assert.rejects(fetchProviderModels({ endpoint: 'https://h/v1/chat/completions', connector: 'openai' }), /Models endpoint HTTP 404/);
});

test('fetchProviderModels can be cancelled before a stale provider result resolves', async () => {
  const controller = new AbortController();
  let seenSignal;
  globalThis.fetch = async (_url, request) => {
    seenSignal = request.signal;
    return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    });
  };
  const pending = fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai', apiKey: 'secret' }, controller.signal);
  controller.abort(new DOMException('Vault locked', 'AbortError'));
  await assert.rejects(pending, /Vault locked/);
  assert.equal(seenSignal, controller.signal, 'provider model discovery must use the session cancellation signal');
});

test('testProvider: raw connector reachability check', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({}, 200)]]);
  const r = await testProvider({ connector: 'raw', endpoint: 'https://raw' });
  assert.equal(r.ok, true);
  assert.match(r.chatStatus, /reachable/);

  stubFetch([[], () => { throw new Error('fetch failed'); }]);
  await assert.rejects(testProvider({ connector: 'raw', endpoint: 'https://raw' }), /Connection failed/);
  await assert.rejects(testProvider({ connector: 'raw', endpoint: '' }), /Endpoint URL is required/);
});

test('testProvider: raw connectors honor the configured method and probe body', async () => {
  const seen = [];
  stubFetch([[(_unused) => true, (req) => { seen.push({ method: req.method, body: req.body }); return jsonRes({}, 200); }]]);
  const cp = { connector: 'raw', endpoint: 'https://raw/api', method: 'post', bodyTemplate: '{"model":"{{model}}","user":"{{userPrompt}}","tokens":{{maxTokens}}}' };
  const r = await testProvider(cp);
  assert.equal(r.ok, true);
  assert.equal(seen[0].method, 'POST');
  assert.deepEqual(seen[0].body, { model: '', user: 'ping', tokens: 1 });
});

test('testProvider and fetchProviderModels honor custom headers', async () => {
  const cp = { endpoint: 'https://h/v1', apiKey: 'k', connector: 'openai', headers: '{"X-Tenant":"acme","Authorization":"Bearer override"}' };
  const seen = [];
  stubFetch([[(_unused) => true, (req) => { seen.push({ url: req.url, headers: req.headers }); return jsonRes({ data: [{ id: 'm-a' }] }); }]]);
  await testProvider(cp);
  const modelsCall = seen[0];
  assert.equal(modelsCall.headers['X-Tenant'], 'acme');
  assert.equal(modelsCall.headers.Authorization, 'Bearer override', 'configured auth wins over apiKey fallback');

  stubFetch([[(_unused) => true, (_unused2) => jsonRes({ data: [{ id: 'm-a' }] })]]);
  const models = await fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai', headers: '{"X-Tenant":"acme"}' });
  assert.deepEqual(models, ['m-a']);

  // apiKey without an authorization header → Bearer is synthesized.
  stubFetch([[(_unused) => true, (req) => { assert.equal(req.headers.Authorization, 'Bearer k'); return jsonRes({ data: [{ id: 'm-b' }] }); }]]);
  await fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai', apiKey: 'k', headers: '{"X-Tenant":"acme"}' });
});

test('testProvider: models endpoint auth and reachability', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), (_unused) => jsonRes({ data: [{ id: 'm-a' }] })],
    [(r) => r.url.includes('/chat/completions'), (_unused) => jsonRes({}, 400)]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(r.models, ['m-a']);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({}, 401)]]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Authentication failed \(HTTP 401\)/);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({}, 429)]]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Rate limit reached \(HTTP 429\)/);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({}, 403)]]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Authentication failed/);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({}, 503)]]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Models check failed/);

  stubFetch([[] , () => { throw new Error('load failed'); }]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Models check failed/);
});

test('testProvider: probe path with model-gated gateway retry', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'REAL-MODEL' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return jsonRes({}, req.body.model === 'REAL-MODEL' ? 200 : 401);
    }]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(calls, ['__groundrumble_probe__', 'REAL-MODEL']);
  assert.equal(r.model, 'REAL-MODEL');
  assert.match(r.chatStatus, /reachable and authenticated/);
});

test('testProvider: probe succeeds directly without retry', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'A' }] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 400)]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.match(r.chatStatus, /reachable and authenticated/);
});

test('testProvider: probe error branches', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 429)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Rate limit/);

  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 401)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: '' }), /Authentication failed/);

  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 403)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Authentication failed/);

  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 502)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Chat test failed/);
});

test('testProvider: gateway retry with a still-failing real model reports the HTTP status', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'REAL' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return req.body.model === 'REAL' ? jsonRes({}, 500) : jsonRes({}, 401);
    }]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Chat endpoint returned HTTP 500/);
  assert.deepEqual(calls, ['__groundrumble_probe__', 'REAL']);
});

test('testProvider: a 404 "model not found" probe retries with a real catalog model', async () => {
  // Groq / Hugging Face / Gemini-style behavior: an unknown probe model id is
  // rejected with 404, but a real catalog model authenticates fine.
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'llama-3.3-70b-versatile' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return req.body.model === '__groundrumble_probe__' ? jsonRes({}, 404) : jsonRes({ choices: [{ message: { content: 'ok' } }] }, 200);
    }]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(calls, ['__groundrumble_probe__', 'llama-3.3-70b-versatile']);
  assert.equal(r.model, 'llama-3.3-70b-versatile');
  assert.match(r.chatStatus, /reachable and authenticated/);
});

test('testProvider: skips deprecated/retired catalog models until one authenticates', async () => {
  // Gemini-style: the catalog leads with retired 2.5-line models (404) before a
  // currently available model (200). The retry must walk past the dead entries.
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-flash-latest' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return /gemini-flash-latest$/.test(req.body.model) ? jsonRes({}, 200) : jsonRes({}, 404);
    }]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(calls, ['__groundrumble_probe__', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest']);
  assert.equal(r.model, 'gemini-flash-latest');
  assert.match(r.chatStatus, /reachable and authenticated/);
});

test('testProvider: non-chat catalog models are deprioritized for the retry', async () => {
  // Groq-style: the catalog leads with TTS/audio entries; the chat-capable
  // model must be tried first so an audio model's 400 isn't treated as auth.
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'canopylabs/orpheus-v1-english' }, { id: 'whisper-large-v3' }, { id: 'qwen/qwen3.6-27b' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return req.body.model === 'qwen/qwen3.6-27b' ? jsonRes({}, 200) : jsonRes({}, 404);
    }]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(calls, ['__groundrumble_probe__', 'qwen/qwen3.6-27b']);
  assert.equal(r.model, 'qwen/qwen3.6-27b');
});

test('testProvider: a rate-limited retry candidate is skipped for the next model', async () => {
  // A 429 on one candidate shouldn't fail the test if a later candidate works.
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'A' }, { id: 'B' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      if (req.body.model === '__groundrumble_probe__') return jsonRes({}, 404);
      return req.body.model === 'A' ? jsonRes({}, 429) : jsonRes({}, 200);
    }]
  ]);
  const r = await testProvider({ endpoint: 'https://h/v1', apiKey: 'k' });
  assert.deepEqual(calls, ['__groundrumble_probe__', 'A', 'B']);
  assert.equal(r.model, 'B');
});

test('testProvider: reports a quota hint when every retry candidate is rate-limited', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'A' }] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 429)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Rate limit/);
});

test('testProvider: a 404 probe on a genuinely wrong endpoint still fails', async () => {
  // If the real catalog model also 404s, the endpoint itself is wrong — fail.
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'REAL' }] })],
    [(r) => r.url.includes('/chat/completions'), (req) => {
      calls.push(req.body.model);
      return jsonRes({}, 404);
    }]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Chat endpoint returned HTTP 404/);
  assert.deepEqual(calls, ['__groundrumble_probe__', 'REAL']);
});

// ── AI judge transport (queryAI dispatch) ─────────────────────────────────

test('queryAI dispatches openai-compatible, raw, endpoint, and unknown judge providers', async () => {
  stubFetch([[(r) => r.url.includes('/chat/completions'), () => jsonRes({ choices: [{ message: { content: 'O1' } }] })]]);
  assert.equal(await queryAI({ provider: 'groq', model: 'x', apiKey: 'k', endpoint: 'https://h/v1/chat/completions' }, 'sys', 'u', 300, undefined, true), 'O1');

  // raw connector judge
  stubFetch([[(r) => r.url.includes('/raw'), () => jsonRes({ data: { out: 'RAW' } })]]);
  assert.equal(await queryAI({ provider: 'custom', connector: 'raw', model: 'm', endpoint: 'https://r/raw', bodyTemplate: '{"u":"{{userPrompt}}"}', responsePath: 'data.out' }, 's', 'u', 300), 'RAW');

  // openai-compatible endpoint (no provider match, judged via queryOpenAIJudge)
  stubFetch([[(r) => r.url.includes('/e'), () => jsonRes({ choices: [{ message: { content: 'E1' } }] })]]);
  assert.equal(await queryAI({ provider: 'anything', model: 'm', endpoint: 'https://x/e' }, 's', 'u', 300), 'E1');

  await assert.rejects(queryAI({ provider: 'nope' }, 's', 'u', 300), /Unknown judge provider/);
});

test('queryAI openai judge: reasoning-model recovery (empty content + reasoning_content)', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: '', reasoning_content: 'think\n{"status":"SECURE"}\n' } }] })]]);
  const out = await queryAI({ provider: 'mock', model: 'm', endpoint: 'https://h/chat' }, 's', 'u', 300, undefined, true);
  assert.equal(out, '{"status":"SECURE"}');
});

test('queryAI openai judge: empty content retries once with thinking disabled', async () => {
  const calls = [];
  stubFetch([[(_unused) => true, () => {
    calls.push(calls.length);
    if (calls.length === 1) return jsonRes({ choices: [{ message: { content: '' } }] });
    return jsonRes({ choices: [{ message: { content: '{"ok":true}' } }] });
  }]]);
  const out = await queryAI({ provider: 'mock', model: 'm', endpoint: 'https://h/chat' }, 's', 'u', 300, undefined, true);
  assert.equal(out, '{"ok":true}');
  assert.equal(calls.length, 2);
});

test('queryAI openai judge: 413 payload-too-large shrinks the prompt and eventually throws', async () => {
  const big = 'x'.repeat(30000);
  stubFetch([[(_unused) => true, () => jsonRes({}, 413)]]);
  await assert.rejects(
    queryAI({ provider: 'mock', model: 'm', endpoint: 'https://h/chat' }, big, big, 300),
    /Payload too large/
  );
});

test('queryAI openai judge: non-2xx throws Judge HTTP error', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({}, 400)]]);
  await assert.rejects(queryAI({ provider: 'mock', model: 'm', endpoint: 'https://h/chat' }, 's', 'u', 300), /Judge HTTP 400/);
});

// ── text helpers ───────────────────────────────────────────────────────────

test('truncateText caps, cuts at sentence boundaries, and passes short text through', () => {
  assert.equal(truncateText('short', 100), 'short');
  // Sentence boundary inside the first 60% → cut there.
  const long = 'a'.repeat(50) + '. ' + 'b'.repeat(200);
  const out = truncateText(long, 100);
  assert.ok(out.includes('.') && out.includes('(truncated)'));
  assert.ok(out.length <= 100 + '… (truncated)'.length + 2);
  // Sentence boundary beyond 60% → cut at maxChars.
  const lateBoundary = 'y'.repeat(70) + '. ' + 'z'.repeat(300);
  const out2 = truncateText(lateBoundary, 100);
  assert.ok(out2.startsWith('y'.repeat(70) + '.'), 'cuts at the late boundary');
  assert.match(out2, /\(truncated\)/);
  const noBoundary = 'w'.repeat(300);
  const out3 = truncateText(noBoundary, 100);
  assert.ok(out3.length <= 100 + '… (truncated)'.length + 2);
});

test('shared JSON helpers salvage and extract', () => {
  assert.equal(stripFencesCandidates('```json\n{"a":1}\n```').length, 1);
  assert.deepEqual(stripFencesCandidates(''), []);
  const blocks = extractJsonBlocks('x {"a":{"b":1}} y ["z"]');
  assert.equal(blocks.length, 2);
  assert.equal(parseJSONObject('prefix {"status":"high"} suffix').status, 'high');
  assert.equal(repairTruncatedJson('{"a":[1,2,}'), null); // broken
  assert.deepEqual(repairTruncatedJson('{"a": "unterminated'), { a: 'unterminated' });
  assert.equal(repairTruncatedJson(''), null);
});

// ── rate limiter / reset ───────────────────────────────────────────────────

test('resetRateLimiter clears per-key slots', () => {
  resetRateLimiter();
});

test('rate limiter sleeps to enforce rpm and honors aborts', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: 'OK' } }] })]]);

  // 60 req/min → 1000ms spacing; a second back-to-back acquire must wait. Use
  // fast timers so the enforced wait always executes regardless of wall-clock
  // jitter and never actually sleeps.
  await withFastTimers(async () => {
    resetRateLimiter();
    await queryAI({ provider: 'mock', model: 'spaced', endpoint: 'https://h/chat', rpm: 60 }, 's', 'u', 10);
    await queryAI({ provider: 'mock', model: 'spaced', endpoint: 'https://h/chat', rpm: 60 }, 's', 'u', 10);
  });

  // 1 req/min → a 60s enforced wait: aborting during it must reject.
  resetRateLimiter();
  await queryAI({ provider: 'mock', model: 'aborted', endpoint: 'https://h/chat', rpm: 1 }, 's', 'u', 10);
  const ac = new AbortController();
  const p = queryAI({ provider: 'mock', model: 'aborted', endpoint: 'https://h/chat', rpm: 1 }, 's', 'u', 10, ac.signal);
  queueMicrotask(() => ac.abort());
  await assert.rejects(p, (e) => e instanceof DOMException);
  resetRateLimiter();
});

// Keep the exports used above reachable, and import lodash-ish assert on headers:
test('request headers flow to provider fetches', async () => {
  const cp = { id: 'groq', connector: 'openai', endpoint: 'https://api.groq.com/openai/v1', apiKey: 'hdr-key' };
  stubFetch([[(r) => hostIs(r.url, 'api.groq.com'), (req) => {
    assert.equal(req.headers.Authorization, 'Bearer hdr-key');
    return chatOk;
  }]]);
  assert.equal(await queryModel('groq', 'm', 's', 'u', [cp]), 'REPLY');
});

// ── remaining transport edge cases ─────────────────────────────────────────

test('raw provider surfaces the provider payload error message', async () => {
  const cp = { id: 'r', connector: 'raw', endpoint: 'https://raw/api', apiKey: 'k', bodyTemplate: '{"u":"{{userPrompt}}"}' };
  stubFetch([[(_unused) => true, () => jsonRes({ message: 'plain message' }, 400)]]);
  await assert.rejects(queryModel('r', 'm', 's', 'u', [cp]), /plain message/);
});

test('testProvider: probe rejects with no real model to verify against', async () => {
  // 401/403 with an empty catalog → auth failure.
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 401)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /Authentication failed \(HTTP 401\)/);

  // 404 with an empty catalog → the chat endpoint itself could not be verified.
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 404)]
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }), /no model could be verified/);
});

test('rate limiter rejects immediately when the signal is already aborted', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: 'OK' } }] })]]);
  resetRateLimiter();
  await queryAI({ provider: 'mock', model: 'preabort', endpoint: 'https://h/chat', rpm: 1 }, 's', 'u', 10); // occupy slot
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    queryAI({ provider: 'mock', model: 'preabort', endpoint: 'https://h/chat', rpm: 1 }, 's', 'u', 10, ac.signal),
    (e) => e instanceof DOMException
  );
  resetRateLimiter();
});

test('queryAI openai judge: normalizeContent handles array and object content', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: [{ text: 'A' }, { text: 'B' }] } }] })]]);
  assert.equal(await queryAI({ provider: 'mock', model: 'arr', endpoint: 'https://h/chat' }, 's', 'u', 300), 'A B');
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: { text: 'OBJ' } } }] })]]);
  assert.equal(await queryAI({ provider: 'mock', model: 'obj', endpoint: 'https://h/chat' }, 's', 'u', 300), 'OBJ');
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: 123 } }] })]]);
  assert.equal(await queryAI({ provider: 'mock', model: 'num', endpoint: 'https://h/chat' }, 's', 'u', 300), '');
});

test('queryOpenAIJudge returns empty content when reasoning holds no parseable JSON', async () => {
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: '', reasoning_content: 'just thinking, no json at all' } }] })]]);
  const out = await queryAI({ provider: 'mock', model: 'noraw', endpoint: 'https://h/chat' }, 's', 'u', 300);
  assert.equal(out, '');
});

test('queryOpenAIJudge recovers the last valid JSON block from reasoning with noise', async () => {
  // A broken block followed by a valid one → extractLastJsonBlock must skip it.
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: '', reasoning_content: 'here {"a":} there {"status":"SECURE","reasoning":"r"} end' } }] })]]);
  const out = await queryAI({ provider: 'mock', model: 'noisy', endpoint: 'https://h/chat' }, 's', 'u', 300);
  assert.equal(out, '{"status":"SECURE","reasoning":"r"}');
});

test('queryAI raw judge adds an Authorization header and honors a custom method', async () => {
  stubFetch([[(r) => r.url.includes('/raw'), (req) => {
    assert.equal(req.headers.Authorization, 'Bearer judge-key');
    assert.equal(req.method, 'PUT');
    return jsonRes({ out: 'J' });
  }]]);
  const out = await queryAI({
    provider: 'custom', connector: 'raw', model: 'm', endpoint: 'https://r/raw', apiKey: 'judge-key',
    method: 'put', bodyTemplate: '{"u":"{{userPrompt}}"}', responsePath: 'out' 
  }, 's', 'u', 300);
  assert.equal(out, 'J');
});

test('parseJSONObject recovers truncated JSON as a last resort', () => {
  assert.deepEqual(parseJSONObject('{"a": 1'), { a: 1 }); // repair succeeds
  assert.equal(parseJSONObject('{"a": [}'), null); // repair fails → null
  assert.equal(parseJSONObject('null'), null);
});

test('fetchWithRetry aborts before any attempt when the signal is already aborted', async () => {
  const ac = new AbortController();
  ac.abort();
  stubFetch([[(_unused) => true, () => jsonRes({ choices: [{ message: { content: 'OK' } }] })]]);
  await assert.rejects(
    queryAI({ provider: 'mock', model: 'abortfirst', endpoint: 'https://h/chat', rpm: 0 }, 's', 'u', 300, ac.signal),
    (e) => e instanceof DOMException
  );
});

test('fetchWithRetry surfaces the caller abort reason itself when it is an Error', async () => {
  const ac = new AbortController();
  const reason = new Error('stop now');
  ac.abort(reason);
  stubFetch([[_unused => true, () => jsonRes({ choices: [{ message: { content: 'OK' } }] })]]);
  await assert.rejects(
    fetchWithRetry('https://h/chat', {}, 2, null, ac.signal),
    (e) => e === reason && e.message === 'stop now' && e.nonRetryable === true,
    'the exact Error instance is rethrown, marked non-retryable'
  );
});

test('fetchWithRetry returns the matching returnOnStatus response instead of throwing', async () => {
  // Callers (e.g. connection probing) want the raw 429/5xx response for
  // inspection rather than the retry/throw ladder.
  const calls = [];
  stubFetch([[_unused => true, () => {
    calls.push(1);
    return jsonRes({}, 429, { 'retry-after': '0' });
  }]]);
  const res = await fetchWithRetry('https://h/chat', {}, 2, 429);
  assert.equal(res.status, 429);
  assert.equal(calls.length, 1, 'returnOnStatus short-circuits: zero retries');
});

test('fetchWithRetry backs off on a transient 429 and succeeds on retry', async () => {
  await withFastTimers(async () => {
    const calls = [];
    stubFetch([[(_unused) => true, () => {
      calls.push(1);
      if (calls.length === 1) return jsonRes({}, 429, { 'retry-after': '0' });
      return jsonRes({ choices: [{ message: { content: 'RECOVERED' } }] });
    }]]);
    const out = await queryAI({ provider: 'mock', model: 'retryok', endpoint: 'https://h/chat', rpm: 0 }, 's', 'u', 300);
    assert.equal(out, 'RECOVERED');
    assert.ok(calls.length >= 2);
  });
});

test('fetchWithRetry surfaces the quota hint on a long Retry-After (429 >= 60s)', async () => {
  await withFastTimers(async () => {
    stubFetch([[_unused => true, () => jsonRes({}, 429, { 'retry-after': '600' })]]);
    await assert.rejects(queryAI({ provider: 'mock', model: 'quota', endpoint: 'https://h/chat', rpm: 0 }, 's', 'u', 300), /limit/i);
  });
});

test('fetchWithRetry recovers after a network error', async () => {
  await withFastTimers(async () => {
    const calls = [];
    stubFetch([[_unused => true, () => {
      calls.push(1);
      if (calls.length === 1) throw new Error('ECONNRESET');
      return jsonRes({ choices: [{ message: { content: 'OK2' } }] });
    }]]);
    // A literal public IP routes direct, where transient network errors retry.
    const out = await queryAI({ provider: 'mock', model: 'neferr', endpoint: 'https://93.184.216.34/v1/chat/completions', rpm: 0 }, 's', 'u', 300);
    assert.equal(out, 'OK2');
  });
});

test('fetchWithRetry throws after exhausting retries', async () => {
  await withFastTimers(async () => {
    stubFetch([[_unused => true, () => jsonRes({}, 429, { 'retry-after': '0' })]]);
    await assert.rejects(queryAI({ provider: 'mock', model: 'exhausted', endpoint: 'https://h/chat', rpm: 0 }, 's', 'u', 300), /limit/i);
  });
});

test('fetchWithRetry refuses to follow a redirect on the direct path (credential leak guard)', async () => {
  await withFastTimers(async () => {
    const calls = [];
    stubFetch([[_unused => true, () => {
      calls.push(1);
      return { ok: false, status: 307, headers: { get: () => null }, text: async () => '', json: async () => { throw new Error('redirect'); } };
    }]]);
    // Provider fetches are always direct. A malicious endpoint must not be able
    // to bounce the browser (and its Authorization / custom headers) to a
    // different origin via a 3xx.
    await assert.rejects(
      queryAI({ provider: 'mock', model: 'redirect', endpoint: 'https://93.184.216.34/v1/chat/completions', rpm: 0 }, 's', 'u', 300),
      /refusing to follow/
    );
    assert.equal(calls.length, 1, 'the redirect is refused, not retried or followed');
  });
});

test('fetchWithRetry refuses an opaque redirect (redirect:manual) on the direct path', async () => {
  await withFastTimers(async () => {
    const calls = [];
    stubFetch([[_unused => true, () => {
      calls.push(1);
      return { ok: false, status: 0, type: 'opaqueredirect', headers: { get: () => null }, text: async () => '', json: async () => { throw new Error('redirect'); } };
    }]]);
    await assert.rejects(
      queryAI({ provider: 'mock', model: 'opaque', endpoint: 'https://93.184.216.34/v1/chat/completions', rpm: 0 }, 's', 'u', 300),
      /refusing to follow/
    );
    assert.equal(calls.length, 1);
  });
});

test('queryAI rejects an unknown judge provider with a clear error', async () => {
  await assert.rejects(
    queryAI({ provider: 'bogus' }, 's', 'u', 100),
    { message: /Unknown judge provider.*bogus/ }
  );
  await assert.rejects(
    queryAI(null, 's', 'u', 100),
    { message: /Unknown judge provider.*none/ }
  );
});

test('queryOpenAIJudge salvages a JSON block from reasoning_content when content is empty', async () => {
  await withFastTimers(async () => {
    stubFetch([[_unused => true, () => jsonRes({
      choices: [{ message: {
        content: '',
        reasoning_content: 'Thinking…\n{"salvaged":true}\nEnd.',
      } }]
    })]]);
    const out = await queryAI(
      { provider: 'mock', model: 'reasoning', endpoint: 'https://h/chat', rpm: 0 },
      's', 'u', 300, undefined, true,
    );
    assert.deepEqual(JSON.parse(out), { salvaged: true });
  });
});

test('queryOpenAIJudge passes non-HTTP judge errors through without the Judge HTTP prefix', async () => {
  // toJudgeHttpError returns the original error unchanged when it does not
  // match "HTTP <status>: …", so the transport message text survives verbatim.
  await withFastTimers(async () => {
    stubFetch([[_unused => true, async () => { throw new TypeError('Failed to fetch'); }]]);
    await assert.rejects(
      queryAI({ provider: 'mock', model: 'neterr', endpoint: 'https://h/chat', rpm: 0 }, 's', 'u', 300),
      (e) => e.message === 'Failed to fetch' && !/^Judge HTTP/.test(e.message)
    );
  });
});

test('provider fetches surface invalid or empty JSON bodies as clear errors', async () => {
  stubFetch([[(_unused) => true, () => textRes('not-json', 200)]]);
  await assert.rejects(fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }), /not json/);

  stubFetch([[(_unused) => true, () => textRes('', 200)]]);
  await assert.rejects(fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }), /not json/);
});
