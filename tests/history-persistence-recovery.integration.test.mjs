import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent, deferred } from './helpers/react-harness.mjs';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';
const db = installFakeIndexedDB();
const { HistoryProvider, useHistory } = await import('../src/context/HistoryContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { loadVault, protectVault, loadAuditHistory, saveAuditHistory } = await import('../src/utils/vault.js');

test('unlocked history hydrates encrypted evidence when no unlock-time stash is available', async t => {
  db.reset();
  installLocalStorage();
  await loadVault();
  await protectVault({ providers: [], passphrase: 'history passphrase' });
  await saveAuditHistory([{ id: 'stored', details: [{ status: 'SECURE', response: 'stored evidence' }] }]);
  const decrypted = deferred();
  const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'decrypt', async (...args) => {
    const value = await originalDecrypt(...args);
    decrypted.resolve();
    return value;
  });
  let state;
  const providers = { vaultLocked: false, vaultPassphraseSet: true, restoredAuditHistoryRef: { current: null } };
  function Probe() { const h = useHistory(); useLayoutEffect(() => { state = h; }); return null; }
  function Harness() { return React.createElement(UIContext.Provider, { value: { addToast() {} } },
    React.createElement(ProvidersContext.Provider, { value: providers }, React.createElement(HistoryProvider, null, React.createElement(Probe)))); }
  await mountComponent(t, Harness);
  await act(async () => { await decrypted.promise; });
  assert.equal(state.history[0].details[0].response, 'stored evidence');
  assert.equal(state.historyRef.current[0].id, 'stored');
  assert.equal(localStorage.getItem('atlas_audit_history'), null, 'hydration keeps detailed evidence out of browser preferences');
});

test('history persistence errors leave in-memory history intact and permit retrying the same audit', async t => {
  db.reset();
  installLocalStorage();
  await loadVault();
  await protectVault({ providers: [], passphrase: 'history passphrase' });
  let state;
  const toasts = [];
  const providers = { vaultLocked: false, vaultPassphraseSet: true, restoredAuditHistoryRef: { current: null } };
  const ui = { addToast: message => toasts.push(message), askConfirm: async () => true };
  function Probe() { const h = useHistory(); useLayoutEffect(() => { state = h; }); return null; }
  function Harness() { return React.createElement(UIContext.Provider, { value: ui },
    React.createElement(ProvidersContext.Provider, { value: providers }, React.createElement(HistoryProvider, null, React.createElement(Probe)))); }
  await mountComponent(t, Harness);
  const record = { id: 'run', details: [{ auditId: 'run', targetUid: 'target', testId: 'test', status: 'SECURE', response: 'retained evidence' }] };
  const original = window.Storage.prototype.setItem;
  const storage = t.mock.method(window.Storage.prototype, 'setItem', function (key, value) {
    if (key === 'atlas_audit_history') throw new DOMException('full', 'QuotaExceededError');
    return original.call(this, key, value);
  });
  let saved;
  await act(async () => { saved = await state.appendAuditHistory(record); });
  assert.equal(saved, false);
  assert.deepEqual(state.history, []);
  assert.match(toasts.at(-1), /storage is full/);
  storage.mock.restore();
  db.failNextOp(new Error('database write failed'));
  await act(async () => { saved = await state.appendAuditHistory(record); });
  assert.equal(saved, false);
  assert.deepEqual(state.history, []);
  assert.match(toasts.at(-1), /Could not save audit history: database write failed/);
  await act(async () => { saved = await state.appendAuditHistory(record); });
  assert.equal(saved, true);
  assert.equal(state.history.length, 1);
  assert.equal((await loadAuditHistory())[0].details[0].response, 'retained evidence');
  const failOverrides = function (key, value) {
    if (key === 'atlas_result_overrides') throw new Error('override storage full');
    return original.call(this, key, value);
  };
  const overrideStorage = t.mock.method(window.Storage.prototype, 'setItem', failOverrides);
  await act(async () => { saved = await state.setResultOverride(record.details[0], 'VULNERABLE'); });
  assert.equal(saved, false);
  assert.deepEqual(state.overrides, {});
  assert.match(toasts.at(-1), /Could not save the verdict override/);
  overrideStorage.mock.restore();
  await act(async () => { saved = await state.setResultOverride(record.details[0], 'VULNERABLE'); });
  assert.equal(saved, true);
  assert.deepEqual(state.overrides['run-target-test'], { verdict: 'VULNERABLE', reason: '' });
  t.mock.method(window.Storage.prototype, 'setItem', failOverrides);
  await act(async () => { saved = await state.deleteAudit('run'); });
  assert.equal(saved, true, 'audit deletion completes even if subsequent override cleanup fails');
  assert.deepEqual(state.history, []);
  assert.match(toasts.at(-1), /Audit deleted, but its override cleanup failed/);
  assert.deepEqual(await loadAuditHistory(), []);
});
