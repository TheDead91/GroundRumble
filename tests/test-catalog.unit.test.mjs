import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  filterTests,
  getTestFilterOptions,
  getTestSortIndicator,
  indexTestCatalog,
  projectEnabledTests,
  sortTests,
} from '../src/utils/test-catalog.js';

const presets = [
  { id: 'shared', name: 'Preset Shadow', techniqueId: 'AML.1', techniqueName: 'One', origin: 'Preset' },
  { id: 'preset', name: 'Bravo', techniqueId: 'AML.2', techniqueName: 'Two', origin: ' Preset ' },
];
const auto = [
  { id: 'shared', name: 'Auto Shadow', techniqueId: 'AML.1', techniqueName: 'One', origin: 'Auto' },
  { id: 'auto', name: 'alpha', techniqueId: 'AML.3', techniqueName: 'Three', origin: 'Auto' },
];
const custom = [
  { id: 'shared', name: 'Zulu Custom', techniqueId: 'AML.9', techniqueName: 'Override Probe', origin: 'User' },
  { id: 'custom', name: '', techniqueId: '', techniqueName: 'Empty Fields', origin: '' },
];
const disabledIds = ['shared', 'auto'];

test('Indexing preserves key order while custom records win collisions', () => {
  const indexed = indexTestCatalog(presets, auto, custom);
  assert.equal(Object.getPrototypeOf(indexed), Object.prototype);
  assert.equal(indexed.shared, custom[0]);
  assert.deepEqual(Object.keys(indexed), ['shared', 'preset', 'auto', 'custom']);
  assert.deepEqual(Object.values(indexed).map((item) => item.id), ['shared', 'preset', 'auto', 'custom']);
});

test('Enabled projection excludes disabled ids without mutating the complete catalog', () => {
  const complete = Object.values(indexTestCatalog(presets, auto, custom));
  const enabled = projectEnabledTests(complete, new Set(disabledIds));
  assert.deepEqual(enabled.map((item) => item.id), ['preset', 'custom']);
  assert.deepEqual(complete.map((item) => item.id), ['shared', 'preset', 'auto', 'custom']);
  assert.equal(complete[0], custom[0]);
});

test('Sorting is non-mutating and keeps name, technique, source, and direction behavior', () => {
  const complete = Object.values(indexTestCatalog(presets, auto, custom));
  assert.deepEqual(sortTests(complete, 'name', 'asc').map((item) => item.id), ['custom', 'auto', 'preset', 'shared']);
  assert.deepEqual(sortTests(complete, 'techniqueId', 'desc').map((item) => item.id), ['shared', 'auto', 'preset', 'custom']);
  assert.deepEqual(sortTests(complete, 'source', 'asc').map((item) => item.id), ['custom', 'preset', 'auto', 'shared']);
  assert.deepEqual(sortTests(complete, 'unknown', 'desc').map((item) => item.id), ['shared', 'preset', 'auto', 'custom']);
  assert.deepEqual(complete.map((item) => item.id), ['shared', 'preset', 'auto', 'custom']);
});

test('Sorting tolerates records that are missing the sort field on either side', () => {
  const bare = [{ id: 'x' }, { id: 'y' }];
  for (const key of ['name', 'techniqueId', 'source']) {
    assert.deepEqual(sortTests(bare, key, 'asc').map((item) => item.id), ['x', 'y'],
      `${key} sort keeps input order when every record lacks the field`);
    assert.deepEqual(sortTests(bare, key, 'desc').map((item) => item.id), ['x', 'y']);
  }
  // A present value still sorts against a missing field (treated as '').
  assert.deepEqual(sortTests([{ id: 'missing' }, { id: 'named', name: 'Alpha' }], 'name', 'asc').map((item) => item.id), ['missing', 'named']);
});

test('Filters reject records that do not match technique or source constraints', () => {
  const complete = Object.values(indexTestCatalog(presets, auto, custom));
  assert.deepEqual(filterTests(complete, '', 'all', 'AML.2', 'all', disabledIds).map((item) => item.id), ['preset'],
    'a technique filter excludes every record whose techniqueId differs');
  assert.deepEqual(filterTests(complete, 'Zulu', 'Auto', 'all', 'all', disabledIds), [],
    'a source filter excludes every record whose origin differs');
  assert.deepEqual(filterTests([{ id: 'no-origin', name: 'Orphan', techniqueName: 'Probe' }], 'orphan', 'all', 'all', 'all', []).map((item) => item.id), ['no-origin'],
    'the search haystack tolerates a record with no origin');
});

test('Filter options trim, deduplicate, omit blanks, and sort', () => {
  const complete = Object.values(indexTestCatalog(presets, auto, custom));
  assert.deepEqual(getTestFilterOptions(complete), {
    sources: ['Auto', 'Preset', 'User'],
    techniques: ['AML.2', 'AML.3', 'AML.9'],
  });
});

test('Query, source, technique, and enabled filters compose in input order', () => {
  const sorted = sortTests(Object.values(indexTestCatalog(presets, auto, custom)), 'name', 'asc');
  assert.deepEqual(filterTests(sorted, ' override PROBE ', 'User', 'AML.9', 'disabled', disabledIds).map((item) => item.id), ['shared']);
  assert.deepEqual(filterTests(sorted, '', 'all', 'all', 'disabled', disabledIds).map((item) => item.id), ['auto', 'shared']);
  assert.deepEqual(filterTests(sorted, '', 'all', 'all', 'enabled', disabledIds).map((item) => item.id), ['custom', 'preset']);
  assert.deepEqual(filterTests(sorted, '', 'Preset', 'all', 'all', disabledIds), [],
    'source options are trimmed but matching remains exact for compatibility');
  assert.deepEqual(sorted.map((item) => item.id), ['custom', 'auto', 'preset', 'shared']);
});

test('Sort indicators preserve exact arrows and leading spaces', () => {
  assert.equal(getTestSortIndicator('name', 'name', 'asc'), ' ↑');
  assert.equal(getTestSortIndicator('name', 'name', 'desc'), ' ↓');
  assert.equal(getTestSortIndicator('source', 'name', 'asc'), '');
});

test('TestsProvider delegates pure decisions without changing memo boundaries or value keys', () => {
  const context = readFileSync(new URL('../src/context/TestsContext.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(context, /from '\.\.\/utils\/test-catalog'/);
  for (const call of [
    'indexTestCatalog(PRESET_TESTS, autoTests, customTests)',
    'projectEnabledTests(allTestsWithDisabled, disabledSet)',
    'sortTests(allTestsWithDisabled, testSortKey, testSortDir)',
    'getTestFilterOptions(allTestsWithDisabled)',
    'filterTests(sortedTests, testFilterQ, testFilterSource, testFilterTechnique, testFilterEnabled, disabledTestIds)',
    'getTestSortIndicator(key, testSortKey, testSortDir)',
  ]) assert.ok(context.includes(call), `TestsProvider delegates through ${call}`);
  for (const boundary of [
    ', [autoTests, customTests]);',
    '[allTestsById]);',
    '[allTestsWithDisabled, disabledSet]);',
    '[allTestsWithDisabled, testSortKey, testSortDir]);',
    '[allTestsWithDisabled]);',
    '[sortedTests, testFilterQ, testFilterSource, testFilterTechnique, testFilterEnabled, disabledTestIds]);',
  ]) assert.ok(context.includes(boundary), `memo dependency boundary survives: ${boundary}`);
  const valueStart = context.indexOf('const value = {');
  const value = context.slice(valueStart, context.indexOf('};', valueStart));
  for (const key of ['allTestsById', 'allTestsWithDisabled', 'allTests', 'sortedTests', 'testFilterOptions', 'filteredSortedTests', 'testSortIndicator']) {
    assert.match(value, new RegExp(`\\b${key}\\b`), `public context value retains ${key}`);
  }
  assert.ok(context.split('\n').length < 444, 'TestsContext becomes strictly smaller than its 444-line baseline');
});

test('The extracted utility is dependency-free and has no React or context reach', () => {
  const source = readFileSync(new URL('../src/utils/test-catalog.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(source, /React|useMemo|useContext|TestsContext|localStorage/);
});
