import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRUSTED_GITHUB_SOURCE_HOSTS,
  classifySourceHost,
  assertPublicSourceUrl,
  redirectFollowPolicy,
} from '../src/utils/source-url-policy.js';

const source = readFileSync(new URL('../src/utils/source-url-policy.js', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../src/utils/api/atlas-sync.js', import.meta.url), 'utf8');

test('The pure source policy module owns the four policy exports', () => {
  for (const name of ['TRUSTED_GITHUB_SOURCE_HOSTS', 'classifySourceHost', 'assertPublicSourceUrl', 'redirectFollowPolicy']) {
    assert.match(source, new RegExp(`export const ${name}\\b`), `${name} is defined by the new owner`);
    assert.doesNotMatch(syncSource, new RegExp(`export const ${name}\\b`), `${name} no longer has a local atlas-sync definition`);
  }
  assert.match(syncSource, /from ['"]\.\.\/source-url-policy\.js['"]/, 'atlas-sync adopts the new owner');
  assert.doesNotMatch(source, /\b(fetch|document|window|localStorage|sessionStorage)\b/, 'the policy owner stays pure and transport-free');
  const imports = source.match(/^import .*;$/gm) || [];
  assert.ok(imports.length <= 1, `the module remains dependency-light (found ${imports.length} imports)`);
  if (imports.length === 1) assert.match(imports[0], /from ['"]\.\/endpoint-policy\.js['"]/, 'the only permitted dependency is endpoint policy');
});

test('Trusted GitHub source hosts and host classification are exact', () => {
  assert.deepEqual([...TRUSTED_GITHUB_SOURCE_HOSTS], [
    'github.com',
    'www.github.com',
    'api.github.com',
    'raw.githubusercontent.com',
    'media.githubusercontent.com',
    'objects.githubusercontent.com',
  ]);

  const cases = [
    ['GITHUB.COM', ''],
    ['8.8.8.8', ''],
    ['127.0.0.1', 'private, local, or reserved'],
    ['10.2.3.4', 'private, local, or reserved'],
    ['2001:4860:4860::8888', ''],
    ['[::1]', 'private, local, or reserved'],
    ['::ffff:192.168.1.1', 'private, local, or reserved'],
    ['example.com', 'hostname cannot be proven public from the browser'],
    ['localhost', 'hostname cannot be proven public from the browser'],
  ];
  assert.deepEqual(cases.map(([host]) => classifySourceHost(host)), cases.map(([, verdict]) => verdict));
});

test('Public source URL validation preserves URL results and exact failures', () => {
  assert.equal(assertPublicSourceUrl('https://github.com/o/r').href, 'https://github.com/o/r');
  assert.equal(assertPublicSourceUrl('http://8.8.8.8:8080/x').hostname, '8.8.8.8');
  assert.equal(assertPublicSourceUrl('http://127.0.0.1/x', { allowPrivate: true }).href, 'http://127.0.0.1/x');

  for (const [value, message] of [
    ['', 'Source URL must be a valid URL.'],
    ['not a url', 'Source URL must be a valid URL.'],
    ['file:///tmp/source', 'Source URL must use HTTP or HTTPS.'],
    ['http://127.0.0.1/x', 'private, local, or reserved source URLs require the guarded proxy or explicit approval for this request.'],
    ['https://example.com/x', 'hostname cannot be proven public from the browser source URLs require the guarded proxy or explicit approval for this request.'],
  ]) {
    assert.throws(() => assertPublicSourceUrl(value), { message });
  }
});

test('Redirect decisions preserve exact shapes and reasons', () => {
  const cases = [
    ['', { allowed: false, reason: 'redirect target is not a valid URL' }],
    ['not a url', { allowed: false, reason: 'redirect target is not a valid URL' }],
    ['data:text/plain,x', { allowed: false, reason: 'redirect target must use HTTP or HTTPS' }],
    ['http://127.0.0.1/admin', { allowed: false, reason: 'private, local, or reserved redirect target' }],
    ['https://example.com/x', { allowed: false, reason: 'hostname cannot be proven public from the browser redirect target' }],
    ['https://raw.githubusercontent.com/o/r/main/a', { allowed: true }],
    ['https://8.8.8.8/x', { allowed: true }],
    ['https://[2001:4860:4860::8888]/x', { allowed: true }],
  ];
  assert.deepEqual(cases.map(([url]) => redirectFollowPolicy(url)), cases.map(([, verdict]) => verdict));
});

test('Malformed and special-use IP forms remain blocked', () => {
  for (const host of ['8.8.8.256', '100.64.0.1', '169.254.1.2', '192.0.2.1', '224.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(classifySourceHost(host), 'private, local, or reserved', host);
  }
});

test('Atlas-sync compatibility-exports the policy API', async () => {
  const atlas = await import('../src/utils/api/atlas-sync.js');
  assert.strictEqual(atlas.TRUSTED_GITHUB_SOURCE_HOSTS, TRUSTED_GITHUB_SOURCE_HOSTS);
  assert.strictEqual(atlas.classifySourceHost, classifySourceHost);
  assert.strictEqual(atlas.assertPublicSourceUrl, assertPublicSourceUrl);
  assert.strictEqual(atlas.redirectFollowPolicy, redirectFollowPolicy);
});
