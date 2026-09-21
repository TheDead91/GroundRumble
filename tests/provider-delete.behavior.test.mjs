import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(join(root, '../src/components/views/settings/ProvidersCard.jsx'), 'utf8');

test('Deletion requires explicit confirmation with Cancel/Delete Provider semantics', () => {
  assert.ok(card.includes('Delete provider?'), 'confirmation asks Delete provider?');
  assert.ok(card.includes('This removes "'), 'confirmation explains removal from GroundRumble');
  assert.ok(card.includes("primaryText: 'Delete Provider'"), 'confirm button reads Delete Provider');
  assert.ok(card.includes('onClick={() => confirmDeleteProvider(cp)}'), 'delete button routes through confirmation');
  const fn = card.slice(card.indexOf('const confirmDeleteProvider = '), card.indexOf('};', card.indexOf('const confirmDeleteProvider = ')));
  assert.ok(fn.indexOf('await askConfirm(') < fn.indexOf('await deleteProvider('), 'no deletion before confirmation');
  assert.ok(fn.includes('if (!ok) return;'), 'Cancel/dismiss performs no deletion and no persistence mutation');
  assert.ok(fn.includes('Could not delete provider'), 'persistence failure shows visible feedback');
});

test('Confirmed deletion persists; failure restores with reload consistency', async (t) => {
  const db = installFakeIndexedDB();
  const { ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
  const { loadVault, saveVault, lockVault } = await import('../src/utils/vault.js');
  const seed = [
    { id: 'keep', name: 'Keep', connector: 'openai', endpoint: 'https://keep.example/v1', models: ['a'], apiKey: '' },
    { id: 'drop', name: 'Drop', connector: 'openai', endpoint: 'https://drop.example/v1', models: ['b'], apiKey: '' },
  ];
  db.reset();
  lockVault();
  installLocalStorage();
  await loadVault();
  await saveVault({ providers: seed });
  let state;
  function Probe() { const v = useProviders(); useLayoutEffect(() => { state = v; }); return null; }
  await mountComponent(t, () => React.createElement(ProvidersProvider, null, React.createElement(Probe)));
  assert.equal(state.providers.length, 2);

  let ok;
  await act(async () => { ok = await state.deleteProvider('drop'); });
  assert.equal(ok, true, 'confirmed deletion reports success');
  assert.deepEqual(state.providers.map((p) => p.id), ['keep'], 'provider removed immediately after persistence');
  assert.deepEqual((await loadVault()).providers.map((p) => p.id), ['keep'], 'reload agrees with committed deletion');

  db.failNextOp(new Error('vault full'));
  await act(async () => { ok = await state.deleteProvider('keep'); });
  assert.equal(ok, false, 'persistence failure reports failure');
  assert.deepEqual(state.providers.map((p) => p.id), ['keep'], 'provider remains on failure');
  assert.deepEqual((await loadVault()).providers.map((p) => p.id), ['keep'], 'reload remains consistent with previous durable state');
});

test('AskConfirm supports explicit confirm-button labels', async (t) => {
  const { UIProvider } = await import('../src/context/UIContext.jsx');
  const { useUI } = await import('../src/context/useUI.js');
  let ui;
  function Probe() { const v = useUI(); useLayoutEffect(() => { ui = v; }); return null; }
  await mountComponent(t, () => React.createElement(UIProvider, null, React.createElement(Probe)));
  let pending;
  await act(async () => { pending = ui.askConfirm('Delete provider?', { primaryText: 'Delete Provider' }); });
  assert.equal(ui.confirmState.type, 'confirm');
  assert.equal(ui.confirmState.primaryText, 'Delete Provider');
  await act(async () => { ui.confirmState.resolve(false); await pending; });
});
