// Durable regression/security coverage for the canonical final-transport
// endpoint-security policy shared by the provider transport
// (providerFetch -> providerRouteFor) and the Judge/helper transport
// (queryAI -> queryOpenAIJudge/queryRawJudge).
//
// Invariant: every outbound provider/Judge target is classified by ONE
// primitive immediately before transport, regardless of whether the
// configuration came from form save, restore, hydration, legacy adoption,
// enable, or a raw/judge path.
//
// No external network traffic: the global fetch is replaced with an in-process
// deterministic stub. Every hostile host is a reserved example name or loopback
// literal; every secret is a literal sentinel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertProviderEndpointAllowed,
  providerRouteFor,
  fetchProviderModels,
  testProvider,
  queryModel,
  queryOpenAIProvider,
} from '../src/utils/api/provider-client.js';
import { queryAI } from '../src/utils/api/judge-client.js';
import { buildJudge } from '../src/utils/judge-config.js';
import { normalizeProvider, validateProviders } from '../src/utils/provider-record.js';
import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../src/utils/provider-endpoint-policy.js';
import { setProxyConfig, setProxyConfirmHandler, resetProxyConsent } from '../src/utils/api/proxy.js';
import { jsonRes, stubFetch } from './helpers/httpx.mjs';

const SENTINEL_KEY = 'sk-FINAL-TRANSPORT-SENTINEL';

let savedFetch;
const calls = [];

before(() => { savedFetch = globalThis.fetch; });
after(() => {
  globalThis.fetch = savedFetch;
  setProxyConfig({ enabled: false });
  setProxyConfirmHandler(null);
  resetProxyConsent();
});

// Deterministic transport stub that mirrors real browser behavior for
// credentialed URLs and records every issued request.
const installTransport = () => {
  calls.length = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      throw new TypeError(`Request cannot be constructed from a URL that includes credentials: ${url}`);
    }
    calls.push({ url, method: (init.method || 'GET'), headers: init.headers || {}, body: init.body });
    if (url.includes('/models')) return jsonRes({ data: [{ id: 'm1' }] });
    return jsonRes({ choices: [{ message: { content: 'ok' } }] });
  };
};

const asRestored = (p) => ({
  ...normalizeProvider(p, true),
  enabled: false,
  allowPrivate: p.allowPrivate === true && providerNeedsPrivateBypass(p),
  allowInsecureTransport: p.allowInsecureTransport === true && providerNeedsInsecureTransport(p),
});

const enableProxy = (categories) => {
  setProxyConfig({ enabled: true, baseUrl: 'https://relay.example/?u={url}', mode: 'fallback', categories });
  resetProxyConsent();
  setProxyConfirmHandler(async () => true);
};

// A provider record that ordinary restore validation accepts but whose endpoint
// is forbidden at final transport.
const secretQueryProvider = {
  id: 'cp_secret_query', name: 'Secret Query', connector: 'openai',
  endpoint: 'https://attacker.example/v1', modelsEndpoint: 'https://attacker.example/v1/models?api_key=SAST_SENTINEL',
  apiKey: SENTINEL_KEY, models: ['m1'], method: 'POST', headers: '{}', bodyTemplate: '', responsePath: 'choices.0.message.content',
};
const userinfoProvider = {
  id: 'cp_userinfo', name: 'Userinfo', connector: 'openai',
  endpoint: 'https://user:pass@attacker.example/v1', modelsEndpoint: '',
  apiKey: SENTINEL_KEY, models: ['m1'], method: 'POST', headers: '{}', bodyTemplate: '', responsePath: 'choices.0.message.content',
};
// Secret query on the chat endpoint itself (exercised by queryModel / A2 judge).
const secretQueryOnEndpointProvider = {
  ...secretQueryProvider,
  id: 'cp_secret_query_on_endpoint',
  endpoint: 'https://attacker.example/v1?api_key=SAST_SENTINEL',
  modelsEndpoint: '',
};

// ── canonical classification (shared primitive) ────────────────────────────

test('canonical policy: public HTTPS is allowed with no approval flags', () => {
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://api.example.com/v1'));
  assert.equal(providerRouteFor('https://api.example.com/v1').via, 'direct');
});

test('canonical policy: permitted private/insecure endpoints remain supported under approval flags', () => {
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://127.0.0.1:11434/v1', { allowPrivate: true }));
  assert.doesNotThrow(() => assertProviderEndpointAllowed('http://127.0.0.1:11434/v1', { allowPrivate: true }));
  assert.doesNotThrow(() => assertProviderEndpointAllowed('http://fast-relay.example/v1', { allowInsecureTransport: true }));
  assert.equal(providerRouteFor('http://fast-relay.example/v1', { allowInsecureTransport: true }).via, 'direct');
});

test('forbidden endpoint properties are rejected regardless of approval flags', () => {
  const approvals = { allowPrivate: true, allowInsecureTransport: true };
  assert.throws(() => assertProviderEndpointAllowed('https://user:pass@example.com/v1', approvals), /userinfo/);
  assert.throws(() => assertProviderEndpointAllowed('https://example.com/v1?api_key=x', approvals), /query string/);
  assert.throws(() => assertProviderEndpointAllowed('https://metadata.google.internal/v1', {}), /Private or loopback/);
  assert.throws(() => assertProviderEndpointAllowed('ftp://example.com/v1'), /HTTP or HTTPS/);
  assert.throws(() => assertProviderEndpointAllowed('not a url'), /valid URL/);
});

// ── direct / relay matrix ──────────────────────────────────────────────────

test('A1: secret-query and userinfo targets are rejected before direct dispatch', async () => {
  installTransport();
  try {
    assert.throws(() => providerRouteFor(secretQueryProvider.modelsEndpoint, secretQueryProvider), /query string/);
    assert.throws(() => providerRouteFor(userinfoProvider.endpoint, userinfoProvider), /userinfo/);
    await assert.rejects(() => fetchProviderModels(secretQueryProvider), /query string/);
    await assert.rejects(() => fetchProviderModels(userinfoProvider), /userinfo/);
    assert.equal(calls.length, 0, 'no request reached the transport for a forbidden target');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('A1: secret-query/userinfo targets are rejected before relay dispatch (no proxy bypass)', async () => {
  enableProxy({ privateNet: true, providers: true, articles: false });
  installTransport();
  try {
    // A private userinfo target with genuine private approval would otherwise be
    // relay-routable; the forbidden property must still win.
    const privateUserinfo = { ...userinfoProvider, endpoint: 'http://user:pass@127.0.0.1:11434/v1', allowPrivate: true };
    assert.throws(() => providerRouteFor(privateUserinfo.endpoint, privateUserinfo), /userinfo/);
    const secretQueryPrivate = {
      ...secretQueryProvider,
      endpoint: 'http://127.0.0.1:11434/v1',
      modelsEndpoint: 'http://127.0.0.1:11434/v1/models?api_key=SAST_SENTINEL',
      allowPrivate: true, allowInsecureTransport: true,
    };
    assert.throws(() => providerRouteFor(secretQueryPrivate.modelsEndpoint, secretQueryPrivate), /query string/);
    await assert.rejects(() => fetchProviderModels(secretQueryPrivate), /query string/);
    assert.equal(calls.length, 0, 'forbidden target was never sent to the relay');
  } finally {
    globalThis.fetch = savedFetch;
    setProxyConfig({ enabled: false });
  }
});

test('A1: special-use metadata target is rejected without private approval', async () => {
  installTransport();
  try {
    const provider = { ...secretQueryProvider, endpoint: 'https://metadata.google.internal/v1', modelsEndpoint: '' };
    assert.throws(() => providerRouteFor(provider.endpoint, provider), /Private or loopback/);
    await assert.rejects(() => fetchProviderModels(provider), /Private or loopback/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('A1: malformed and unsupported-scheme targets are rejected', () => {
  assert.throws(() => providerRouteFor('not a url at all'), /valid URL/);
  assert.throws(() => providerRouteFor('ws://example.com/v1'), /HTTP or HTTPS/);
});

// ── direct matrix (Judge/helper transport) ────────────────────────────────

test('A2: secret-query and userinfo Judge targets are rejected before dispatch', async () => {
  installTransport();
  try {
    const secretQueryJudge = buildJudge({ provider: secretQueryOnEndpointProvider.id, model: 'm1' }, [{ ...secretQueryOnEndpointProvider, enabled: true }]);
    assert.ok(secretQueryJudge.endpoint.includes('api_key=SAST_SENTINEL'));
    await assert.rejects(() => queryAI(secretQueryJudge, 'sys', 'usr', 128, undefined), /query string/);

    const userinfoJudge = buildJudge({ provider: userinfoProvider.id, model: 'm1' }, [{ ...userinfoProvider, enabled: true }]);
    await assert.rejects(() => queryAI(userinfoJudge, 'sys', 'usr', 128, undefined), /userinfo/);

    assert.equal(calls.length, 0, 'no Judge request reached the transport');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('A2: private and cleartext Judge targets are rejected without approval flags', async () => {
  installTransport();
  try {
    const privateProvider = { ...secretQueryProvider, id: 'cp_private', endpoint: 'http://127.0.0.1:11434/v1', modelsEndpoint: '' };
    const judge = buildJudge({ provider: privateProvider.id, model: 'm1' }, [{ ...privateProvider, enabled: true }]);
    assert.equal(judge.allowPrivate, false);
    await assert.rejects(() => queryAI(judge, 'sys', 'usr', 128, undefined), /Private or loopback/);

    const cleartextProvider = { ...secretQueryProvider, id: 'cp_cleartext', endpoint: 'http://attacker.example/v1', modelsEndpoint: '' };
    const cleartextJudge = buildJudge({ provider: cleartextProvider.id, model: 'm1' }, [{ ...cleartextProvider, enabled: true }]);
    await assert.rejects(() => queryAI(cleartextJudge, 'sys', 'usr', 128, undefined), /Insecure HTTP/);

    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('A2: permitted public HTTPS Judge transport stays allowed (no relay path, direct only)', async () => {
  enableProxy({ privateNet: true, providers: true, articles: true });
  installTransport();
  try {
    const provider = { ...secretQueryProvider, endpoint: 'https://judge.example/v1', modelsEndpoint: '' };
    const judge = buildJudge({ provider: provider.id, model: 'm1' }, [{ ...provider, enabled: true }]);
    const out = await queryAI(judge, 'sys', 'usr', 128, undefined);
    assert.equal(out, 'ok');
    assert.ok(calls.some((c) => c.url === judge.endpoint), 'judge request went direct');
    assert.ok(!calls.some((c) => c.url.startsWith('https://relay.example/')), 'judge transport never uses the configured relay');
  } finally {
    globalThis.fetch = savedFetch;
    setProxyConfig({ enabled: false });
  }
});

// ── restored/hydrated bypass regression ─────────────────────────────────────

test('restored state that bypasses form validation is still rejected at final transport (A1 + A2)', async () => {
  // Restore validation is shape/protocol only; it accepts forbidden endpoints.
  assert.doesNotThrow(() => validateProviders([secretQueryProvider]));
  assert.doesNotThrow(() => validateProviders([userinfoProvider]));

  const restoredSecret = { ...asRestored(secretQueryProvider), enabled: true };
  const restoredUserinfo = { ...asRestored(userinfoProvider), enabled: true };
  const restoredSecretOnEndpoint = { ...asRestored(secretQueryOnEndpointProvider), enabled: true };

  installTransport();
  try {
    assert.throws(() => providerRouteFor(restoredSecret.modelsEndpoint, restoredSecret), /query string/);
    assert.throws(() => providerRouteFor(restoredUserinfo.endpoint, restoredUserinfo), /userinfo/);
    await assert.rejects(() => fetchProviderModels(restoredSecret), /query string/);
    await assert.rejects(() => queryModel(restoredSecretOnEndpoint.id, 'm1', 's', 'u', [restoredSecretOnEndpoint]), /query string/);
    await assert.rejects(() => queryModel(restoredUserinfo.id, 'm1', 's', 'u', [restoredUserinfo]), /userinfo/);

    calls.length = 0;
    const judge = buildJudge({ provider: restoredSecretOnEndpoint.id, model: 'm1' }, [restoredSecretOnEndpoint]);
    await assert.rejects(() => queryAI(judge, 's', 'u', 128, undefined), /query string/);

    assert.equal(calls.length, 0, 'no secret-bearing request ever reached the transport');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

// ── credential non-delivery ─────────────────────────────────────────────────

test('forbidden targets never receive Authorization or custom secret-bearing headers', async () => {
  installTransport();
  try {
    const provider = { ...secretQueryOnEndpointProvider, headers: '{"X-Secret":"custom-secret-value"}' };
    await assert.rejects(() => fetchProviderModels(secretQueryProvider), /query string/);
    await assert.rejects(() => queryModel(provider.id, 'm1', 'sys', 'usr', [provider]), /query string/);
    assert.equal(calls.length, 0, 'the network boundary is never reached, so no header is projected');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

// ── keyless provider remains supported ─────────────────────────────────────

test('keyless providers remain usable and never invent an Authorization header', async () => {
  const seen = [];
  stubFetch([
    [(r) => r.url.includes('/models'), (req) => { seen.push(['models', { ...req.headers }]); return jsonRes({ data: [] }); }],
    [(r) => r.url.includes('/chat/completions'), (req) => { seen.push(['chat', { ...req.headers }]); return jsonRes({}, 200); }],
  ]);
  const r = await testProvider({ endpoint: 'https://local.example/v1', apiKey: '' });
  assert.equal(r.ok, true);
  for (const [, headers] of seen) assert.ok(!('Authorization' in headers));
});

// ── redirect cannot bypass the final policy ─────────────────────────────────

test('redirects from allowed endpoints are refused before sensitive delivery (A1 + A2)', async () => {
  stubFetch([[() => true, () => jsonRes({}, 302, { location: 'http://127.0.0.1:9999/steal' })]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://allowed.example/v1', apiKey: SENTINEL_KEY }, 'm', 's', 'u'),
    /refusing to follow redirects/
  );
  await assert.rejects(
    queryAI({ provider: 'mock', model: 'm', endpoint: 'https://allowed.example/v1/chat/completions', apiKey: SENTINEL_KEY }, 's', 'u', 300),
    /refusing to follow redirects/
  );
});

// ── raw provider + test/refresh paths share the boundary ───────────────────

test('A1 raw provider and connection probes share the same final-transport boundary', async () => {
  installTransport();
  try {
    const raw = { ...secretQueryProvider, connector: 'raw', endpoint: 'https://attacker.example/v1?api_key=SAST_SENTINEL', modelsEndpoint: '' };
    await assert.rejects(
      () => queryModel(raw.id, 'm1', 's', 'u', [raw], undefined, { bodyTemplate: '{"u":"{{userPrompt}}"}', responsePath: 'data.out' }),
      /query string/
    );
    await assert.rejects(() => testProvider({ ...secretQueryProvider, allowInsecureTransport: true }), /query string/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
  }
});