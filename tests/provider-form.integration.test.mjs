import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent, click, button, fill, deferred } from './helpers/react-harness.mjs';
import { installFakeIndexedDB } from './helpers/dom.mjs';
const db = installFakeIndexedDB();
const { ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
const { SettingsContext } = await import('../src/context/SettingsContext.jsx');
const { ProvidersCard } = await import('../src/components/views/settings/ProvidersCard.jsx');
const { loadVault } = await import('../src/utils/vault.js');

async function choose(element, value) {
  await act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

async function setup(t, { choice = 'secondary', passwords = [], confirms = [] } = {}) {
  db.reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const toasts = [], questions = [], confirmMessages = [];
  let state;
  function Content() {
    const providers = useProviders();
    const [useDemoMode, setDemoMode] = useState(false);
    useLayoutEffect(() => { state = { ...providers, useDemoMode }; });
    return React.createElement(ProvidersCard, { ...providers, collapsedSettings: {}, useDemoMode, setDemoMode,
      addToast: message => toasts.push(message), askChoice: async () => choice,
      askConfirm: async (message) => { confirmMessages.push(message); return confirms.shift() ?? true; },
      askInput: async message => { questions.push(message); return passwords.shift(); } });
  }
  function Harness({ session } = {}) {
    return React.createElement(SettingsContext.Provider, { value: { collapsedSettings: {}, toggleSettingsCard() {} } },
      React.createElement(ProvidersProvider, { key: session }, React.createElement(Content)));
  }
  const view = await mountComponent(t, Harness);
  return { ...view, get state() { return state; }, toasts, questions, confirmMessages };
}

async function rawDraft(f) {
  await click(button(f.container, 'Add Provider'));
  await fill(f.container.querySelector('[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]'), 'Raw provider');
  await choose(f.container.querySelector('select'), 'raw');
  await fill(f.container.querySelector('[placeholder="https://host.example/api/chat"]'), 'https://raw.example/chat');
  await fill(f.container.querySelectorAll('textarea')[1], '{"prompt":"{{userPrompt}}"}');
}

test('invalid provider saves show validation, retain edits, and handle rejection at the UI boundary', async t => {
  const f = await setup(t);
  await click(button(f.container, 'Add Provider'));
  await click(button(f.container, 'Save Provider'));
  assert.match(f.toasts.at(-1), /Provider name is required/);
  assert.ok(f.state.providerDraft);
  await fill(f.container.querySelector('[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]'), 'Retry provider');
  await click(button(f.container, 'Save Provider'));
  assert.match(f.toasts.at(-1), /valid endpoint URL/);
  assert.equal(f.state.providerDraft.name, 'Retry provider');
  assert.deepEqual(f.state.providers, []);
  assert.deepEqual((await loadVault()).providers, []);
});

test('failed draft persistence is not committed or fetched; retry survives remount', async t => {
  const f = await setup(t);
  await rawDraft(f);
  await click(button(f.container, 'Save Provider'));
  const previous = f.state.providers;
  await click(button(f.container, 'Add Provider'));
  await fill(f.container.querySelector('[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]'), 'Second provider');
  await fill(f.container.querySelector('[placeholder="https://api.openai.com/v1/chat/completions"]'), 'https://provider.example/v1');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data: [{ id: 'fresh-model' }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  db.failNextOp(new Error('IndexedDB quota exceeded'));
  await click(button(f.container, 'Save Provider'));
  assert.deepEqual(f.state.providers, previous);
  assert.equal(f.state.providerDraft.name, 'Second provider');
  assert.match(f.toasts.at(-1), /Could not save provider.*quota exceeded/);
  await act(async () => t.mock.timers.tick(0));
  assert.deepEqual(calls, [], 'failed persistence must not schedule model fetching');
  assert.deepEqual((await loadVault()).providers.map(p => p.name), ['Raw provider']);
  await click(button(f.container, 'Save Provider'));
  assert.equal(f.state.providerDraft, null);
  assert.deepEqual(f.state.providers.map(p => p.name), ['Raw provider', 'Second provider']);
  assert.deepEqual((await loadVault()).providers.map(p => p.name), ['Raw provider', 'Second provider']);
  await act(async () => t.mock.timers.tick(0));
  assert.deepEqual(calls, ['https://provider.example/v1/models']);
  await f.render({ session: 1 });
  assert.match(f.container.textContent, /Second provider/);
  assert.equal(f.state.providers[1].models[0], 'fresh-model');
});

test('draft and saved-row connection failures keep feedback and can retry without unhandled rejections', async t => {
  const f = await setup(t);
  await rawDraft(f);
  let fail = true;
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(fail ? { error: { message: 'Key expired' } } : { choices: [{ message: { content: 'OK' } }] }), {
    status: fail ? 401 : 200, headers: { 'Content-Type': 'application/json' },
  }));
  await click(button(f.container, 'Test Connection'));
  assert.equal(f.state.providerTest.draft.status, 'error');
  assert.match(f.container.textContent, /Authentication failed|401/);
  assert.match(f.toasts.at(-1), /Could not test provider/);
  assert.equal(f.state.providerDraft.name, 'Raw provider');
  fail = false;
  await click(button(f.container, 'Test Connection'));
  assert.equal(f.state.providerTest.draft.status, 'ok');
  await click(button(f.container, 'Save Provider'));
  fail = true;
  await click(f.container.querySelector('[title="Test connection (reachability, auth, chat round-trip)"]'));
  const id = f.state.providers[0].id;
  assert.equal(f.state.providerTest[id].status, 'error');
  assert.match(f.container.textContent, /Authentication failed|401/);
  fail = false;
  await click(f.container.querySelector('[title="Test connection (reachability, auth, chat round-trip)"]'));
  assert.equal(f.state.providerTest[id].status, 'ok');
});

test('raw provider form persists method, headers, body, response path, rate limit and model list without dropping edits', async t => {
  const f = await setup(t);
  await rawDraft(f);
  await choose(f.container.querySelectorAll('select')[1], 'PUT');
  await fill(f.container.querySelector('[placeholder="choices.0.message.content"]'), 'output.text');
  await fill(f.container.querySelector('textarea'), '{"X-Route":"test"}');
  await fill(f.container.querySelector('[placeholder="0 = unlimited"]'), '12');
  await fill(f.container.querySelector('[placeholder="e.g. gpt-4o, gpt-4o-mini (blank = type any model)"]'), ' alpha, beta ');
  await fill(f.container.querySelector('[placeholder="Anything worth remembering about this provider"]'), 'Requires custom path');
  await click(button(f.container, 'Save Provider'));
  assert.equal(f.state.providerDraft, null);
  const saved = f.state.providers[0];
  assert.equal(saved.name, 'Raw provider');
  assert.equal(saved.method, 'PUT');
  assert.equal(saved.connector, 'raw');
  assert.equal(saved.headers, '{"X-Route":"test"}');
  assert.equal(saved.responsePath, 'output.text');
  assert.equal(saved.bodyTemplate, '{"prompt":"{{userPrompt}}"}');
  assert.equal(saved.rpm, 12);
  assert.deepEqual(saved.models, ['alpha', 'beta']);
  assert.equal(saved.notes, 'Requires custom path');
  assert.equal((await loadVault()).providers[0].id, saved.id);
  await click(f.container.querySelector('[data-tip="Edit"]'));
  assert.equal(f.container.querySelector('textarea').value, saved.headers);
  await click(button(f.container, 'Cancel'));
  assert.equal(f.state.providerDraft, null);
  await click(f.container.querySelector('[data-tour="sandbox-toggle"] input'));
  assert.equal(f.state.useDemoMode, true);
  await click(f.container.querySelector('[data-tip="Delete"]'));
  assert.match(f.confirmMessages.at(-1), /Delete provider\?/, 'deletion asks for explicit confirmation first');
  assert.deepEqual(f.state.providers, []);
  assert.deepEqual((await loadVault()).providers, []);
});

test('provider presets clear stale probe status while preserving the typed API key', async t => {
  const f = await setup(t);
  await click(button(f.container, 'Add Provider'));
  await fill(f.container.querySelector('input[type="password"]'), 'test credential');
  await act(async () => f.state.setProviderTest({ draft: { status: 'error', message: 'Old failure' }, saved: { status: 'ok', message: 'Keep this' } }));
  await click(button(f.container, 'OpenRouter'));
  assert.match(f.state.providerDraft.endpoint, /openrouter/);
  assert.equal(f.state.providerDraft.apiKey, 'test credential');
  assert.equal(f.state.providerTest.draft, undefined);
  assert.equal(f.state.providerTest.saved.message, 'Keep this');
  await fill(f.container.querySelector('[placeholder="e.g. https://api.openai.com/v1/models"]'), 'https://different.example/models');
  assert.match(f.container.textContent, /API key is also sent to this models endpoint/);
  await fill(f.container.querySelector('[placeholder="https://api.openai.com/v1/chat/completions"]'), 'http://remote.example/v1');
  assert.match(f.container.textContent, /transmitted unencrypted/);
  await click(f.container.querySelector('[data-testid="provider-allow-insecure-transport"]'));
  assert.equal(f.state.providerDraft.allowInsecureTransport, true);
  assert.equal(f.state.providerDraft.allowPrivate, false, 'HTTP approval must not implicitly grant private-network permission');
  await click(f.container.querySelector('form button'));
  assert.equal(f.state.providerDraft, null);
});

test('unencrypted provider save cancellation preserves the draft and writes no credentials', async t => {
  const f = await setup(t, { choice: 'cancel' });
  await rawDraft(f);
  await fill(f.container.querySelector('input[type="password"]'), 'credential');
  await click(button(f.container, 'Save Provider'));
  assert.equal(f.state.providerDraft.apiKey, 'credential');
  assert.deepEqual(f.state.providers, []);
  assert.deepEqual((await loadVault()).providers, []);
});

test('cancelling passphrase setup retains the credential draft without saving it', async t => {
  const f = await setup(t, { choice: 'primary', passwords: [null] });
  await rawDraft(f);
  await fill(f.container.querySelector('input[type="password"]'), 'credential');
  await click(button(f.container, 'Save Provider'));
  assert.equal(f.state.providerDraft.apiKey, 'credential');
  assert.deepEqual((await loadVault()).providers, []);
  assert.equal(f.state.vaultPassphraseSet, false);
});

test('vault protection storage failure leaves the draft available for retry', async t => {
  const f = await setup(t, { choice: 'primary', passwords: ['long vault passphrase', 'long vault passphrase'] });
  await rawDraft(f);
  await fill(f.container.querySelector('input[type="password"]'), 'credential');
  const reported = deferred(), recovered = deferred();
  let encryptedWrites = 0;
  const originalEncrypt = globalThis.crypto.subtle.encrypt.bind(globalThis.crypto.subtle);
  t.mock.method(globalThis.crypto.subtle, 'encrypt', async (...args) => {
    const value = await originalEncrypt(...args);
    encryptedWrites++;
    if (encryptedWrites === 1) {
      db.failNextOp(new Error('vault storage unavailable'));
      reported.resolve();
    }
    if (encryptedWrites === 3) recovered.resolve();
    return value;
  });
  await click(button(f.container, 'Save Provider'));
  await act(async () => { await reported.promise; });
  assert.equal(f.state.providerDraft.apiKey, 'credential');
  assert.deepEqual(f.state.providers, []);
  assert.ok(f.toasts.some(message => message.includes('Failed to protect keys')));
  assert.equal(f.state.vaultPassphraseSet, false);
  assert.ok(!f.toasts.some(message => message.includes('now encrypted')));
  assert.deepEqual((await loadVault()).providers, []);
  await click(button(f.container, 'Save Provider'));
  await act(async () => { await recovered.promise; });
  assert.equal(f.state.providerDraft, null);
  const saved = await loadVault();
  assert.equal(saved.kind, 'encrypted');
  assert.equal(saved.providers[0].apiKey, 'credential');
});

test('provider save can protect the vault first, retrying a short passphrase before committing the provider', async t => {
  const f = await setup(t, { choice: 'primary', passwords: ['short', 'a long vault passphrase'] });
  await rawDraft(f);
  await fill(f.container.querySelector('input[type="password"]'), 'credential');
  // Await the actual encryption boundary; no sleeps or replacement crypto.
  const protectedState = deferred();
  const original = globalThis.crypto.subtle.encrypt.bind(globalThis.crypto.subtle);
  let encryptedWrites = 0;
  t.mock.method(globalThis.crypto.subtle, 'encrypt', async (...args) => {
    const result = await original(...args);
    if (++encryptedWrites === 2) protectedState.resolve();
    return result;
  });
  await click(button(f.container, 'Save Provider'));
  await act(async () => { await protectedState.promise; });
  assert.match(f.questions[1], /Passphrase must be at least 12/);
  assert.equal(f.state.vaultPassphraseSet, true);
  assert.equal(f.state.vaultLocked, false);
  assert.equal(f.state.providers[0].apiKey, 'credential');
  const stored = await loadVault();
  assert.equal(stored.kind, 'encrypted');
  assert.equal(stored.providers[0].apiKey, 'credential');
});
