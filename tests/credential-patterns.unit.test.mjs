import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIGH_ENTROPY_TOKEN_PATTERN, PROVIDER_TOKEN_PATTERN } from '../src/utils/credential-patterns.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const patternsSource = source('src/utils/credential-patterns.js');
const providerSource = source('src/utils/providerSecret.js');
const redactSource = source('src/utils/redact.js');

test('Shared token primitives have one dependency-free definition', () => {
  assert.equal(
    PROVIDER_TOKEN_PATTERN,
    String.raw`\b(?:sk-|sk-ant-|gsk_|hf_|AIza|ya29\.|ghp_|gho_|github_pat_|glpat-|AKIA|SG\.|xoxb-|xai-|pplx-|rk-|kv-|sk_live_|sk_test_|whsec_|v1\.public\.|NQ-)[A-Za-z0-9_.-]+`
  );
  assert.equal(HIGH_ENTROPY_TOKEN_PATTERN, String.raw`\b[A-Za-z0-9+/=_-]{40,}\b`);
  assert.doesNotMatch(patternsSource, /^import\s/m, 'primitive module has no dependencies');
  assert.equal((patternsSource.match(/PROVIDER_TOKEN_PATTERN\s*=/g) || []).length, 1);
  assert.equal((patternsSource.match(/HIGH_ENTROPY_TOKEN_PATTERN\s*=/g) || []).length, 1);
  assert.doesNotMatch(providerSource, /\(\?:sk-\|sk-ant-\|gsk_/);
  assert.doesNotMatch(redactSource, /\(\?:sk-\|sk-ant-\|gsk_/);
  assert.equal(providerSource.includes(String.raw`\b[A-Za-z0-9+/=_-]{40,}\b`), false);
  assert.equal(redactSource.includes(String.raw`\b[A-Za-z0-9+/=_-]{40,}\b`), false);
});

test('Consumers own their flags, labels, and replacements', () => {
  assert.match(providerSource, /import \{ HIGH_ENTROPY_TOKEN_PATTERN, PROVIDER_TOKEN_PATTERN \} from '\.\/credential-patterns\.js';/);
  assert.match(providerSource, /const KEY_PREFIX_RE = new RegExp\(PROVIDER_TOKEN_PATTERN\);/);
  assert.match(providerSource, /const HIGH_ENTROPY_RE = new RegExp\(HIGH_ENTROPY_TOKEN_PATTERN\);/);
  assert.match(providerSource, /const SECRET_LABEL_RE = \/\\b\(\?:api/);
  assert.match(providerSource, /const textCarriesSecret = \(text\) =>/);

  assert.match(redactSource, /const PROVIDER_TOKEN_RE = new RegExp\(PROVIDER_TOKEN_PATTERN, 'g'\);/);
  assert.match(redactSource, /const HIGH_ENTROPY_TOKEN_RE = new RegExp\(HIGH_ENTROPY_TOKEN_PATTERN, 'g'\);/);
  assert.match(redactSource, /\.replace\(PROVIDER_TOKEN_RE, '\[REDACTED_KEY\]'\)/);
  assert.match(redactSource, /\.replace\(HIGH_ENTROPY_TOKEN_RE, '\[REDACTED_HIGH_ENTROPY\]'\)/);
  assert.match(redactSource, /\[REDACTED_AUTH\]/);
  assert.match(redactSource, /export const redactNotificationText =/);
});

test('Shared sources preserve case-sensitive and boundary semantics', () => {
  const provider = new RegExp(PROVIDER_TOKEN_PATTERN);
  const entropy = new RegExp(HIGH_ENTROPY_TOKEN_PATTERN);
  assert.equal(provider.test('prefix sk-abcdef suffix'), true);
  assert.equal(provider.test('prefix SK-abcdef suffix'), false);
  assert.equal(provider.test('ask-abcdef'), false);
  assert.equal(entropy.test('a'.repeat(39)), false);
  assert.equal(entropy.test('a'.repeat(40)), true);
});
