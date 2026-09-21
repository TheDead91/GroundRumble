// Covers the vault's IndexedDB open-failure path. This must run in its own
// process: the module caches its DB promise, so a fresh import is required to
// exercise the first-open error handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const { failNextOpen } = installFakeIndexedDB();
installLocalStorage();

const vault = await import('../src/utils/vault.js');

test('loadVault rejects when opening IndexedDB fails', async () => {
  failNextOpen(new Error('open blocked'));
  await assert.rejects(vault.loadVault(), /open blocked/);
});