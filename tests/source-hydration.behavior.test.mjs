// Behavioral coverage for custom-source vault persistence: sources persisted
// to the vault on every mutation (addSourceEntry/assess/toggle/remove) must
// reload into AIGenContext's aiGenUrls at boot, so a page refresh keeps them in
// the UI. This mounts the REAL ProvidersProvider +
// AIGenProvider under bare node:test via a rolldown bundle with jsdom + the
// shared fake IndexedDB and asserts:
//
//   1. a plain vault's persisted sources hydrate into aiGenUrls on boot
//      (the exact "add source, refresh, source gone" repro),
//   2. re-mounting the tree (a second refresh) restores them once — never
//      duplicated,
//   3. a passphrase-protected (encrypted) vault hides sources while locked and
//      re-hydrates them into aiGenUrls after the session unlock.
//
// The bundle is cached in the gitignored .tmp/ dir; vault-idb caches its
// IndexedDB connection promise, so this file installs ONE fake IndexedDB and
// resets its stores between scenarios (same connection, fresh data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let ctxBundle = null;
let ctxBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 'source-hydration-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { ProvidersProvider, useProviders } from '${abs('src/context/ProvidersContext.jsx')}';`,
    `export { AIGenProvider } from '${abs('src/context/AIGenContext.jsx')}';`,
    `export { useAIGen } from '${abs('src/context/useAIGen.js')}';`,
    `export * as vault from '${abs('src/utils/vault.js')}';`
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'ctx-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  ctxBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  ctxBundleError = err;
}

// A source entry exactly as addSourceEntry shapes it (useAIGeneration.js).
const SOURCE_A = {
  id: 'url_1725120000000_0',
  url: 'https://thehackernews.com/2026/08/claude-mythos-5-tried-to-backdoor-real.html',
  kind: 'url',
  title: 'Claude Mythos 5 tried to backdoor...',
  description: 'Research source imported from thehackernews.com',
  excerpt: 'A fetched excerpt of the article body.',
  fetchNote: '',
  declined: false,
  proxyFailed: false,
  assessing: false,
  assessment: null,
  enabled: true
};
const SOURCE_B = { ...SOURCE_A, id: 'paste_1725120000001_1', url: '', kind: 'paste', title: 'Pasted content' };

let idb = null;

const installEnv = async () => {
  const { installFakeIndexedDB, installLocalStorage } = await import('./helpers/dom.mjs');
  installLocalStorage();
  if (!idb) idb = installFakeIndexedDB();
  localStorage.clear();
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'Node', 'Element', 'getComputedStyle', 'customElements']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
};

const flush = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// Wait for the observable hydration state instead of assuming that PBKDF2,
// IndexedDB, and the React effect chain complete within a fixed delay. A
// timeout still fails through the original assertion; this is synchronization,
// not a retry or a weakened success condition.
const waitFor = async (predicate, advance, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await advance();
  }
};

test('source hydration bundles the real providers exactly once', () => {
  assert.ok(!ctxBundleError, `the context bundle must build under rolldown: ${ctxBundleError?.stack || ctxBundleError}`);
});

test('plain vault: persisted sources hydrate into aiGenUrls on boot (the refresh-loses-sources fix)', async () => {
  assert.ok(ctxBundle, 'bundle required');
  const { ProvidersProvider, AIGenProvider, useProviders, useAIGen, vault } = ctxBundle;
  await installEnv();
  idb.reset();
  // Fresh session state (clears any in-memory session passphrase/lock).
  await vault.loadVault();
  // "Add a source" — the write path the add-source dialog triggers.
  await vault.saveSourceUrls([SOURCE_A]);

  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');

  const sink = {};
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    sink.providers = useProviders();
    sink.ai = useAIGen();
    return null;
  }
  /* oxlint-enable react/immutability */
  let root;
  await act(async () => {
    root = createRoot(document.getElementById('root'));
    root.render(
      React.createElement(ProvidersProvider, null,
        React.createElement(AIGenProvider, null,
          React.createElement(Probe)
        )
      )
    );
  });
  await waitFor(
    () => sink.providers?.vaultLocked === false && sink.ai?.aiGenUrls?.length === 1,
    () => act(async () => { await flush(10); }),
  );

  assert.equal(sink.providers.vaultLocked, false, 'a plain vault boots unlocked');
  assert.deepEqual(
    sink.ai.aiGenUrls,
    [SOURCE_A],
    'aiGenUrls is hydrated from the vault on boot (previously discarded by ProvidersContext)'
  );

  await act(async () => { root.unmount(); });
});

test('re-mounting the tree restores the same sources once — never duplicated', async () => {
  assert.ok(ctxBundle, 'bundle required');
  const { ProvidersProvider, AIGenProvider, useProviders, useAIGen, vault } = ctxBundle;
  await installEnv();
  idb.reset();
  await vault.loadVault();
  await vault.saveSourceUrls([SOURCE_A, SOURCE_B]);

  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');

  const mountTree = async () => {
    const sink = {};
    /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
    function Probe() {
      sink.providers = useProviders();
      sink.ai = useAIGen();
      return null;
    }
    /* oxlint-enable react/immutability */
    let root;
    await act(async () => {
      root = createRoot(document.getElementById('root'));
      root.render(
        React.createElement(ProvidersProvider, null,
          React.createElement(AIGenProvider, null,
            React.createElement(Probe)
          )
        )
      );
    });
    await waitFor(
      () => sink.providers?.vaultLocked === false && sink.ai?.aiGenUrls?.length === 2,
      () => act(async () => { await flush(10); }),
    );
    return { root, sink };
  };

  const first = await mountTree();
  assert.deepEqual(
    first.sink.ai.aiGenUrls,
    [SOURCE_A, SOURCE_B],
    'first boot restores both persisted sources in storage order'
  );

  // Second refresh: unmount and boot again in the same environment.
  await act(async () => { first.root.unmount(); });
  await flush(30);
  const second = await mountTree();
  assert.deepEqual(
    second.sink.ai.aiGenUrls,
    [SOURCE_A, SOURCE_B],
    'the second boot restores the exact same source set — no duplicates, none lost'
  );

  await act(async () => { second.root.unmount(); });
});

test('encrypted vault: sources stay hidden while locked and re-hydrate after the session unlock', async () => {
  assert.ok(ctxBundle, 'bundle required');
  const { ProvidersProvider, AIGenProvider, useProviders, useAIGen, vault } = ctxBundle;
  await installEnv();
  idb.reset();
  await vault.loadVault();
  await vault.protectVault({ providers: [], passphrase: 'hydration-passphrase-12' });
  await vault.saveSourceUrls([SOURCE_A]);
  await vault.lockVault();

  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');

  const sink = {};
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    sink.providers = useProviders();
    sink.ai = useAIGen();
    return null;
  }
  /* oxlint-enable react/immutability */
  let root;
  await act(async () => {
    root = createRoot(document.getElementById('root'));
    root.render(
      React.createElement(ProvidersProvider, null,
        React.createElement(AIGenProvider, null,
          React.createElement(Probe)
        )
      )
    );
  });
  await waitFor(
    () => sink.providers?.vaultLocked === true,
    () => act(async () => { await flush(10); }),
  );

  assert.equal(sink.providers.vaultLocked, true, 'encrypted vault boots locked');
  assert.deepEqual(sink.ai.aiGenUrls, [], 'sources are not readable while the vault is locked');

  // Wrong passphrase: stays locked, sources stay hidden.
  let bad;
  await act(async () => {
    bad = await sink.providers.handleUnlockVault('wrong-passphrase-12');
  });
  assert.equal(bad.success, false, 'a wrong passphrase is rejected');
  assert.equal(sink.providers.vaultLocked, true, 'vault stays locked after a rejected unlock');
  assert.deepEqual(sink.ai.aiGenUrls, [], 'sources stay hidden after a rejected unlock');

  // Correct passphrase: the vault unlocks and aiGenUrls re-hydrates.
  let good;
  await act(async () => {
    good = await sink.providers.handleUnlockVault('hydration-passphrase-12');
  });
  assert.equal(good.success, true, 'the correct passphrase unlocks the session');
  assert.equal(sink.providers.vaultLocked, false, 'unlock flips the vault flag');
  await waitFor(
    () => sink.ai?.aiGenUrls?.length === 1,
    () => act(async () => { await flush(10); }),
  );
  assert.deepEqual(
    sink.ai.aiGenUrls,
    [SOURCE_A],
    'aiGenUrls re-hydrates from the decrypted vault after the unlock'
  );

  await act(async () => { root.unmount(); });
});