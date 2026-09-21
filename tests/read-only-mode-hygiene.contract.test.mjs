// Source-gate pin for tests/read-only-mode.browser.test.mjs: the browser harness
// navigates directly via page.goto(), so the open() helper (and its ATLAS_MINIMAL_YAML
// body) copied from browser-e2e.mjs was dead code and lint-flagged no-unused-vars.
//
// Source-text level (mirrors tests/provider-client-imports.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGET_PATH = 'tests/read-only-mode.browser.test.mjs';

const source = readFileSync(join(root, TARGET_PATH), 'utf8')
  .replace(/\r\n/g, '\n');

test('read-only-mode.browser.test.mjs must not re-declare the dead open() helper', () => {
  assert.doesNotMatch(source, /async function open\(/, 'the unused open() helper must stay deleted');
});

test('read-only-mode.browser.test.mjs must not carry the orphaned ATLAS_MINIMAL_YAML body', () => {
  assert.doesNotMatch(source, /\bATLAS_MINIMAL_YAML\b/, 'ATLAS_MINIMAL_YAML lived only inside open() and must stay deleted');
});