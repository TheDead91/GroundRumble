// Source-gate pin for the endpoint-policy import in src/utils/api/proxy.js:
// the module may only import the helpers it actually calls (isSpecialUseAddress,
// isSpecialUseHostname, isInsecureHttpEndpoint). The isBlocked* primitives were
// leftover imports from before the modularization and lint-flag dead bindings.
//
// Source-text level (mirrors tests/provider-policy.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROXY_PATH = 'src/utils/api/proxy.js';
const EXPECTED_IMPORT =
  "import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from '../endpoint-policy.js';";

const source = readFileSync(join(root, PROXY_PATH), 'utf8');

const endpointPolicyImports = () =>
  source.replace(/\r\n/g, '\n').split('\n')
    .filter((l) => l.includes("'../endpoint-policy.js'"));

test('proxy.js imports only the endpoint-policy helpers it uses', () => {
  const lines = endpointPolicyImports();
  assert.equal(lines.length, 1, 'proxy.js must have exactly one endpoint-policy import');
  assert.equal(lines[0], EXPECTED_IMPORT, 'the import must not carry dead isBlocked* bindings');
});

test('the three used helpers stay imported', () => {
  const line = endpointPolicyImports()[0];
  for (const name of ['isSpecialUseAddress', 'isSpecialUseHostname', 'isInsecureHttpEndpoint']) {
    assert.ok(line.includes(name), `${name} must remain imported`);
  }
});

test('the isBlocked* primitives resolve only from the policy module itself', () => {
  assert.doesNotMatch(
    source,
    /\bisBlockedIPv[46]\b/,
    'proxy.js must not reference isBlockedIPv4/isBlockedIPv6'
  );
});