// Source-gate pin for the endpoint-policy import in src/utils/api/provider-client.js:
// the module may only import the helpers it actually calls (isSpecialUseAddress,
// isSpecialUseHostname, isInsecureHttpEndpoint). The isBlocked* primitives were
// leftover imports from before the modularization and lint-flag dead bindings.
//
// Source-text level (mirrors tests/proxy-imports.contract.test.mjs and
// tests/provider-policy.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROVIDER_CLIENT_PATH = 'src/utils/api/provider-client.js';
const EXPECTED_IMPORT =
  "import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from '../endpoint-policy.js';";

const source = readFileSync(join(root, PROVIDER_CLIENT_PATH), 'utf8');

const endpointPolicyImports = () =>
  source.replace(/\r\n/g, '\n').split('\n')
    .filter((l) => l.includes("'../endpoint-policy.js'"));

test('provider-client.js imports only the endpoint-policy helpers it uses', () => {
  const lines = endpointPolicyImports();
  assert.equal(lines.length, 1, 'provider-client.js must have exactly one endpoint-policy import');
  assert.equal(lines[0], EXPECTED_IMPORT, 'the import must not carry dead isBlocked* bindings');
});

test('the used helpers stay imported', () => {
  const line = endpointPolicyImports()[0];
  for (const name of ['isSpecialUseAddress', 'isSpecialUseHostname', 'isInsecureHttpEndpoint']) {
    assert.ok(line.includes(name), `${name} must remain imported`);
  }
});

test('the dead bindings resolve only from the policy module itself', () => {
  for (const name of ['isBlockedIPv4', 'isBlockedIPv6']) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${name}\\b`),
      `provider-client.js must not reference ${name}`
    );
  }
});
