import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
const { SettingsProvider, useSettings } = await import('../src/context/SettingsContext.jsx');
const { TestsProvider, useTests } = await import('../src/context/TestsContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { getProxyConfig } = await import('../src/utils/api/proxy.js');

async function setup(t, stored = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const toasts = [];
  const ui = { addToast: (...args) => toasts.push(args) };
  let state, tests;
  function Probe() {
    const s = useSettings(), ts = useTests();
    useLayoutEffect(() => { state = s; tests = ts; });
    return null;
  }
  function Harness({ draft = null }) {
    useState(() => { for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value); return true; });
    return React.createElement(UIContext.Provider, { value: ui },
      React.createElement(ProvidersContext.Provider, { value: { providerDraft: draft } },
        React.createElement(TestsProvider, null, React.createElement(SettingsProvider, null, React.createElement(Probe)))));
  }
  const view = await mountComponent(t, Harness, {});
  return { ...view, get state() { return state; }, get tests() { return tests; }, toasts };
}

test('settings recover from malformed storage and keep provider forms expanded while editing', async t => {
  const f = await setup(t, { atlas_proxy: '{bad', atlas_settings_collapsed: '{bad', atlas_cached_matrix: '{bad' });
  assert.equal(f.state.proxyEnabled, true);
  assert.equal(f.state.proxyUrl, '');
  assert.equal(f.state.proxyMode, 'fallback');
  assert.deepEqual(f.state.proxyCategories, { privateNet: false, providers: false, articles: true });
  assert.ok(f.state.atlasMatrix.length > 0);
  await f.render({ draft: { name: 'Editing' } });
  await act(async () => f.state.toggleSettingsCard('providers'));
  assert.equal(f.state.collapsedSettings.providers, undefined);
  await f.render({ draft: null });
  await act(async () => f.state.toggleSettingsCard('providers'));
  assert.equal(JSON.parse(localStorage.getItem('atlas_settings_collapsed')).providers, true);
});

test('proxy settings reject embedded credentials, persist routing choices and retry failed connectivity', async t => {
  const f = await setup(t);
  await act(async () => f.state.handleProxyTest());
  assert.equal(f.state.proxyTest.message, 'No proxy URL configured.');
  await act(async () => f.state.setProxyUrl('https://relay.example/?api_key=secret'));
  assert.equal(f.state.proxyUrl, '');
  assert.ok(f.toasts.some(([message]) => message.includes('likely secret')));
  await act(async () => {
    f.state.setProxyUrl('https://relay.example/?url=');
    f.state.setProxyMode('always');
    f.state.setProxyCategories({ privateNet: false, providers: true, articles: true });
  });
  assert.equal(getProxyConfig().mode, 'always');
  assert.equal(JSON.parse(localStorage.getItem('atlas_proxy')).categories.providers, true);
  await act(async () => f.state.handleProxyTest());
  assert.equal(f.state.proxyTest.status, 'error');
  t.mock.method(globalThis, 'fetch', async () => new Response('Proxy response content', { status: 200 }));
  await act(async () => f.state.handleProxyTest());
  assert.equal(f.state.proxyTest.status, 'ok');
  assert.match(f.state.proxyTest.message, /HTTP 200/);
});

test('generator configuration can be cleared to fall back to the judge configuration', async t => {
  const f = await setup(t);
  const judge = { provider: 'judge', model: 'judge-model' };
  await act(async () => f.state.saveJudgeConfig(judge));
  await act(async () => f.state.saveGenConfig({ provider: 'generator', model: 'other' }));
  assert.equal(f.state.effectiveGenConfig.provider, 'generator');
  await act(async () => f.state.saveGenConfig(null));
  assert.equal(localStorage.getItem('atlas_gen_config'), null);
  assert.deepEqual(f.state.effectiveGenConfig, judge);
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_judge_config')), judge);
});

test('live ATLAS sync recovers from offline failure, updates the catalog and retains the last cache on later failure', async t => {
  const f = await setup(t);
  await act(async () => f.state.syncLiveATLAS());
  assert.match(f.state.atlasSyncStatus, /showing the preloaded version/);
  assert.equal(f.state.loadingATLAS, false);
  const atlas = JSON.stringify({ tactics: { 'AML.TA0001': { name: 'Execution', description: 'Execution tactic' } },
    techniques: { 'AML.T9999': { name: 'New technique', description: 'New coverage', maturity: 'feasible' } },
    relationships: { 'AML.T9999': { achieves: [{ target: 'AML.TA0001' }] } } });
  t.mock.method(globalThis, 'fetch', async url => new Response(String(url).endsWith('ATLAS-latest.yaml') ? 'ATLAS-2026.01.yaml' : atlas));
  await act(async () => f.tests.setSelectedTests([]));
  await act(async () => f.state.syncLiveATLAS());
  assert.equal(f.state.loadingATLAS, false);
  assert.match(f.state.atlasSyncStatus, /Last synced/);
  assert.equal(JSON.parse(localStorage.getItem('atlas_matrix_meta')).version, 'ATLAS-2026.01');
  const matrix = JSON.parse(localStorage.getItem('atlas_cached_matrix'));
  assert.deepEqual(f.state.atlasMatrix, matrix);
  assert.ok(f.toasts.some(([message]) => message.includes('updated live')));
  const selected = [...f.tests.selectedTests];
  assert.ok(selected.length > 0, 'new technique coverage is selected after an explicit sync');
  assert.ok(f.tests.allTests.some(test => test.techniqueId === 'AML.T9999' && selected.includes(test.id)));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline again'); });
  await act(async () => f.state.syncLiveATLAS());
  assert.match(f.state.atlasSyncStatus, /showing the last cached version/);
  assert.deepEqual(f.state.atlasMatrix, matrix);
  assert.deepEqual(f.tests.selectedTests, selected);
});
