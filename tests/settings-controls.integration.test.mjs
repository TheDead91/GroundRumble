import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent, click, button, fill, deferred } from './helpers/react-harness.mjs';
const { SettingsProvider, SettingsContext, useSettings } = await import('../src/context/SettingsContext.jsx');
const { TestsProvider } = await import('../src/context/TestsContext.jsx');
const { UIProvider } = await import('../src/context/UIContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { ProxyCard } = await import('../src/components/views/settings/ProxyCard.jsx');
const { AccountDataCard } = await import('../src/components/views/settings/AccountDataCard.jsx');
const { HelperModelsCard } = await import('../src/components/views/settings/HelperModelsCard.jsx');

async function choose(element, value) {
  await act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

test('proxy controls persist independent opt-ins, reject secret URLs, and report asynchronous connectivity outcomes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settings;
  function Content() {
    const state = useSettings();
    useLayoutEffect(() => { settings = state; });
    return React.createElement(ProxyCard, { ...state, onTestProxy: state.handleProxyTest });
  }
  function Harness() {
    return React.createElement(UIProvider, null, React.createElement(ProvidersContext.Provider, { value: {} },
      React.createElement(TestsProvider, null, React.createElement(SettingsProvider, null, React.createElement(Content)))));
  }
  const { container } = await mountComponent(t, Harness);
  assert.equal(button(container, 'Test Proxy').disabled, true);
  const boxes = () => container.querySelectorAll('input[type="checkbox"]');
  await click(boxes()[0]);
  assert.ok([...boxes()].slice(1).every(box => box.disabled));
  await click(boxes()[0]);
  await click(boxes()[2]);
  await click(boxes()[3]);
  await click(boxes()[1]);
  assert.equal(container.querySelector('select').disabled, true);
  await click(boxes()[1]);
  await choose(container.querySelector('select'), 'always');
  await fill(container.querySelector('input[type="text"]'), 'https://relay.example/?api_key=secret');
  assert.equal(container.querySelector('input[type="text"]').value, '');
  assert.equal(JSON.parse(localStorage.getItem('atlas_proxy')).url, '');
  await fill(container.querySelector('input[type="text"]'), 'https://relay.example/?url={url}');
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_proxy')), {
    enabled: true, url: 'https://relay.example/?url={url}', mode: 'always', categories: { articles: true, providers: true, privateNet: true },
  });
  const response = deferred();
  const fetch = t.mock.method(globalThis, 'fetch', () => response.promise);
  await click(button(container, 'Test Proxy'));
  assert.equal(button(container, 'Testing…').disabled, true);
  await act(async () => response.resolve(new Response('relay content', { status: 200 })));
  assert.match(container.textContent, /Proxy works.*HTTP 200, 13 chars/);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response('relay unavailable', { status: 503 }));
  await click(button(container, 'Test Proxy'));
  assert.equal(settings.proxyTest.status, 'error');
  assert.match(container.textContent, /503/);
  await click(container.querySelector('[title="Collapse card"]'));
  assert.equal(container.querySelector('input'), null);
  assert.equal(JSON.parse(localStorage.getItem('atlas_settings_collapsed')).cors, true);
  await click(container.querySelector('h3'));
  assert.ok(container.querySelector('input'));
  assert.equal(settings.collapsedSettings.cors, false, 'button clicks must not bubble into a second toggle');
});

function card(Component, props) {
  return React.createElement(SettingsContext.Provider, { value: { collapsedSettings: {}, toggleSettingsCard() {} } }, React.createElement(Component, { collapsedSettings: {}, ...props }));
}

test('account forms submit current secrets, associate validation errors, and expose actions for each vault state', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else delete globalThis.indexedDB; });
  const calls = [];
  function Harness({ mode, error = '' }) {
    const [vaultInput, setVaultInput] = useState('');
    const [backupPassphrase, setBackupPassphrase] = useState('');
    return card(AccountDataCard, { vaultInput, setVaultInput, backupPassphrase, setBackupPassphrase,
      vaultLocked: mode === 'locked', vaultPassphraseSet: mode !== 'plain', vaultValidationError: error, backupValidationError: error,
      handleUnlockVault: value => calls.push(['unlock', value]), handleProtectVault: () => calls.push(['protect', vaultInput]),
      handleExportBackup: () => calls.push(['export', backupPassphrase]), handleLockVault: () => calls.push(['lock']),
      handleUnprotectVault: () => calls.push(['unprotect']), resetAllData: () => calls.push(['reset']) });
  }
  const view = await mountComponent(t, Harness, { mode: 'locked' });
  await fill(view.container.querySelector('[data-testid="vault-passphrase-input"]'), 'unlock secret');
  await click(button(view.container, 'Unlock'));
  assert.deepEqual(calls, [['unlock', 'unlock secret']]);
  await view.render({ mode: 'plain', error: 'Use at least twelve characters' });
  const protect = view.container.querySelector('#vault-protect-input');
  assert.equal(protect.getAttribute('aria-invalid'), 'true');
  assert.equal(document.getElementById(protect.getAttribute('aria-describedby')).textContent, 'Use at least twelve characters');
  await fill(protect, 'new long passphrase');
  await click(button(view.container, 'Protect with passphrase'));
  await view.render({ mode: 'encrypted', error: 'Try a longer passphrase' });
  assert.match(view.container.textContent, /encrypted at rest and unlocked/);
  const change = view.container.querySelector('#vault-change-input');
  assert.equal(document.getElementById(change.getAttribute('aria-describedby')).textContent, 'Try a longer passphrase');
  await fill(change, 'changed long passphrase');
  await click(button(view.container, 'Change passphrase'));
  await click(button(view.container, 'Lock now'));
  await click(button(view.container, 'Remove passphrase'));
  const backup = view.container.querySelector('[placeholder="Required to encrypt the backup (min 12 characters)"]');
  assert.equal(backup.getAttribute('aria-describedby'), 'backup-export-error');
  await fill(backup, 'backup long passphrase');
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  await act(async () => backup.closest('form').dispatchEvent(event));
  assert.equal(event.defaultPrevented, true);
  await click(button(view.container, 'Reset everything'));
  assert.deepEqual(calls.slice(1), [['protect', 'new long passphrase'], ['protect', 'changed long passphrase'], ['lock'], ['unprotect'], ['export', 'backup long passphrase'], ['reset']]);
});

test('helper model settings reset dependent models, retain custom model names, and gate probes', async t => {
  const changes = [], probes = [];
  const config = { provider: 'p', model: 'custom', temperature: 0.1 };
  const props = { judgeConfig: config, effectiveGenConfig: config, providers: [{ id: 'p', name: 'P', models: ['first', 'second'] }, { id: 'q', name: 'Q' }],
    helperProviderSelectable: () => true, judgeModelList: ['first'], genModelList: ['first'], saveJudgeConfig: value => changes.push(value),
    testJudge: () => probes.push('judge'), testGenerator: () => probes.push('generator') };
  function Harness(value) { return card(HelperModelsCard, value); }
  const view = await mountComponent(t, Harness, props);
  assert.equal(view.container.querySelectorAll('select')[1].value, 'custom');
  await choose(view.container.querySelector('select'), 'q');
  await choose(view.container.querySelectorAll('select')[1], 'first');
  await view.render({ ...props, selectedJudgeProvider: props.providers[0] });
  await choose(view.container.querySelectorAll('select')[1], 'second');
  await view.render({ ...props, selectedJudgeProvider: { models: [] } });
  await fill(view.container.querySelector('input'), 'manual');
  assert.deepEqual(changes, [{ provider: 'q', model: '' }, { ...config, model: 'first' }, { ...config, model: 'second' }, { ...config, model: 'manual' }]);
  for (const btn of [...view.container.querySelectorAll('button')].filter(node => node.textContent.trim() === 'Test model')) await click(btn);
  assert.deepEqual(probes, ['judge', 'generator']);
  for (const gate of [{ vaultLocked: true }, { testingJudge: true, testingGen: true }, { helperProviderSelectable: () => false }, { judgeConfig: { provider: 'p', model: '' }, effectiveGenConfig: { provider: 'p', model: '' }, judgeModelList: [], genModelList: [] }]) {
    await view.render({ ...props, ...gate });
    const buttons = [...view.container.querySelectorAll('button')].filter(node => /Test model|Testing/.test(node.textContent));
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(node => node.disabled));
  }
});
