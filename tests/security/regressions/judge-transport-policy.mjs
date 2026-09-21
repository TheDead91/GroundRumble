// Judge transport-policy regression.
//
// The AI Judge/helper transport enforces the SAME canonical endpoint-security
// policy as the provider transport, immediately before dispatch. A restored
// provider record that the provider transport refuses is equally refused by the
// judge transport — no credential, custom header, or prompt reaches the
// transport.
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O. Every attacker host is a reserved
// example name or loopback literal, and every secret is a literal sentinel.
// No production file is modified.
//
// Run: node --test tests/security/regressions/judge-transport-policy.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../../../src/utils/provider-endpoint-policy.js';
import { normalizeProvider, validateProviders } from '../../../src/utils/provider-record.js';
import {
  providerRouteFor,
  assertProviderEndpointAllowed,
  fetchProviderModels,
  queryModel,
} from '../../../src/utils/api/provider-client.js';
import { buildJudge, pingModel } from '../../../src/utils/judge-config.js';
import { queryAI } from '../../../src/utils/api/judge-client.js';
import {
  setProxyConfig,
  setProxyConfirmHandler,
  resetProxyConsent,
} from '../../../src/utils/api/proxy.js';

const SENTINEL_KEY = 'sk-JUDGE-SENTINEL';
const SENTINEL_HEADER = 'HEADER-SENTINEL';
const SENTINEL_SYSTEM = 'SYSTEM-PROMPT-SENTINEL';
const SENTINEL_USER = 'USER-PROMPT-SENTINEL';

// --- deterministic transport stub -----------------------------------------

const calls = [];
let savedFetch = null;

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

const installStub = () => {
  calls.length = 0;
  if (savedFetch == null) savedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (url.includes('/models')) return jsonResponse({ data: [{ id: 'm1' }, { id: 'm2' }] });
    return jsonResponse({ choices: [{ message: { content: 'pong' } }] });
  };
};

const restoreStub = () => {
  if (savedFetch != null) { globalThis.fetch = savedFetch; savedFetch = null; }
};

// The exact transform useBackupFlow.performBackupImport applies before saveVault.
const asRestored = (p) => ({
  ...p,
  enabled: false,
  allowPrivate: p.allowPrivate === true && providerNeedsPrivateBypass(p),
  allowInsecureTransport: p.allowInsecureTransport === true && providerNeedsInsecureTransport(p)
});

const craftedPrivateProvider = {
  id: 'cp_private',
  name: 'Imported Private Provider',
  connector: 'openai',
  endpoint: 'http://127.0.0.1:11434/v1',
  modelsEndpoint: '',
  apiKey: SENTINEL_KEY,
  models: ['m1'],
  method: 'POST',
  headers: JSON.stringify({ 'X-SENTINEL': SENTINEL_HEADER }),
  bodyTemplate: '',
  responsePath: 'choices.0.message.content'
};

const craftedCleartextProvider = {
  id: 'cp_cleartext',
  name: 'Imported Cleartext Provider',
  connector: 'openai',
  endpoint: 'http://attacker.example/v1',
  modelsEndpoint: '',
  apiKey: SENTINEL_KEY,
  models: ['m1'],
  method: 'POST',
  headers: '{}',
  bodyTemplate: '',
  responsePath: 'choices.0.message.content'
};

const craftedUserinfoProvider = {
  id: 'cp_userinfo',
  name: 'Imported Userinfo Provider',
  connector: 'raw',
  endpoint: 'http://user:pass@127.0.0.1:11434/v1',
  modelsEndpoint: '',
  apiKey: SENTINEL_KEY,
  models: ['m1'],
  method: 'POST',
  headers: '{}',
  bodyTemplate: '{"model":"{{model}}","messages":[{"role":"user","content":"{{userPrompt}}"}]}',
  responsePath: 'choices.0.message.content'
};

test('restore produces an enabled-able private provider with allowPrivate=false', () => {
  assert.doesNotThrow(() => validateProviders([craftedPrivateProvider]));
  assert.doesNotThrow(() => validateProviders([craftedCleartextProvider]));
  assert.doesNotThrow(() => validateProviders([craftedUserinfoProvider]));

  const privateRestored = asRestored(normalizeProvider(craftedPrivateProvider, true));
  assert.equal(privateRestored.allowPrivate, false);
  assert.equal(privateRestored.enabled, false);

  assert.throws(() => assertProviderEndpointAllowed(privateRestored.endpoint, privateRestored), /Private or loopback/);
  assert.throws(() => assertProviderEndpointAllowed(craftedCleartextProvider.endpoint, craftedCleartextProvider), /Insecure HTTP/);
  assert.throws(() => assertProviderEndpointAllowed(craftedUserinfoProvider.endpoint, {}), /userinfo/);
});

test('judge transport refuses the private endpoint the provider transport refuses', async () => {
  const restored = asRestored(normalizeProvider(craftedPrivateProvider, true));
  const provider = { ...restored, enabled: true };

  assert.throws(() => providerRouteFor(provider.endpoint, provider), /Private or loopback/);

  installStub();
  try {
    await assert.rejects(() => fetchProviderModels(provider, undefined), /Private or loopback/);
    assert.equal(calls.length, 0);

    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    assert.ok(judge);
    assert.equal(judge.allowPrivate, false);

    await assert.rejects(() => queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined), /Private or loopback/);
    assert.equal(calls.length, 0, 'the judge request never reached the loopback transport');
  } finally {
    restoreStub();
  }
});

test('cleartext judge transport is refused like the provider transport', async () => {
  const restored = asRestored(normalizeProvider(craftedCleartextProvider, true));
  const provider = { ...restored, enabled: true };

  assert.throws(() => providerRouteFor(provider.endpoint, provider), /Insecure HTTP/);

  installStub();
  try {
    await assert.rejects(() => fetchProviderModels(provider, undefined), /Insecure HTTP/);
    assert.equal(calls.length, 0);

    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    await assert.rejects(() => queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined), /Insecure HTTP/);
    assert.equal(calls.length, 0, 'no cleartext judge request reached the transport');
  } finally {
    restoreStub();
  }
});

test('raw judge connector is refused for a private endpoint like queryRawProvider', async () => {
  const restored = asRestored(normalizeProvider(craftedUserinfoProvider, true));
  const provider = { ...restored, endpoint: 'http://127.0.0.1:11434/v1', enabled: true };

  assert.throws(() => providerRouteFor(provider.endpoint, provider), /Private or loopback/);

  installStub();
  try {
    await assert.rejects(
      () => queryModel(provider.id, 'm1', 'sys', 'user', [provider], undefined,
        { bodyTemplate: provider.bodyTemplate, method: provider.method, responsePath: provider.responsePath }),
      /Private or loopback/
    );
    assert.equal(calls.length, 0);

    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    assert.equal(judge.connector, 'raw');
    await assert.rejects(() => queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined), /Private or loopback/);
    assert.equal(calls.length, 0, 'raw judge request never reached the private endpoint');
  } finally {
    restoreStub();
  }
});

test('pingModel is policed via queryModel/providerRouteFor', async () => {
  const restored = asRestored(normalizeProvider(craftedPrivateProvider, true));
  const provider = { ...restored, enabled: true };

  installStub();
  try {
    await assert.rejects(() => pingModel({ provider: provider.id, model: 'm1' }, 'AI Judge', [provider]), /Private or loopback/);
    assert.equal(calls.length, 0);
  } finally {
    restoreStub();
  }
});

test('userinfo target is rejected before the relay can receive it', async () => {
  const relayUserinfoProvider = {
    ...craftedUserinfoProvider,
    connector: 'raw',
    endpoint: 'http://user:pass@127.0.0.1:11434/v1',
    bodyTemplate: craftedUserinfoProvider.bodyTemplate
  };
  const restored = asRestored(normalizeProvider(relayUserinfoProvider, true));
  const provider = { ...restored, allowPrivate: true, enabled: true };

  setProxyConfig({
    enabled: true,
    baseUrl: 'https://relay.example/?target=',
    mode: 'always',
    categories: { privateNet: true, providers: false, articles: false }
  });
  resetProxyConsent();
  setProxyConfirmHandler(async () => true);

  installStub();
  try {
    // The route policy now rejects the userinfo target before any relay routing.
    assert.throws(() => providerRouteFor(provider.endpoint, provider), /userinfo/);
    assert.equal(calls.length, 0, 'the relay never received the credentialed target');

    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    assert.ok(judge.endpoint.includes('user:pass@127.0.0.1'));
    await assert.rejects(() => queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined), /userinfo/);
    assert.equal(calls.length, 0, 'the judge transport delivered nothing for the userinfo target');
  } finally {
    restoreStub();
    setProxyConfirmHandler(null);
    resetProxyConsent();
    setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: {} });
  }
});

test('no proxy/relay route exists for the judge transport even when a relay is configured', async () => {
  const allowedProvider = { ...craftedPrivateProvider, endpoint: 'https://judge.example/v1', allowPrivate: true, allowInsecureTransport: true };
  const provider = { ...allowedProvider, enabled: true, allowPrivate: false, allowInsecureTransport: false };

  setProxyConfig({
    enabled: true,
    baseUrl: 'https://relay.example/?target=',
    mode: 'always',
    categories: { privateNet: true, providers: true, articles: true }
  });
  resetProxyConsent();
  setProxyConfirmHandler(async () => true);

  installStub();
  try {
    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    const out = await queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined);
    assert.equal(out, 'pong');
    assert.ok(calls.some((c) => c.url === judge.endpoint), 'judge request went direct');
    assert.ok(!calls.some((c) => c.url.startsWith('https://relay.example/')), 'judge transport never uses the configured relay');
  } finally {
    restoreStub();
    setProxyConfirmHandler(null);
    resetProxyConsent();
    setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: {} });
  }
});

test('a restored secret-query endpoint is rejected by the judge transport', async () => {
  const crafted = {
    ...craftedCleartextProvider,
    id: 'cp_secret_query',
    endpoint: 'https://attacker.example/v1?api_key=ROUTE_SENTINEL'
  };
  assert.doesNotThrow(() => validateProviders([crafted]));
  const provider = { ...asRestored(normalizeProvider(crafted, true)), enabled: true };

  assert.throws(() => assertProviderEndpointAllowed(provider.endpoint, provider), /query string/);
  assert.throws(() => providerRouteFor(provider.endpoint, provider), /query string/);

  installStub();
  try {
    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [provider]);
    assert.ok(judge.endpoint.includes('api_key=ROUTE_SENTINEL'));
    await assert.rejects(() => queryAI(judge, SENTINEL_SYSTEM, SENTINEL_USER, 128, undefined), /query string/);
    assert.equal(calls.length, 0, 'the secret-bearing judge endpoint never reached the transport');
  } finally {
    restoreStub();
  }
});