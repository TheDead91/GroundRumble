// Post-change coverage for src/utils/provider-endpoint-policy.js (task
// 20260826-014849-mod003 R1.1): the single canonical transport-policy module.
// Replaces the prior characterization baseline, which characterized
// the pre-move copies inside App.jsx / ProvidersContext.jsx.
//
// Pins, in order of severity:
//   - the module's EXACT content (byte-level, trailing newline tolerated),
//   - its export surface (exactly the two predicates) and sole import seam,
//   - the full behavioral truth tables via real ESM imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../src/utils/provider-endpoint-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = 'src/utils/provider-endpoint-policy.js';

// The exact content R1.1 mandates (em-dashes and escape spellings significant).
const EXPECTED_SOURCE = [
  '// Pure transport-policy predicates for user-defined provider endpoints.',
  '// Single canonical copy shared by ProvidersContext (context API surface) and',
  '// any future caller; built on the low-level primitives in endpoint-policy.js.',
  '',
  "import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from './endpoint-policy.js';",
  '',
  '// True when a provider\'s configured endpoint(s) point at a private, loopback,',
  '// or special-use host — i.e. the "allow private/loopback endpoint" approval is',
  '// actually meaningful for it. Public endpoints never need the bypass, so the',
  '// flag is only preserved across a backup import when it is genuinely required.',
  'export const providerNeedsPrivateBypass = (cp) => {',
  '  const requires = (endpoint) => {',
  '    if (!endpoint) return false;',
  "    let host = '';",
  "    try { host = new URL(String(endpoint)).hostname.toLowerCase().replace(/^\\[|\\]$/g, ''); } catch { return false; }",
  '    return isSpecialUseHostname(host) || isSpecialUseAddress(host);',
  '  };',
  '  return requires(cp.endpoint) || requires(cp.modelsEndpoint);',
  '};',
  '',
  '// True when a provider actually speaks plaintext HTTP to a non-local host — the',
  '// configuration for which "allow insecure transport" is meaningful. Public',
  '// HTTPS endpoints never need it, so the flag is only preserved across a backup',
  '// import when it is genuinely required.',
  'export const providerNeedsInsecureTransport = (cp) =>',
  '  isInsecureHttpEndpoint(cp.endpoint) || isInsecureHttpEndpoint(cp.modelsEndpoint);'
].join('\n');

const PRIVATE_BYPASS_TABLE = [
  [{ endpoint: 'https://api.example.com/v1' }, false, 'public HTTPS endpoint needs no bypass'],
  [{ endpoint: 'http://localhost:11434/v1' }, true, 'loopback hostname'],
  [{ endpoint: 'http://127.0.0.1:11434/v1' }, true, 'loopback IPv4'],
  [{ endpoint: 'https://10.0.0.1/v1' }, true, 'private IPv4'],
  [{ endpoint: 'https://192.168.1.10/v1' }, true, 'private IPv4 RFC1918'],
  [{ endpoint: 'http://[::1]:9/v1' }, true, 'bracketed IPv6 loopback literal'],
  [{ endpoint: 'http://[::ffff:127.0.0.1]/v1' }, true, 'bracketed IPv4-mapped IPv6 loopback'],
  [{ endpoint: 'https://printer.local/v1' }, true, '.local mDNS-style hostname'],
  [{ endpoint: 'https://service.internal/v1' }, true, '.internal hostname'],
  [{ endpoint: 'https://api.example.com/v1', modelsEndpoint: 'http://localhost:11434/v1' }, true, 'special-use modelsEndpoint alone forces the bypass'],
  [{ endpoint: 'http://localhost:11434/v1', modelsEndpoint: 'https://api.example.com/v1' }, true, 'special-use endpoint survives a public modelsEndpoint'],
  [{ endpoint: 'https://api.example.com/v1', modelsEndpoint: 'https://api.example.com/models' }, false, 'both endpoints public'],
  [{ endpoint: 'not a url' }, false, 'invalid URL yields false'],
  [{ endpoint: '' }, false, 'empty endpoint yields false'],
  [{}, false, 'missing fields yield false']
];

const INSECURE_TRANSPORT_TABLE = [
  [{ endpoint: 'http://fast-relay.example/v1' }, true, 'cleartext HTTP to a remote host'],
  [{ endpoint: 'https://api.example.com/v1' }, false, 'public HTTPS never needs it'],
  [{ endpoint: 'http://localhost:11434/v1' }, false, 'loopback hostname exempt'],
  [{ endpoint: 'http://127.0.0.1:11434' }, false, 'loopback IPv4 exempt'],
  [{ endpoint: 'http://[::1]:9/v1' }, false, 'IPv6 loopback literal exempt'],
  [{ endpoint: 'ftp://fast-relay.example/v1' }, false, 'non-HTTP protocol ignored'],
  [{ endpoint: 'https://api.example.com/v1', modelsEndpoint: 'http://models.example/v1' }, true, 'cleartext modelsEndpoint alone triggers'],
  [{ endpoint: 'http://api.example.com/v1', modelsEndpoint: 'https://models.example/v1' }, true, 'cleartext endpoint survives an HTTPS modelsEndpoint'],
  [{ endpoint: '', modelsEndpoint: '' }, false, 'empty fields yield false'],
  [{ endpoint: 'not a url' }, false, 'invalid URL yields false'],
  [{}, false, 'missing fields yield false']
];

test('module ships the exact R1.1 content byte-for-byte (trailing newline tolerated)', () => {
  const raw = readFileSync(join(root, MODULE_PATH), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  assert.equal(raw, EXPECTED_SOURCE, `${MODULE_PATH} must match the mandated R1.1 content verbatim`);
});

test('export surface is exactly the two predicates, imported only from ./endpoint-policy.js', () => {
  const source = readFileSync(join(root, MODULE_PATH), 'utf8');
  const exportedNames = [...source.matchAll(/^export\s+const\s+(\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exportedNames, ['providerNeedsInsecureTransport', 'providerNeedsPrivateBypass']);
  const importStatements = [...source.matchAll(/^import[^;]+;/gm)].map((m) => m[0]);
  assert.equal(importStatements.length, 1, 'exactly one import statement');
  assert.match(importStatements[0], /^import \{ isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint \} from '\.\/endpoint-policy\.js';$/, "the sole import must come from './endpoint-policy.js'");
  assert.doesNotMatch(source, /export default/, 'no default export');
});

test('both exports are functions (callable API surface)', () => {
  assert.equal(typeof providerNeedsPrivateBypass, 'function');
  assert.equal(typeof providerNeedsInsecureTransport, 'function');
});

test('providerNeedsPrivateBypass truth table (post-move)', () => {
  for (const [cp, expected, label] of PRIVATE_BYPASS_TABLE) {
    assert.equal(providerNeedsPrivateBypass(cp), expected, `${label} (input: ${JSON.stringify(cp)})`);
  }
});

test('providerNeedsInsecureTransport truth table (post-move)', () => {
  for (const [cp, expected, label] of INSECURE_TRANSPORT_TABLE) {
    assert.equal(providerNeedsInsecureTransport(cp), expected, `${label} (input: ${JSON.stringify(cp)})`);
  }
});

// ── endpoint-policy.js branch coverage: parseIPv6, isBlockedIPv6, host helpers ──
import {
  isBlockedIPv4, isBlockedIPv6, isSpecialUseAddress,
  isSpecialUseHostname, isLocalHostname, isInsecureHttpEndpoint
} from '../src/utils/endpoint-policy.js';

test('isBlockedIPv6 blocks unparseable null/undefined input (parseIPv6 null path)', () => {
  assert.equal(isBlockedIPv6(null), true, 'null → unparseable → blocked');
  assert.equal(isBlockedIPv6(undefined), true, 'undefined → unparseable → blocked');
  assert.equal(isBlockedIPv6(''), true, 'empty string → unparseable → blocked');
  assert.equal(isBlockedIPv6('not-an-ip'), true, 'non-IPv6 string → unparseable → blocked');
});

test('isBlockedIPv6 rejects IPv6 with triple :: separators (parseIPv6 halves > 2)', () => {
  assert.equal(isBlockedIPv6('::1::2'), true, 'three :: groups → null → blocked');
  assert.equal(isBlockedIPv6('a::b::c'), true, 'three :: groups with hex → blocked');
});

test('isBlockedIPv6 rejects IPv6 with invalid IPv4-mapped octets', () => {
  assert.equal(isBlockedIPv6('::ffff:999.0.0.1'), true, 'octet > 255 in IPv4-mapped → blocked');
  assert.equal(isBlockedIPv6('::ffff:256.0.0.1'), true, 'octet 256 → blocked');
  assert.equal(isBlockedIPv6('::ffff:1.2.3.256'), true, 'last octet overflow → blocked');
  assert.equal(isBlockedIPv6('::ffff:abc.0.0.1'), true, 'non-numeric octet → blocked');
});

test('isBlockedIPv6 rejects IPv6 with non-hex segments', () => {
  assert.equal(isBlockedIPv6('gggg::1'), true, 'non-hex group → blocked');
  assert.equal(isBlockedIPv6('12345::1'), true, '5-char hex group → blocked');
  assert.equal(isBlockedIPv6('xyz0::1'), true, 'non-hex chars → blocked');
});

test('isBlockedIPv6 rejects IPv6 with too few or too many segments', () => {
  assert.equal(isBlockedIPv6('1:2:3:4'), true, 'only 4 segments, no :: → blocked');
  assert.equal(isBlockedIPv6('1:2:3'), true, 'only 3 segments, no :: → blocked');
  assert.equal(isBlockedIPv6('1:2:3:4:5:6:7:8::1'), true, '9 segments with :: → blocked');
});

test('isBlockedIPv4 blocks non-IPv4-regex strings', () => {
  assert.equal(isBlockedIPv4('abc'), true, 'non-numeric string → blocked');
  assert.equal(isBlockedIPv4('8.8.8'), true, 'three octets → blocked');
  assert.equal(isBlockedIPv4('8.8.8.8.8'), true, 'five octets → blocked');
});

test('isBlockedIPv4 blocks out-of-range octets (NaN path via ipv4ToInt)', () => {
  assert.equal(isBlockedIPv4('8.8.8.256'), true, 'octet 256 → NaN → blocked');
  assert.equal(isBlockedIPv4('256.0.0.0'), true, 'first octet overflow → blocked');
  assert.equal(isBlockedIPv4('1.2.3.-1'), true, 'negative octet → blocked');
});

test('isSpecialUseAddress handles null/empty host', () => {
  assert.equal(isSpecialUseAddress(null), false, 'null → no IPv4/IPv6 → false');
  assert.equal(isSpecialUseAddress(''), false, 'empty → no IPv4/IPv6 → false');
  assert.equal(isSpecialUseAddress(undefined), false, 'undefined → false');
});

test('isSpecialUseHostname handles null/empty host', () => {
  assert.equal(isSpecialUseHostname(null), false, 'null → false');
  assert.equal(isSpecialUseHostname(''), false, 'empty → false');
  assert.equal(isSpecialUseHostname(undefined), false, 'undefined → false');
});

test('isLocalHostname handles null/empty host', () => {
  assert.equal(isLocalHostname(null), false, 'null → false');
  assert.equal(isLocalHostname(''), false, 'empty → false');
  assert.equal(isLocalHostname(undefined), false, 'undefined → false');
});

test('isInsecureHttpEndpoint handles null/empty endpoint', () => {
  assert.equal(isInsecureHttpEndpoint(null), false, 'null → false');
  assert.equal(isInsecureHttpEndpoint(''), false, 'empty → false');
  assert.equal(isInsecureHttpEndpoint('not-a-url'), false, 'invalid URL → false');
});
