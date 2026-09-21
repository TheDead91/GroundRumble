// Durable behavior coverage for the production wiring: the real
// ProvidersProvider gates enable/probe/refresh on the central insecure-transport
// consent primitive, decline issues zero requests, accept authorizes the exact
// config, and an unchanged approved config does not re-prompt.
import './helpers/source-loader.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const db = installFakeIndexedDB();
installLocalStorage();

const { ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
const { saveVault } = await import('../src/utils/vault.js');
const {
  setInsecureTransportConfirmHandler,
  resetInsecureTransportApprovals,
  hasInsecureTransportApproval,
} = await import('../src/utils/insecure-transport-consent.js');

const provider = {
  id: 'cp_insecure', name: 'cleartext relay', connector: 'openai',
  endpoint: 'http://attacker.example/v1', modelsEndpoint: '',
  apiKey: 'sk-SAST-SENTINEL', models: ['m1'], method: 'POST',
  headers: '{}', bodyTemplate: '', responsePath: 'choices.0.message.content',
  enabled: false, allowInsecureTransport: true,
};

const modelsRes = () => new Response(JSON.stringify({ data: [{ id: 'm1' }] }), {
  status: 200, headers: { 'content-type': 'application/json' },
});

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function setup(t) {
  db.reset();
  resetInsecureTransportApprovals();
  await saveVault({ providers: [provider] });
  let current;
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method || 'GET' });
    return modelsRes();
  };
  t.after(() => { globalThis.fetch = realFetch; });

  function Probe() {
    const ctx = useProviders();
    useLayoutEffect(() => { current = ctx; });
    return null;
  }
  function Harness() {
    return React.createElement(ProvidersProvider, null, React.createElement(Probe));
  }
  await mountComponent(t, Harness);
  await flush();
  return { get current() { return current; }, requests };
}

beforeEach(() => {
  resetInsecureTransportApprovals();
  setInsecureTransportConfirmHandler(null);
});

test('refresh: decline on an unapproved insecure provider issues zero requests and stays disabled', async t => {
  let asked = null;
  setInsecureTransportConfirmHandler(async (msg) => { asked = msg; return false; });
  const f = await setup(t);
  const cp = f.current.providers.find(p => p.id === 'cp_insecure');
  await act(async () => { await f.current.refreshProviderModels(cp); });
  assert.equal(f.requests.length, 0, 'decline issues zero network requests');
  assert.ok(asked && asked.includes('http://attacker.example/v1'), 'consent names the endpoint');
  assert.equal(f.current.providers.find(p => p.id === 'cp_insecure').enabled, false, 'decline leaves it disabled');
});

test('refresh: accept authorizes the exact config and enables; unchanged use does not re-prompt', async t => {
  let prompts = 0;
  setInsecureTransportConfirmHandler(async () => { prompts += 1; return true; });
  const f = await setup(t);
  const cp = f.current.providers.find(p => p.id === 'cp_insecure');
  await act(async () => { await f.current.refreshProviderModels(cp); });
  assert.equal(f.requests.length, 1, 'accept issues the models request');
  assert.equal(prompts, 1, 'exactly one prompt');
  assert.equal(f.current.providers.find(p => p.id === 'cp_insecure').enabled, true, 'refresh auto-enables after approval');
  assert.equal(hasInsecureTransportApproval(cp), true, 'approval recorded for the exact config');

  // Unchanged config → ordinary repeated refresh must not re-prompt.
  await act(async () => { await f.current.refreshProviderModels(cp); });
  assert.equal(prompts, 1, 'no re-prompt for the unchanged approved config');
});

test('probe: a declined saved-provider test issues zero requests', async t => {
  setInsecureTransportConfirmHandler(async () => false);
  const f = await setup(t);
  const cp = f.current.providers.find(p => p.id === 'cp_insecure');
  await act(async () => { await f.current.handleProviderTest(cp, cp.id); });
  assert.equal(f.requests.length, 0, 'declined probe issues zero requests');
  assert.equal(f.current.providers.find(p => p.id === 'cp_insecure').enabled, false, 'declined probe never enables');
});

test('probe: a draft form test is governed by the form, not the consent gate', async t => {
  let prompts = 0;
  setInsecureTransportConfirmHandler(async () => { prompts += 1; return true; });
  const f = await setup(t);
  const draft = { ...provider, id: 'draft' };
  await act(async () => {
    try { await f.current.handleProviderTest(draft, 'draft'); } catch { /* network stub — the gate is what matters */ }
  });
  assert.equal(prompts, 0, 'the draft form test is not consent-gated');
});
