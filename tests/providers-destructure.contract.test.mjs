// Regression guard for eslint(no-unused-vars): App destructured
// handleProviderDraftChange and providerModelFetching from useProviders() but
// never read them, which surfaced as oxlint warnings at App.jsx. The context
// still exposes the bindings (ProvidersContext keeps the callback and its value
// key — pinned by tests/providers-render.contract.test.mjs); App must
// simply not bind them when it has no consumer. This check guards the lint
// contract directly.
//
// Source-text level because bare node:test cannot compile JSX (repo
// convention: see tests/proxy-options.contract.test.mjs).
// Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');

test('App no longer destructures unused bindings from providersCtx', () => {
  const closer = /\} = providersCtx;/g;
  const m = closer.exec(appSrc);
  assert.ok(m, 'App keeps its useProviders() destructure');
  const chunk = appSrc.slice(appSrc.lastIndexOf('const {', m.index), m.index);
  assert.doesNotMatch(chunk, /\bhandleProviderDraftChange\b/,
    'the providers destructure must not bind an unused handleProviderDraftChange');
  assert.doesNotMatch(chunk, /\bproviderModelFetching\b/,
    'the providers destructure must not bind an unused providerModelFetching');
  assert.doesNotMatch(chunk, /,\s*\}/, 'the destructure must not end on a dangling comma');
  assert.doesNotMatch(chunk, /\b[a-zA-Z]+\s*:\s*\w+,\n\s*\},/,
    'the destructure must not leave a trailing separator after the dropped binding');
});