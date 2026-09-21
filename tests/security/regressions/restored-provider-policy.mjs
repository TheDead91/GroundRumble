// Restored-provider policy regression.
//
// Chain under test (rejected at the final transport boundary):
//   backup provider record
//     -> restore validation (validateProviders, shape/protocol only — unchanged)
//     -> disabled hydrated provider
//     -> model discovery / provider test / audit query
//     -> runtime endpoint policy (providerRouteFor → assertProviderEndpointAllowed)
//     -> transport boundary (global fetch)  ← forbidden properties are rejected here
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O, and no real credential/endpoint is used:
// every "attacker" host is a reserved example name and every secret is a literal
// sentinel.
//
// Run: node --test tests/security/regressions/restored-provider-policy.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProviders, normalizeProvider } from '../../../src/utils/provider-record.js';
import {
  providerRouteFor,
  assertProviderEndpointAllowed,
  fetchProviderModels,
  testProvider,
  queryModel,
} from '../../../src/utils/api/provider-client.js';

const SENTINEL_KEY = 'sk-VICTIM-SENTINEL';
const SENTINEL_QUERY = 'ROUTE_SENTINEL';

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

// The exact transform useBackupFlow.performBackupImport applies before saveVault:
// providers arrive disabled.
const asRestored = (p) => ({ ...p, enabled: false });

// A crafted record whose models endpoint carries a secret query parameter and
// whose chat endpoint behaves normally. `endpoint` stays clean so chat traffic
// is unambiguous; the secret rides on the models endpoint as crafted.
const craftedSecretQueryProvider = {
  id: 'cp_secret_query',
  name: 'Imported Provider',
  connector: 'openai',
  endpoint: 'https://attacker.example/v1',
  modelsEndpoint: `https://attacker.example/v1/models?api_key=${SENTINEL_QUERY}`,
  apiKey: SENTINEL_KEY,
  models: ['m1'],
  method: 'POST',
  headers: '{}',
  bodyTemplate: '',
  responsePath: 'choices.0.message.content'
};

// A crafted record whose chat endpoint itself carries the secret query, so the
// audit/target path — not just model discovery — must reject it.
const craftedEndpointSecretProvider = {
  ...craftedSecretQueryProvider,
  id: 'cp_endpoint_secret',
  endpoint: `https://attacker.example/v1?api_key=${SENTINEL_QUERY}`,
  modelsEndpoint: ''
};

// A crafted record whose chat endpoint embeds URL userinfo.
const craftedUserinfoProvider = {
  id: 'cp_userinfo',
  name: 'Imported Userinfo Provider',
  connector: 'openai',
  endpoint: 'https://user:pass@attacker.example/v1',
  modelsEndpoint: '',
  apiKey: SENTINEL_KEY,
  models: ['m1'],
  method: 'POST',
  headers: '{}',
  bodyTemplate: '',
  responsePath: 'choices.0.message.content'
};

test('restore validation still accepts shape-valid secret-query/userinfo records', () => {
  // Restore validation only enforces shape/protocol; the final transport is now
  // the authoritative policy boundary. This premise is intentionally unchanged.
  assert.doesNotThrow(() => validateProviders([craftedSecretQueryProvider]));
  assert.doesNotThrow(() => validateProviders([craftedEndpointSecretProvider]));
  assert.doesNotThrow(() => validateProviders([craftedUserinfoProvider]));

  // Contrast: the form/save-time assertion rejects them outright (as before).
  assert.throws(() => assertProviderEndpointAllowed(craftedSecretQueryProvider.modelsEndpoint, {}), /query string/);
  assert.throws(() => assertProviderEndpointAllowed(craftedEndpointSecretProvider.endpoint, {}), /query string/);
  assert.throws(() => assertProviderEndpointAllowed(craftedUserinfoProvider.endpoint, {}), /userinfo/);
});

test('the runtime route policy rejects the same secret-query/userinfo endpoints', () => {
  assert.throws(() => providerRouteFor(craftedSecretQueryProvider.modelsEndpoint, craftedSecretQueryProvider), /query string/);
  assert.throws(() => providerRouteFor(craftedEndpointSecretProvider.endpoint, craftedEndpointSecretProvider), /query string/);
  assert.throws(() => providerRouteFor(craftedUserinfoProvider.endpoint, craftedUserinfoProvider), /userinfo/);
});

test('model discovery rejects the secret-query models endpoint with zero transport', async () => {
  installStub();
  try {
    await assert.rejects(() => fetchProviderModels(craftedSecretQueryProvider, undefined), /query string/);
    assert.equal(calls.length, 0, 'no models request reached the transport');
  } finally {
    restoreStub();
  }
});

test('test connection never probes a forbidden endpoint', async () => {
  installStub();
  try {
    await assert.rejects(() => testProvider(craftedSecretQueryProvider, undefined), /query string/);
    await assert.rejects(() => testProvider(craftedEndpointSecretProvider, undefined), /query string/);
    assert.equal(calls.length, 0, 'no probe reached the transport');
  } finally {
    restoreStub();
  }
});

test('userinfo endpoint is rejected by policy before any transport attempt', async () => {
  installStub();
  try {
    assert.throws(() => providerRouteFor(craftedUserinfoProvider.endpoint, craftedUserinfoProvider), /userinfo/);
    await assert.rejects(() => fetchProviderModels(craftedUserinfoProvider, undefined), /userinfo/);
    assert.equal(calls.length, 0, 'the credentialed target was never handed to the transport');
  } finally {
    restoreStub();
  }
});

test('re-enabled restored provider is still rejected at the final transport boundary', async () => {
  const restored = asRestored(normalizeProvider(craftedEndpointSecretProvider, true));
  // A disabled provider is blocked from the audit path…
  await assert.rejects(() => queryModel(restored.id, 'm1', '', '', [restored], undefined), /Unknown provider/);

  installStub();
  try {
    // …and enabling it (a plain flag flip with no policy call) does not bypass
    // the final-transport policy: the chat endpoint's secret query is rejected.
    const enabled = { ...restored, enabled: true };
    await assert.rejects(() => queryModel(enabled.id, 'm1', 'sys', 'user', [enabled], undefined), /query string/);
    assert.equal(calls.length, 0, 'no chat request reached the transport');
  } finally {
    restoreStub();
  }
});