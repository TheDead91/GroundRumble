// End-to-end proxy tests against a real HTTP backend via the provided custom
// relay at http://localhost:3000 (CORS-anywhere style). A small OpenAI-compatible
// mock server (127.0.0.1:<random>) is spawned and the real src/utils/api.js code
// is driven through the relay, covering the spec's "Ollama on loopback via
// proxy" scenarios plus article fetching and provider redirect refusal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PORT = 4000 + Math.floor(Math.random() * 1000);
const CUSTOM_RELAY = 'http://localhost:3000';

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

const {
  setProxyConfig, setProxyConfirmHandler, fetchProviderModels,
  queryAI, fetchSourceExcerpt, resetProxyConsent, resetRateLimiter,
  providerRouteFor
} = await import('../src/utils/api.js');

const mockCp = {
  provider: 'mock', model: 'test-model', connector: 'openai',
  endpoint: `http://127.0.0.1:${MOCK_PORT}/v1`,
  apiKey: 'test-key', allowPrivate: true, allowInsecureTransport: true, rpm: 0
};

const mockHits = async () => {
  const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/stats`);
  return (await r.json()).hits;
};
const mockReset = async () => {
  await fetch(`http://127.0.0.1:${MOCK_PORT}/stats/reset`);
};

before(async () => {
  const mockPath = path.join(HERE, 'mock-ollama.mjs');
  mock = spawn(process.execPath, [mockPath], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, MOCK_PORT: String(MOCK_PORT) } });
  for (let i = 0; i < 40; i++) {
    if (await reachable(`http://127.0.0.1:${MOCK_PORT}/`)) break;
    await sleep(100);
  }
  assert.ok(await reachable(`http://127.0.0.1:${MOCK_PORT}/`), 'mock server should start');
  setProxyConfirmHandler(() => true);
});

after(async () => {
  mock?.kill();
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