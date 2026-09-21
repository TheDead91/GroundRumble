// Regression guard for eslint(no-unused-vars): fetchViaProxy destructured a
// `retries` option from its `options` bag but never read it, which surfaced as
// an oxlint warning at proxy.js:143. Retries are handled upstream by
// fetchWithRetry (provider-client.js); the proxy relays are single-attempt by
// design. The destructure must stay free of unused bindings.
//
// Source-text level because the relay is exercised with stubbed fetch in
// tests/proxy-relay.unit.test.mjs and this check guards the lint contract directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const proxySrc = readFileSync(join(root, 'src/utils/api/proxy.js'), 'utf8');

test('fetchViaProxy no longer destructures an unused retries option', () => {
  const body = proxySrc.slice(proxySrc.indexOf('export const fetchViaProxy'));
  const optionsLine = body.match(/const \{[\s\S]*?\} = options;/)?.[0];
  assert.ok(optionsLine, 'fetchViaProxy keeps its options destructure');
  assert.doesNotMatch(optionsLine, /\bretries\s*[,}]/, 'the options destructure must not bind an unused retries');
  assert.match(optionsLine, /\breturnOnStatus\b/, 'returnOnStatus stays destructured');
  assert.match(optionsLine, /\bmethod\b/, 'method stays destructured');
});