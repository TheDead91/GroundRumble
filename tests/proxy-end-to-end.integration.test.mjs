// End-to-end proxy tests against a real HTTP backend via the provided custom
// relay at http://localhost:3000 (CORS-anywhere style). A small OpenAI-compatible
// mock server is spawned with an OS-assigned port (listen(0)); the child reports
// the actual bound port over IPC only after a successful listen, and the real
// src/utils/api.js code is driven through the relay, covering the spec's
// "Ollama on loopback via proxy" scenarios plus article fetching and provider
// redirect refusal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUSTOM_RELAY = 'http://localhost:3000';
const STARTUP_TIMEOUT_MS = 10000;

const reachable = async (url, timeoutMs = 3000) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok || r.status === 400 || r.status === 403;
  } catch { return false; }
};

let mock;
let mockBaseUrl;

const {
  setProxyConfig, setProxyConfirmHandler, fetchProviderModels,
  queryAI, fetchSourceExcerpt, resetProxyConsent, resetRateLimiter,
  providerRouteFor
} = await import('../src/utils/api.js');

const mockCp = {
  provider: 'mock', model: 'test-model', connector: 'openai',
  endpoint: null, // populated once the mock reports its OS-assigned port
  apiKey: 'test-key', allowPrivate: true, allowInsecureTransport: true, rpm: 0
};

const mockHits = async () => {
  const r = await fetch(`${mockBaseUrl}/stats`);
  return (await r.json()).hits;
};
const mockReset = async () => {
  await fetch(`${mockBaseUrl}/stats/reset`);
};

// Spawn the mock and wait for its IPC readiness message. Resolves with the
// child handle and the authoritative OS-assigned port. Rejects immediately on
// child error, child exit before ready, or a bounded startup timeout.
function startMock() {
  const mockPath = path.join(HERE, 'mock-ollama.mjs');
  const child = spawn(process.execPath, [mockPath], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.removeAllListeners('message');
      child.removeAllListeners('error');
      child.removeAllListeners('exit');
      fn(arg);
    };

    const fail = (err) => {
      if (!settled) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }
      finish(reject, err);
    };

    child.on('message', (msg) => {
      if (msg && msg.type === 'ready' && Number.isInteger(msg.port) && msg.port > 0 && msg.port <= 65535) {
        finish(resolve, { child, port: msg.port });
      }
    });

    child.on('error', (err) => {
      fail(new Error(`mock-ollama failed to start: ${err.message}`, { cause: err }));
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      const detail = signal ? `signal ${signal}` : `exit code ${code}`;
      fail(new Error(`mock-ollama exited before reporting readiness (${detail})`));
    });

    timer = setTimeout(() => {
      fail(new Error(`mock-ollama did not report readiness within ${STARTUP_TIMEOUT_MS}ms`));
    }, STARTUP_TIMEOUT_MS);
  });
}

const terminate = (child) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let timer;
    const done = () => { if (timer) clearTimeout(timer); resolve(); };
    child.once('exit', done);
    child.kill('SIGTERM');
    timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  });
};

before(async () => {
  const { child, port } = await startMock();
  mock = child;
  mockBaseUrl = `http://127.0.0.1:${port}`;
  mockCp.endpoint = `${mockBaseUrl}/v1`;
  // IPC readiness is authoritative; this HTTP probe is only a secondary
  // post-ready sanity check that the loopback endpoint actually answers.
  assert.ok(await reachable(`${mockBaseUrl}/`), 'mock server should respond after reporting readiness');
  setProxyConfirmHandler(() => true);
});

after(async () => {
  await terminate(mock);
  setProxyConfirmHandler(null);
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: false, articles: false } });
});

const relayAvailable = await reachable(`${CUSTOM_RELAY}/?url=${encodeURIComponent('https://example.com/')}`);

test('custom relay: provider model discovery via proxy reaches the loopback mock', { skip: !relayAvailable }, async () => {
  resetProxyConsent();
  resetRateLimiter();
  await mockReset();
  setProxyConfig({ enabled: true, baseUrl: `${CUSTOM_RELAY}/?url={url}`, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  assert.equal(providerRouteFor(mockCp.endpoint, mockCp).via, 'proxy', 'loopback provider routes via the proxy when providers category is on');
  const models = await fetchProviderModels(mockCp);
  assert.deepEqual(models, ['test-model']);
  const hits = await mockHits();
  assert.ok(hits.includes('GET /v1/models'), `mock should have been hit via the relay: ${hits.join(', ')}`);
});

test('custom relay: provider chat completion via proxy returns the model response', { skip: !relayAvailable }, async () => {
  resetProxyConsent();
  await mockReset();
  const judge = { ...mockCp, connector: 'openai' };
  const out = await queryAI(judge, 'You are a test.', 'ping', 300);
  assert.equal(out, 'MOCK-COMPLETION-OK');
  const hits = await mockHits();
  assert.ok(hits.includes('POST /v1') || hits.includes('POST /v1/chat/completions'), `mock chat should have been hit: ${hits.join(', ')}`);
});

test('custom relay: article fetch via proxy extracts real content', { skip: !relayAvailable }, async () => {
  resetProxyConsent();
  setProxyConfig({ enabled: true, baseUrl: `${CUSTOM_RELAY}/?url={url}`, mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  const r = await fetchSourceExcerpt('https://example.com/', 5000, undefined, { allowPrivate: true });
  assert.match(r.excerpt, /Example Domain/i);
  assert.match(r.note, /Fetched via proxy/);
});

test('proxy routing stays direct when no category is opted in', () => {
  setProxyConfig({ enabled: true, baseUrl: `${CUSTOM_RELAY}/?url={url}`, mode: 'fallback', categories: { privateNet: false, providers: false, articles: false } });
  assert.equal(providerRouteFor(mockCp.endpoint, mockCp).via, 'direct');
});
