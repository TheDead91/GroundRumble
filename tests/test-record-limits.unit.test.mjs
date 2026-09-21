import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as limitExports from '../src/utils/test-record-limits.js';
import {
  IMPORT_LIMITS,
  normalizeRestoredPreset,
  parseBulkTests,
} from '../src/utils/testImporter.js';
import {
  GENERATED_TEST_LIMITS,
  parseTestPayloads,
  validateGeneratedTests,
} from '../src/utils/ai-generator.js';

const limitsSource = readFileSync(new URL('../src/utils/test-record-limits.js', import.meta.url), 'utf8');
const importerSource = readFileSync(new URL('../src/utils/testImporter.js', import.meta.url), 'utf8');
const generatorSource = readFileSync(new URL('../src/utils/ai-generator.js', import.meta.url), 'utf8');
const sharedLimits = {
  maxTests: 500,
  fieldChars: 20_000,
  keywordCount: 100,
  keywordChars: 500,
  aggregateChars: 2_000_000,
};

test('One frozen canonical object owns the five shared limits', () => {
  const commonKeys = Object.keys(sharedLimits);
  const matchingObjects = Object.values(limitExports).filter((value) =>
    value && typeof value === 'object' && Object.keys(value).join() === commonKeys.join());
  const canonicalObjects = [...new Set(matchingObjects)];
  assert.equal(canonicalObjects.length, 1, 'target exports one object identity with exactly the five shared keys');
  assert.deepEqual(canonicalObjects[0], sharedLimits);
  assert.equal(Object.isFrozen(canonicalObjects[0]), true);
  assert.equal(GENERATED_TEST_LIMITS, canonicalObjects[0], 'generator consumes the canonical object by identity');

  for (const [property, literal] of [
    ['maxTests', '500'],
    ['fieldChars', '20_000'],
    ['keywordCount', '100'],
    ['keywordChars', '500'],
    ['aggregateChars', '2_000_000'],
  ]) {
    assert.equal((limitsSource.match(new RegExp(`${property}\\s*:\\s*${literal}`, 'g')) || []).length, 1,
      `${property} has one definition in the canonical module`);
  }
  assert.doesNotMatch(limitsSource, /^\s*import\s/m, 'the limits module is dependency-free');
});

test('Importer and generator adopt the canonical module and shed local definitions', () => {
  assert.match(importerSource, /from ['"]\.\/test-record-limits(?:\.js)?['"]/);
  assert.match(generatorSource, /from ['"]\.\/test-record-limits(?:\.js)?['"]/);
  assert.doesNotMatch(importerSource, /export const IMPORT_LIMITS = Object\.freeze\(\{/);
  assert.doesNotMatch(generatorSource, /export const GENERATED_TEST_LIMITS = Object\.freeze\(\{/);
  for (const property of Object.keys(sharedLimits)) {
    const localDefinition = new RegExp(`${property}\\s*:\\s*(?:500|20_000|100|2_000_000)`);
    assert.doesNotMatch(importerSource, localDefinition, `${property} is not redefined by importer`);
    assert.doesNotMatch(generatorSource, localDefinition, `${property} is not redefined by generator`);
  }
});

test('Public limit exports retain their exact key order, shapes, and immutability', () => {
  assert.deepEqual(IMPORT_LIMITS, { inputChars: 1_000_000, ...sharedLimits });
  assert.deepEqual(GENERATED_TEST_LIMITS, sharedLimits);
  assert.equal(Object.isFrozen(IMPORT_LIMITS), true);
  assert.equal(Object.isFrozen(GENERATED_TEST_LIMITS), true);
  assert.deepEqual(Object.keys(IMPORT_LIMITS), [
    'inputChars', 'maxTests', 'fieldChars', 'keywordCount', 'keywordChars', 'aggregateChars',
  ]);
  assert.deepEqual(Object.keys(GENERATED_TEST_LIMITS), [
    'maxTests', 'fieldChars', 'keywordCount', 'keywordChars', 'aggregateChars',
  ]);
});

test('Importer accepts exact boundaries and preserves bounded content', () => {
  const keyword = 'k'.repeat(IMPORT_LIMITS.keywordChars);
  const result = parseBulkTests(JSON.stringify({
    name: 'n'.repeat(IMPORT_LIMITS.fieldChars),
    userPrompt: 'p'.repeat(IMPORT_LIMITS.fieldChars),
    failKeywords: Array(IMPORT_LIMITS.keywordCount).fill(keyword),
  }));
  assert.equal(result.tests[0].name.length, 20_000);
  assert.equal(result.tests[0].userPrompt.length, 20_000);
  assert.equal(result.tests[0].failKeywords.length, 100);
  assert.equal(result.tests[0].failKeywords.at(-1), keyword);

  const max = Array.from({ length: IMPORT_LIMITS.maxTests }, (_, index) => ({ userPrompt: `p-${index}` }));
  assert.equal(parseBulkTests(JSON.stringify(max)).tests.length, 500);
});

test('Importer rejection messages and preset truncation are byte-compatible', () => {
  assert.throws(
    () => parseBulkTests(JSON.stringify({ userPrompt: 'x'.repeat(IMPORT_LIMITS.fieldChars + 1) })),
    { message: 'userPrompt exceeds the 20000-character import limit.' },
  );
  assert.throws(
    () => parseBulkTests(JSON.stringify({ userPrompt: 'p', failKeywords: Array(101).fill('x') })),
    { message: 'failKeywords exceeds the 100-keyword import limit.' },
  );
  assert.throws(
    () => parseBulkTests(JSON.stringify({ userPrompt: 'p', failKeywords: ['x'.repeat(501)] })),
    { message: 'failKeywords keyword exceeds the 500-character limit.' },
  );
  assert.throws(
    () => parseBulkTests(JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ userPrompt: `p-${i}` })))),
    { message: 'Import exceeds the 500-test limit.' },
  );

  const preset = normalizeRestoredPreset({
    id: 'i'.repeat(250),
    name: 'n'.repeat(550),
    testIds: Array.from({ length: 5_001 }, (_, i) => `${i}-` + 'x'.repeat(220)),
  });
  assert.equal(preset.id.length, 200);
  assert.equal(preset.name.length, 500);
  assert.equal(preset.testIds.length, 5_000);
  assert.equal(preset.testIds.at(-1).length, 200);
});

test('Generator accepts exact boundaries and keeps first duplicate fingerprint', () => {
  const keyword = 'k'.repeat(GENERATED_TEST_LIMITS.keywordChars);
  const [generated] = validateGeneratedTests([{
    candidateId: 'c'.repeat(GENERATED_TEST_LIMITS.fieldChars),
    name: 'n'.repeat(GENERATED_TEST_LIMITS.fieldChars),
    userPrompt: 'p'.repeat(GENERATED_TEST_LIMITS.fieldChars),
    failKeywords: Array(GENERATED_TEST_LIMITS.keywordCount).fill(keyword),
  }]);
  assert.equal(generated.candidateId.length, 20_000);
  assert.equal(generated.name.length, 20_000);
  assert.equal(generated.failKeywords.length, 100);
  assert.equal(generated.failKeywords.at(-1), keyword);

  const prefix = 'a'.repeat(100);
  const deduped = validateGeneratedTests([
    { name: 'first', userPrompt: `${prefix}-first` },
    { name: 'second', userPrompt: `${prefix}-second` },
  ]);
  assert.deepEqual(deduped.map(({ name, userPrompt }) => ({ name, userPrompt })), [
    { name: 'first', userPrompt: `${prefix}-first` },
  ]);
});

test('Generator rejection messages remain byte-compatible at every shared boundary', () => {
  assert.throws(
    () => parseTestPayloads('x'.repeat(GENERATED_TEST_LIMITS.aggregateChars + 1)),
    { message: 'AI response exceeds the 2000000-character limit.' },
  );
  assert.throws(
    () => validateGeneratedTests(Array.from({ length: 501 }, () => ({ name: 'n', userPrompt: 'p' }))),
    { message: 'AI-generated tests exceed the 500-test limit.' },
  );
  assert.throws(
    () => validateGeneratedTests([{ name: 'n', userPrompt: 'x'.repeat(20_001) }]),
    { message: 'userPrompt exceeds the 20000-character limit.' },
  );
  assert.throws(
    () => validateGeneratedTests([{ name: 'n', userPrompt: 'p', failKeywords: Array(101).fill('x') }]),
    { message: 'failKeywords exceeds the 100-keyword limit.' },
  );
  assert.throws(
    () => validateGeneratedTests([{ name: 'n', userPrompt: 'p', failKeywords: ['x'.repeat(501)] }]),
    { message: 'failKeywords keyword exceeds the 500-character limit.' },
  );

  const aggregate = Array.from({ length: 101 }, (_, i) => ({
    name: `n-${i}`,
    userPrompt: `p-${i}`,
    description: 'd'.repeat(20_000),
  }));
  assert.throws(
    () => validateGeneratedTests(aggregate),
    { message: 'AI-generated tests exceed the 2000000-character aggregate limit.' },
  );
});
