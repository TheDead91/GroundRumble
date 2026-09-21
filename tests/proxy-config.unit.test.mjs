// Coverage of the unified proxy configuration (src/utils/api.js): the config
// shape, the shouldUseProxy routing decision per traffic category, and provider
// routing through the relay with consent and redirect-refusal flags.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { jsonRes, stubFetch } from './helpers/httpx.mjs';

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

const {
  setProxyConfig, setProxyConfirmHandler, shouldUseProxy,
  providerRouteFor, fetchProviderModels, resetProxyConsent
} = await import('../src/utils/api.js');

const PROXY = 'http://proxy.example/';
const reset = () => setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: false, articles: false } });
const enable = (categories) => setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories });

// ── config shape ───────────────────────────────────────────────────────────

test('setProxyConfig accepts the new shape and preserves per-category flags', () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: true, providers: false, articles: true } });
  assert.equal(shouldUseProxy('http://10.0.0.1/x', 'privateNet'), true);
  assert.equal(shouldUseProxy('https://example.com/a', 'articles', null, true), true);
  assert.equal(shouldUseProxy('https://example.com/v1', 'providers', { endpoint: 'https://example.com/v1', allowPrivate: true }), false);
  reset();
});

// ── shouldUseProxy per category ────────────────────────────────────────────

test('privateNet category only routes special-use addresses and hostnames', () => {
  enable({ privateNet: true, providers: false, articles: false });
  for (const u of [
    'http://10.0.0.1/x', 'http://192.168.1.100:11434/', 'http://172.16.0.5/',
    'http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/',
    'http://[fc00::1]/', 'http://[fe80::1]/', 'http://ollama.local:11434', 'http://router.lan',
    'https://ollama.internal'
  ]) {
    assert.equal(shouldUseProxy(u, 'privateNet'), true, u);
  }
  for (const u of ['https://example.com/', 'https://93.184.216.34/', 'https://[2606:4700:4700::1111]/']) {
    assert.equal(shouldUseProxy(u, 'privateNet'), false, u);
  }
  reset();
});

test('providers category respects per-provider allowPrivate and insecure-transport flags', () => {
  enable({ privateNet: false, providers: true, articles: false });
  // allowPrivate or a cleartext http endpoint opt the endpoint into the relay.
  assert.equal(shouldUseProxy('https://proxy-llm.example/v1', 'providers', { endpoint: 'https://proxy-llm.example/v1', allowPrivate: true }), true);
  assert.equal(shouldUseProxy('http://192.168.1.100:11434/v1', 'providers', { endpoint: 'http://192.168.1.100:11434/v1' }), true);
  // A plain public https provider without allowPrivate stays direct.
  assert.equal(shouldUseProxy('https://api.example.com/v1', 'providers', { endpoint: 'https://api.example.com/v1' }), false);
  assert.equal(shouldUseProxy('https://api.example.com/v1', 'providers', null), false);
  // The per-provider flag cannot be bypassed by the proxy being on.
  assert.equal(shouldUseProxy('http://192.168.1.100:11434/v1', 'providers', { endpoint: 'http://192.168.1.100:11434/v1', allowPrivate: false, allowInsecureTransport: false }), true);
  reset();
});

test('articles category honors the fallback vs always mode', () => {
  setProxyConfig({ enabled: true, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: false, articles: true } });
  assert.equal(shouldUseProxy('https://example.com/a', 'articles', null, false), false, 'fallback + direct ok → direct');
  assert.equal(shouldUseProxy('https://example.com/a', 'articles', null, true), true, 'fallback + direct blocked → proxy');
  setProxyConfig({ enabled: true, baseUrl: '', mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  assert.equal(shouldUseProxy('https://example.com/a', 'articles', null, false), true, 'always mode → proxy');
  reset();
});

test('proxy disabled blocks everything regardless of categories', () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'always', categories: { privateNet: true, providers: true, articles: true } });
  assert.equal(shouldUseProxy('http://127.0.0.1/x', 'privateNet'), false);
  assert.equal(shouldUseProxy('https://x.example/v1', 'providers', { endpoint: 'https://x.example/v1', allowPrivate: true }), false);
  assert.equal(shouldUseProxy('https://example.com/a', 'articles', null, true), false);
});

// ── provider routing + consent + redirect-refusal flags ────────────────────

test('providerRouteFor routes via the proxy when the providers category is opted in', () => {
  enable({ privateNet: false, providers: true, articles: false });
  const viaProxy = providerRouteFor('https://proxy-llm.example/v1', { endpoint: 'https://proxy-llm.example/v1', allowPrivate: true });
  assert.equal(viaProxy.via, 'proxy');
  // Still enforces the per-provider approval gate first.
  assert.throws(() => providerRouteFor('https://localhost:11434'), /explicit approval/);
  reset();
  // Default config (no categories) routes directly and keeps existing behavior.
  assert.equal(providerRouteFor('https://example.com/v1').via, 'direct');
  assert.equal(providerRouteFor('https://localhost:11434', { allowPrivate: true }).via, 'direct');
});

test('providerRouteFor routes private endpoints via the proxy when privateNet is opted in', () => {
  enable({ privateNet: true, providers: false, articles: false });
  const viaProxy = providerRouteFor('https://192.168.1.100:11434', { endpoint: 'https://192.168.1.100:11434', allowPrivate: true });
  assert.equal(viaProxy.via, 'proxy');
  reset();
});

test('provider model fetches through the proxy use the noredirect flag, consent once per session', async () => {
  resetProxyConsent();
  enable({ privateNet: false, providers: true, articles: false });
  let asked = 0;
  setProxyConfirmHandler(() => { asked++; return true; });
  const calls = [];
  stubFetch([[
    (r) => { calls.push(r); return true; },
    () => jsonRes({ data: [{ id: 'model-a' }] })
  ]]);
  const cp = { endpoint: 'https://proxy-llm.example/v1', connector: 'openai', allowPrivate: true, apiKey: 'secret-key' };
  const models = await fetchProviderModels(cp);
  assert.deepEqual(models, ['model-a']);
  assert.equal(asked, 1, 'consent is requested for the session');
  assert.ok(calls[0].url.includes('groundrumble_noredirect=1'), 'provider proxy URL carries the noredirect flag');
  // Second call in the same session: no consent prompt again.
  const again = await fetchProviderModels(cp);
  assert.deepEqual(again, ['model-a']);
  assert.equal(asked, 1, 'consent remembered for the session');
  assert.equal(calls.length, 2);
  setProxyConfirmHandler(null);
  reset();
});

test('provider model fetches route private endpoints with the allow_private flag', async () => {
  resetProxyConsent();
  enable({ privateNet: false, providers: true, articles: false });
  setProxyConfirmHandler(() => true);
  const calls = [];
  stubFetch([[
    (r) => { calls.push(r); return true; },
    () => jsonRes({ data: [{ id: 'm' }] })
  ]]);
  await fetchProviderModels({ endpoint: 'http://192.168.1.100:11434/v1', connector: 'openai', allowPrivate: true, allowInsecureTransport: true });
  assert.ok(calls[0].url.includes('groundrumble_allow_private=1'), 'private target carries the allow_private flag');
  setProxyConfirmHandler(null);
  reset();
});

test('declining consent for a provider proxy falls back to the direct request', async () => {
  resetProxyConsent();
  enable({ privateNet: false, providers: true, articles: false });
  setProxyConfirmHandler(() => false);
  const calls = [];
  stubFetch([[
    (r) => { calls.push(r.url); return true; },
    () => jsonRes({ data: [{ id: 'direct-model' }] })
  ]]);
  const models = await fetchProviderModels({ endpoint: 'https://proxy-llm.example/v1', connector: 'openai', allowPrivate: true });
  assert.deepEqual(models, ['direct-model']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://proxy-llm.example/'), 'declined consent → direct fetch, not the proxy');
  setProxyConfirmHandler(null);
  reset();
});