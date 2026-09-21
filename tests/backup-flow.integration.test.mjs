import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
import { installFakeIndexedDB } from './helpers/dom.mjs';
const db = installFakeIndexedDB();
const { UIContext } = await import('../src/context/UIContext.jsx');
const { useBackupFlow } = await import('../src/hooks/useBackupFlow.js');
const { encryptBackup, openBackup, parseBackup } = await import('../src/utils/backup.js');
const { loadVault, saveVault, loadSourceUrls, saveSourceUrls, loadAuditHistory, saveAuditHistory, protectVault, lockVault } = await import('../src/utils/vault.js');

const passphrase = 'backup test passphrase';
const provider = { id: 'provider', name: 'Public', connector: 'openai', endpoint: 'https://api.example/v1', models: ['model'], apiKey: 'secret-credential', enabled: true, allowPrivate: true, allowInsecureTransport: true };
const source = { id: 'source', kind: 'paste', title: 'Research', excerpt: 'Private research', enabled: true };
const bundle = data => ({ app: 'groundrumble', version: 1, data });

async function setup(t, options = {}) {
  db.reset();
  const toasts = [], confirmations = [];
  const reload = t.mock.fn(), finish = t.mock.fn();
  let current;
  const ui = { addToast: message => toasts.push(message), askConfirm: async message => { confirmations.push(message); return options.confirm !== false; }, finishOnboarding: finish, onboardingOpen: true };
  function Probe() {
    const value = useBackupFlow({ providers: [provider], aiGenUrls: [source], historyRef: { current: [] }, buildConfirmNode: value => value, ...options });
    useLayoutEffect(() => { current = value; });
    return null;
  }
  function Harness() { return React.createElement(UIContext.Provider, { value: ui }, React.createElement(Probe)); }
  await mountComponent(t, Harness);
  const domWindow = window;
  globalThis.window = new Proxy(domWindow, { get(target, key) { return key === 'location' ? { reload } : Reflect.get(target, key); } });
  await loadVault();
  return { get current() { return current; }, toasts, confirmations, reload, finish };
}

async function importFile(f, data) {
  const encrypted = await encryptBackup(bundle(data), passphrase);
  const target = { value: 'backup.json', files: [{ text: async () => JSON.stringify(encrypted) }] };
  await act(async () => f.current.handleImportBackup({ target }));
  assert.equal(target.value, '', 'the same file must remain selectable after a failed attempt');
  return encrypted;
}

async function submit(f, value = passphrase) {
  await act(async () => f.current.setBackupImportModal(prev => ({ ...prev, passphrase: value })));
  await act(async () => f.current.submitBackupImportPassphrase());
}

test('backup export validates passphrase and downloads a decryptable envelope containing current vault data', async t => {
  const f = await setup(t);
  let downloaded, filename;
  t.mock.method(URL, 'createObjectURL', blob => { downloaded = blob; return 'blob:test-backup'; });
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', function () { filename = this.download; });
  await act(async () => f.current.handleExportBackup());
  assert.match(f.current.backupValidationError, /at least 12/);
  assert.equal(downloaded, undefined);
  await act(async () => f.current.setBackupPassphrase(passphrase));
  assert.equal(f.current.backupValidationError, '');
  await act(async () => f.current.handleExportBackup());
  assert.match(filename, /^groundrumble-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const raw = await downloaded.text();
  assert.ok(!raw.includes(provider.apiKey));
  assert.ok(!raw.includes(source.excerpt));
  const opened = await openBackup(parseBackup(raw), passphrase);
  assert.deepEqual(JSON.parse(opened.data.atlas_providers), [provider]);
  assert.deepEqual(JSON.parse(opened.data.atlas_ai_gen_urls), [source]);
  assert.equal(f.current.backupPassphrase, '');
  assert.equal(document.querySelector('a'), null);
  assert.deepEqual(revoke.mock.calls[0].arguments, ['blob:test-backup']);
});

test('encrypted backup import retries wrong passphrases, disables imported providers and keeps secrets out of localStorage', async t => {
  const f = await setup(t);
  const privateProvider = { ...provider, id: 'local', endpoint: 'http://127.0.0.1:11434/v1' };
  const httpProvider = { ...provider, id: 'http', endpoint: 'http://api.example/v1' };
  await importFile(f, { atlas_providers: JSON.stringify([provider, privateProvider, httpProvider]), atlas_ai_gen_urls: JSON.stringify([source]), atlas_demo_mode: 'false' });
  await submit(f, '   ');
  assert.match(f.current.backupImportModal.error, /Enter the passphrase/);
  await submit(f, 'wrong passphrase');
  assert.equal(f.current.backupImportModal.passphrase, '');
  assert.equal(f.current.backupImportModal.busy, false);
  assert.match(f.current.backupImportModal.error, /Incorrect passphrase or corrupted backup/);
  assert.deepEqual(f.confirmations, []);
  await submit(f);
  assert.equal(f.current.backupImportModal, null);
  const restored = (await loadVault()).providers;
  assert.equal(restored.length, 3);
  assert.ok(restored.every(item => item.enabled === false));
  assert.equal(restored[0].allowPrivate, false);
  assert.equal(restored[0].allowInsecureTransport, false);
  assert.equal(restored[1].allowPrivate, true);
  assert.equal(restored[1].allowInsecureTransport, false, 'loopback does not require the non-local HTTP approval');
  assert.equal(restored[2].allowPrivate, false);
  assert.equal(restored[2].allowInsecureTransport, true);
  assert.deepEqual(await loadSourceUrls(), [source]);
  assert.equal(localStorage.getItem('atlas_providers'), null);
  assert.equal(localStorage.getItem('atlas_ai_gen_urls'), null);
  assert.equal(localStorage.getItem('atlas_demo_mode'), 'false');
  assert.equal(f.reload.mock.callCount(), 1);
  assert.equal(f.finish.mock.callCount(), 1);
});

test('declining decrypted backup preview leaves existing vault and preferences intact', async t => {
  const f = await setup(t, { confirm: false });
  await saveVault({ providers: [provider] });
  const previous = (await loadVault()).providers;
  localStorage.setItem('atlas_demo_mode', 'true');
  await importFile(f, { atlas_providers: '[]', atlas_demo_mode: 'false' });
  await submit(f);
  assert.deepEqual((await loadVault()).providers, previous);
  assert.equal(localStorage.getItem('atlas_demo_mode'), 'true');
  assert.equal(f.reload.mock.callCount(), 0);
  assert.equal(f.confirmations.length, 1);
});

test('encrypted restore keeps valid overrides, filters unsafe references and preserves underlying history statuses', async t => {
  const detail = (testId, status) => ({ auditId: 'run', targetUid: 'a', testId, status });
  const details = [detail('secure', 'SECURE'), detail('vulnerable', 'VULNERABLE'), detail('uncertain', 'VULNERABLE'),
    detail('error', 'ERROR'), detail('empty', 'EMPTY'), detail('inconclusive', 'INCONCLUSIVE'), detail('unknown', 'UNKNOWN'),
    detail('changed', 'VULNERABLE'), { timestamp: 'legacy-time', targetUid: 'a', testId: 'test', status: 'SECURE' }];
  const f = await setup(t, { historyRef: { current: [{ id: 'run', details: [detail('changed', 'ERROR')] }] } });
  const overrides = Object.fromEntries(Object.entries({
    'run-a-secure': 'VULNERABLE', 'run-a-vulnerable': 'SECURE', 'run-a-uncertain': 'INCONCLUSIVE',
    'run-a-error': 'SECURE', 'run-a-empty': 'VULNERABLE', 'run-a-inconclusive': 'SECURE',
    'run-a-unknown': 'SECURE', 'run-a-changed': 'SECURE', 'deleted-a-test': 'SECURE', 'legacy-time-a-test': 'VULNERABLE'
  }).map(([key, verdict]) => [key, { verdict, reason: `Review of ${key}` }]));
  await importFile(f, { atlas_audit_history: JSON.stringify([{ id: 'run', details }]), atlas_result_overrides: JSON.stringify(overrides) });
  await submit(f);
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.reload.mock.callCount(), 1);
  assert.match(f.toasts.at(-1), /^Restored /);
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_result_overrides')), {
    'run-a-secure': overrides['run-a-secure'], 'run-a-vulnerable': overrides['run-a-vulnerable'], 'run-a-uncertain': overrides['run-a-uncertain'], 'legacy-time-a-test': overrides['legacy-time-a-test']
  });
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_audit_history'))[0].details, details);
});

test('encrypted restore without an override section clears existing overrides', async t => {
  const f = await setup(t);
  localStorage.setItem('atlas_result_overrides', JSON.stringify({ 'old-a-test': { verdict: 'SECURE', reason: '' } }));
  await importFile(f, { atlas_demo_mode: 'false' });
  await submit(f);
  assert.equal(localStorage.getItem('atlas_result_overrides'), null);
  assert.equal(localStorage.getItem('atlas_demo_mode'), 'false');
  assert.equal(f.reload.mock.callCount(), 1);
});

test('encrypted restore rejects malformed override sections before confirmation or writes', async t => {
  const f = await setup(t);
  const previous = JSON.stringify({ 'old-a-test': { verdict: 'SECURE', reason: '' } });
  localStorage.setItem('atlas_result_overrides', previous);
  for (const raw of ['{broken', 'null', '[]', '"SECURE"', '{"run-a-test":{"originalStatus":"VULNERABLE","status":"SECURE"}}', '{"run-a-test":"ERROR"}']) {
    await importFile(f, { atlas_result_overrides: raw });
    await submit(f);
    assert.match(f.current.backupImportModal.error, /atlas_result_overrides.*invalid or too large/);
    assert.equal(localStorage.getItem('atlas_result_overrides'), previous);
  }
  assert.deepEqual(f.confirmations, []);
  assert.equal(f.reload.mock.callCount(), 0);
});

test('backup restore rolls vault and sources back when browser storage fails after secret writes', async t => {
  const f = await setup(t);
  await saveVault({ providers: [provider] });
  const previous = (await loadVault()).providers;
  await saveSourceUrls([source]);
  await importFile(f, { atlas_providers: '[]', atlas_ai_gen_urls: '[]', atlas_demo_mode: 'false' });
  const original = window.Storage.prototype.setItem;
  t.mock.method(window.Storage.prototype, 'setItem', function (key, value) {
    if (key === 'atlas_demo_mode') throw new Error('Storage quota exhausted');
    return original.call(this, key, value);
  });
  await submit(f);
  assert.deepEqual((await loadVault()).providers, previous);
  assert.deepEqual(await loadSourceUrls(), [source]);
  assert.equal(await loadAuditHistory(), null);
  assert.match(f.toasts.at(-1), /Import failed: .*Storage quota exhausted/);
  assert.equal(f.reload.mock.callCount(), 0);
});

test('locked vault blocks both backup directions without changing stored credentials', async t => {
  const f = await setup(t, { vaultLocked: true, vaultPassphraseSet: true });
  await protectVault({ providers: [provider], passphrase });
  lockVault();
  await act(async () => f.current.setBackupPassphrase(passphrase));
  await act(async () => f.current.handleExportBackup());
  assert.match(f.toasts.at(-1), /Unlock the Key Vault before exporting/);
  await importFile(f, { atlas_providers: '[]' });
  await submit(f);
  assert.match(f.toasts.at(-1), /Unlock the Key Vault before importing/);
  assert.deepEqual(f.confirmations, []);
  assert.equal((await loadVault()).locked, true);
  assert.equal(f.reload.mock.callCount(), 0);
});

test('restore reports rollback failures without reloading when encrypted storage becomes unavailable', async t => {
  const f = await setup(t, { vaultPassphraseSet: true, vaultLocked: false });
  await protectVault({ providers: [provider], passphrase });
  await saveSourceUrls([source]);
  await saveAuditHistory([{ id: 'previous', details: [] }]);
  await importFile(f, { atlas_providers: '[]', atlas_ai_gen_urls: '[]', atlas_demo_mode: 'false' });
  const errors = t.mock.method(console, 'error', () => {});
  const original = window.Storage.prototype.setItem;
  t.mock.method(window.Storage.prototype, 'setItem', function (key, value) {
    if (key === 'atlas_demo_mode') {
      t.mock.method(globalThis.crypto.subtle, 'encrypt', async () => { throw new Error('Encryption storage unavailable'); });
      throw new Error('Storage quota exhausted');
    }
    return original.call(this, key, value);
  });
  await submit(f);
  assert.equal(f.reload.mock.callCount(), 0);
  assert.match(f.toasts.at(-1), /Import failed: .*Storage quota exhausted/);
  assert.deepEqual(errors.mock.calls.map(call => call.arguments[0]), [
    'Backup import vault rollback failed:', 'Backup import history rollback failed:', 'Backup import sources rollback failed:'
  ]);
});

test('restore refuses when the stored vault is locked even though the prop reported it unlocked', async t => {
  const f = await setup(t, { vaultPassphraseSet: true, vaultLocked: false });
  await protectVault({ providers: [provider], passphrase });
  lockVault();
  await importFile(f, { atlas_providers: '[]' });
  await submit(f);
  assert.match(f.toasts.at(-1), /Unlock the Key Vault before importing a backup/);
  assert.deepEqual(f.confirmations, [], 'the stored lock is detected before any confirmation');
  assert.equal(f.reload.mock.callCount(), 0);
  assert.equal((await loadVault()).locked, true, 'the stored vault stays locked');
});

test('restore rejects malformed provider credentials before any vault write', async t => {
  const f = await setup(t);
  await saveVault({ providers: [provider] });
  const previous = (await loadVault()).providers;
  await importFile(f, { atlas_providers: '{broken', atlas_ai_gen_urls: '[]' });
  await submit(f);
  assert.match(f.toasts.at(-1), /The backup contains malformed provider credentials/);
  assert.equal(f.reload.mock.callCount(), 0);
  assert.deepEqual((await loadVault()).providers, previous, 'no partial vault write on a credential parse failure');
});

test('invalid backup files show an actionable error and selecting no file has no side effects', async t => {
  const f = await setup(t);
  await act(async () => f.current.handleImportBackup({ target: { value: '', files: [] } }));
  assert.deepEqual(f.toasts, []);
  await act(async () => f.current.handleImportBackup({ target: { value: 'bad.json', files: [{ text: async () => '{broken' }] } }));
  assert.match(f.toasts.at(-1), /not valid JSON/);
  assert.equal(f.current.backupImportModal, null);
  await importFile(f, { atlas_audit_history: '{}' });
  await submit(f);
  assert.match(f.current.backupImportModal.error, /atlas_audit_history.*must be an array/);
  assert.equal(f.reload.mock.callCount(), 0);
  await importFile(f, { atlas_providers: '[]' });
  await act(async () => f.current.setBackupImportModal(prev => ({ ...prev, passphrase })));
  await act(async () => f.current.closeBackupImportModal());
  assert.equal(f.current.backupImportModal, null, 'cancelling discards the envelope and typed passphrase');
  assert.deepEqual(f.confirmations, []);
});
