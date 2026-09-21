import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent, deferred } from './helpers/react-harness.mjs';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';
const db = installFakeIndexedDB();
const { ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
const { loadVault, saveVault, lockVault } = await import('../src/utils/vault.js');
const cp = { id: 'public', name: 'Public', connector: 'openai', endpoint: 'https://provider.example/v1', models: ['manual'], apiKey: 'test-key' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function setup(t, providers = [cp], failHydration = false) {
  db.reset();
  lockVault();
  installLocalStorage();
  await loadVault();
  await saveVault({ providers });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});
  const warnings = t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  let state;
  function Probe() { const value = useProviders(); useLayoutEffect(() => { state = value; }); return null; }
  function Harness() { return React.createElement(ProvidersProvider, null, React.createElement(Probe)); }
  if (failHydration) db.failNextOp(new Error('vault hydration unavailable'));
  const view = await mountComponent(t, Harness);
  assert.equal(state.vaultLoading, false);
  return { ...view, get state() { return state; }, warnings };
}

test('provider hydration failure ends the loading state and reports the storage error', async t => {
  const f = await setup(t, [cp], true);
  assert.equal(f.state.vaultLoading, false);
  assert.deepEqual(f.state.providers, []);
  assert.ok(f.warnings.mock.calls.some(call => call.arguments[0] === 'Vault load failed:'));
  assert.equal((await loadVault()).providers[0].id, cp.id, 'a failed hydration does not erase the stored vault');
});

test('shared target labels identify live, sandbox and removed-provider models', async t => {
  const f = await setup(t);
  assert.equal(f.state.modelTargetLabel('public', 'manual'), 'Public / manual');
  assert.match(f.state.modelTargetLabel(f.state.SANDBOX_PROVIDER_ID, 'Demo Secure'), /^Sandbox .* \/ Demo Secure$/);
  await act(async () => f.state.deleteProvider('public'));
  assert.equal(f.state.modelTargetLabel('public', 'manual'), 'public / manual');
  assert.equal(f.state.modelTargetLabel('unknown', 'other'), 'unknown / other');
});

test('provider editing validates incomplete fields, preserves rejected drafts, and persists a corrected edit', async t => {
  const f = await setup(t);
  await act(async () => f.state.openProviderDraft(f.state.providers[0]));
  for (const [key, value, message] of [
    ['name', '', /name is required/], ['endpoint', 'ftp://host/', /valid endpoint URL/],
    ['headers', '[]', /valid JSON object/], ['headers', '{broken', /valid JSON object/],
    ['modelsEndpoint', 'http://remote.example/models', /HTTP|insecure/i],
  ]) {
    const before = f.state.providerDraft[key];
    await act(async () => f.state.handleProviderDraftChange(key, value));
    await act(async () => assert.rejects(f.state.saveProviderDraft({ preventDefault() {} }), message));
    assert.equal(f.state.providerDraft[key], value);
    assert.equal((await loadVault()).providers[0].name, 'Public');
    await act(async () => f.state.handleProviderDraftChange(key, before));
  }
  await act(async () => {
    f.state.handleProviderDraftChange('name', 'Edited');
    f.state.handleProviderDraftChange('modelsText', 'manual, second');
  });
  await act(async () => f.state.saveProviderDraft({ preventDefault() {} }));
  assert.equal(f.state.providerDraft, null);
  assert.equal(f.state.providers.length, 1);
  assert.equal(f.state.providers[0].id, cp.id);
  assert.deepEqual((await loadVault()).providers[0].models, ['manual', 'second']);
});

test('provider drafts reject duplicate names and missing raw templates before persistence', async t => {
  const f = await setup(t);
  await act(async () => f.state.openProviderDraft());
  await act(async () => f.state.handleProviderDraftChange('name', ' public '));
  await act(async () => assert.rejects(f.state.saveProviderDraft({ preventDefault() {} }), /already exists/));
  await act(async () => {
    f.state.handleProviderDraftChange('name', 'Raw');
    f.state.handleProviderDraftChange('endpoint', 'https://raw.example/chat');
    f.state.handleProviderDraftChange('connector', 'raw');
  });
  await act(async () => assert.rejects(f.state.saveProviderDraft({ preventDefault() {} }), /Body Template is required/));
  assert.equal((await loadVault()).providers.length, 1);
});

test('a pending encrypted provider edit leaves the displayed list and draft uncommitted', async t => {
  const f = await setup(t);
  await act(async () => f.state.protectVault('long test passphrase'));
  await act(async () => f.state.openProviderDraft(f.state.providers[0]));
  await act(async () => f.state.handleProviderDraftChange('name', 'Committed after storage'));
  const started = deferred(), release = deferred();
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'encrypt', async (...args) => {
    const encrypted = await encrypt(...args);
    started.resolve();
    await release.promise;
    return encrypted;
  });
  let saving;
  await act(async () => { saving = f.state.saveProviderDraft({ preventDefault() {} }); await started.promise; });
  assert.equal(f.state.providers[0].name, 'Public');
  assert.equal(f.state.providerDraft.name, 'Committed after storage');
  assert.equal((await loadVault()).providers[0].name, 'Public');
  await act(async () => { release.resolve(); await saving; });
  assert.equal(f.state.providers[0].name, 'Committed after storage');
  assert.equal(f.state.providerDraft, null);
  assert.equal((await loadVault()).providers[0].name, 'Committed after storage');
});

test('model refresh reports failure, recovers with replacement models and re-enables reviewed imports', async t => {
  const f = await setup(t, [{ ...cp, enabled: false }]);
  t.mock.method(globalThis, 'fetch', async () => json({ error: { message: 'catalog unavailable' } }, 403));
  await act(async () => f.state.refreshProviderModels(f.state.providers[0]));
  assert.match(f.state.providerModelErrors.public, /403/);
  assert.deepEqual(f.state.providerRefreshing, {});
  assert.equal(f.state.providers[0].enabled, false);
  t.mock.method(globalThis, 'fetch', async () => json({ data: [{ id: 'fresh' }] }));
  await act(async () => f.state.refreshProviderModels(f.state.providers[0]));
  assert.deepEqual(f.state.providers[0].models, ['fresh']);
  assert.equal(f.state.providers[0].enabled, true);
  assert.equal(f.state.providerModelErrors.public, undefined);
  assert.deepEqual(f.state.providerRefreshing, {});
  assert.deepEqual((await loadVault()).providers[0].models, ['fresh']);
});

test('invalidating a pending model refresh aborts transport and discards a late response', async t => {
  const f = await setup(t);
  const started = deferred(), response = deferred();
  let signal, pending;
  t.mock.method(globalThis, 'fetch', (_url, init) => { signal = init.signal; started.resolve(); return response.promise; });
  await act(async () => { pending = f.state.refreshProviderModels(f.state.providers[0]); await started.promise; });
  assert.equal(f.state.providerRefreshing.public, true);
  await act(async () => f.state.invalidateProviderModelFetches());
  assert.equal(signal.aborted, true);
  await act(async () => { response.resolve(json({ data: [{ id: 'stale' }] })); await pending; });
  assert.deepEqual(f.state.providers[0].models, ['manual']);
  assert.deepEqual(f.state.providerModelErrors, {});
  assert.deepEqual(f.state.providerRefreshing, {});
});

test('automatic model sync keeps manual models, handles empty catalogs and recovers from failures', async t => {
  const f = await setup(t);
  t.mock.method(globalThis, 'fetch', async () => json({}, 403));
  await act(async () => f.state.syncProviderModels(cp));
  assert.match(f.state.providerModelErrors.public, /403/);
  assert.equal(f.state.providerModelFetching, false);
  t.mock.method(globalThis, 'fetch', async () => json({ data: [] }));
  await act(async () => f.state.syncProviderModels(cp));
  assert.deepEqual(f.state.providers[0].models, ['manual']);
  t.mock.method(globalThis, 'fetch', async () => json({ data: [{ id: 'new' }, { id: 'manual' }] }));
  await act(async () => f.state.syncProviderModels(cp));
  assert.deepEqual(f.state.providers[0].models, ['new', 'manual']);
  assert.equal(f.state.providerModelErrors.public, undefined);
});

test('saved-provider connection failures recover through the public id-based test action', async t => {
  const f = await setup(t, [{ ...cp, enabled: false }]);
  t.mock.method(globalThis, 'fetch', async () => json({}, 401));
  await act(async () => f.state.handleProviderTest(cp.id));
  assert.equal(f.state.providerTest.public.status, 'error');
  assert.equal(f.state.providers[0].enabled, false);
  t.mock.method(globalThis, 'fetch', async url => String(url).endsWith('/models') ? json({ data: [{ id: 'reviewed' }] }) : json({ choices: [{ message: { content: 'OK' } }] }));
  await act(async () => f.state.handleProviderTest(cp.id));
  assert.equal(f.state.providerTest.public.status, 'ok');
  assert.match(f.state.providerTest.public.message, /verified/);
  assert.equal(f.state.providers[0].enabled, true);
  assert.deepEqual((await loadVault()).providers[0].models, ['reviewed']);
});

test('vault protection failure is recoverable and failed unlock preserves the locked state', async t => {
  const f = await setup(t);
  let result;
  await act(async () => { result = await f.state.protectVault('short'); });
  assert.equal(result, false);
  assert.equal(f.state.vaultPassphraseSet, false);
  await act(async () => { result = await f.state.protectVault('long test passphrase'); });
  assert.equal(result, true);
  await act(async () => f.state.lockVault());
  assert.equal(f.state.vaultLocked, true);
  assert.deepEqual(f.state.providers, []);
  await act(async () => { result = await f.state.handleUnlockVault('wrong passphrase'); });
  assert.equal(result.success, false);
  assert.equal(f.state.vaultLocked, true);
  await act(async () => { result = await f.state.handleUnlockVault('long test passphrase'); });
  assert.equal(result.success, true);
  assert.equal(f.state.vaultLocked, false);
  assert.equal(f.state.providers[0].id, cp.id);
  await act(async () => f.state.unprotectVault());
  assert.equal(f.state.vaultPassphraseSet, false);
  assert.equal((await loadVault()).kind, 'plain');
});

test('a failed vault write is reported and a subsequent provider save recovers', async t => {
  const f = await setup(t);
  db.failNextOp(new Error('storage full'));
  await act(async () => f.state.persistProviders([{ ...cp, name: 'Retry me' }]));
  assert.ok(f.warnings.mock.calls.some(call => call.arguments[0] === 'Vault save failed'));
  assert.equal((await loadVault()).providers[0].name, 'Public');
  await act(async () => f.state.persistProviders(f.state.providers));
  assert.equal((await loadVault()).providers[0].name, 'Retry me');
});
