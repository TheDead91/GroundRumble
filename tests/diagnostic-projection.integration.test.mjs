// End-to-end diagnostic-projection coverage: a provider/relay that
// echoes a secret (or a huge body) into a non-OK response must not reach the
// inline status, toast, or persistent notification sinks unredacted/unbounded.
// Each case drives a real production path (mocked transport only) and asserts
// the ACTUAL sink projection, not just the helper output.
import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
import { installFakeIndexedDB } from './helpers/dom.mjs';

const db = installFakeIndexedDB();
const { SettingsProvider, SettingsContext, useSettings } = await import('../src/context/SettingsContext.jsx');
const { TestsProvider } = await import('../src/context/TestsContext.jsx');
const { ProvidersContext, ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { ProxyCard } = await import('../src/components/views/settings/ProxyCard.jsx');

test('proxy connectivity test projects a secret-echoing relay body into the inline status and the toast', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const toasts = [];
  let state;
  function Probe() {
    const s = useSettings();
    useLayoutEffect(() => { state = s; });
    return React.createElement(ProxyCard, { ...s, onTestProxy: s.handleProxyTest });
  }
  function Harness() {
    return React.createElement(UIContext.Provider, { value: { addToast: (...args) => toasts.push(args) } },
      React.createElement(ProvidersContext.Provider, { value: {} },
        React.createElement(TestsProvider, null, React.createElement(SettingsProvider, null, React.createElement(Probe)))));
  }
  const view = await mountComponent(t, Harness);
  await act(async () => state.setProxyUrl('https://relay.example/?url='));
  const secret = 'sk-SECRET1234567890';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: `relay rejected key ${secret}` } }), { status: 502 }));
  await click(button(view.container, 'Test Proxy'));
  assert.equal(state.proxyTest.status, 'error');
  assert.doesNotMatch(state.proxyTest.message, /sk-SECRET1234567890/);
  assert.match(state.proxyTest.message, /REDACTED/);
  assert.ok(toasts.length > 0, 'a failure toast is emitted');
  assert.doesNotMatch(toasts.at(-1)[0], /sk-SECRET1234567890/);
});

test('provider connection test projects a secret-echoing provider body into the inline status', async t => {
  db.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let state;
  function Content() {
    const providers = useProviders();
    useLayoutEffect(() => { state = providers; });
    return null;
  }
  function Harness() {
    return React.createElement(SettingsContext.Provider, { value: { collapsedSettings: {}, toggleSettingsCard() {} } },
      React.createElement(ProvidersProvider, null, React.createElement(Content)));
  }
  await mountComponent(t, Harness);
  const secret = 'sk-PROVIDER1234567890';
  await act(async () => state.setProviders([{ id: 'p1', name: 'Raw', connector: 'raw', endpoint: 'https://raw.example/chat', method: 'POST', bodyTemplate: '{"ping":"{{userPrompt}}"}', apiKey: 'k', models: [] }]));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: `bad key ${secret}` } }), { status: 500 }));
  await act(async () => state.testProvider('p1'));
  assert.equal(state.providerTest.p1.status, 'error');
  assert.doesNotMatch(state.providerTest.p1.message, /sk-PROVIDER1234567890/);
  assert.match(state.providerTest.p1.message, /REDACTED/);
});

test('transport projection removes a secret from a provider HTTP error body', async () => {
  const { queryModel } = await import('../src/utils/api/index.js');
  const { stubFetch, textRes } = await import('./helpers/httpx.mjs');
  const secret = 'sk-TRANSPORT1234567890';
  stubFetch([[_unused => true, () => textRes(`gateway rejected Authorization: Bearer ${secret}`, 500)]]);
  await assert.rejects(
    queryModel('cp', 'm', 's', 'u', [{ id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' }]),
    (err) => {
      assert.doesNotMatch(err.message, new RegExp(secret));
      assert.match(err.message, /REDACTED/);
      return true;
    }
  );
});
