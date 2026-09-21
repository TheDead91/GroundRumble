import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const app = source('src/App.jsx');
const context = source('src/context/TestsContext.jsx');
let catalog = '';
try { catalog = source('src/utils/test-catalog.js'); } catch { /* catalog module absent */ }
const testsView = source('src/components/views/TestsView.jsx');
const matrixView = source('src/components/views/MatrixView.jsx');
const runnerView = source('src/components/views/RunnerView.jsx');
const auditHook = source('src/hooks/useAuditRun.js');

const count = (text, pattern) => [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))].length;
const valueStart = context.indexOf('const value = {');
const value = valueStart < 0 ? '' : context.slice(valueStart, context.indexOf('};', valueStart));

test('TestsProvider is the sole catalog-state owner and exposes one API', () => {
  const states = [
    'customTests', 'disabledTestIds', 'editingTestId', 'showAddCustom', 'customForm',
    'testSortKey', 'testSortDir', 'testFilterQ', 'testFilterSource',
    'testFilterTechnique', 'testFilterEnabled', 'presets', 'presetFeedback',
  ];
  for (const name of states) {
    assert.equal(count(app, new RegExp(`const \\[${name},`)), 0, `${name} has no App-local state`);
    assert.equal(count(context, new RegExp(`const \\[${name},`)), 1, `${name} is declared once in TestsProvider`);
    assert.match(value, new RegExp(`\\b${name}\\b`), `${name} is exposed by the catalog API`);
  }
  for (const operation of [
    'handleCustomFormChange', 'handleAddCustomTest', 'openEditTest', 'deleteTest',
    'savePresets', 'applyPreset', 'saveCurrentAsPreset', 'removePreset',
  ]) {
    assert.equal(count(app, new RegExp(`const ${operation} = `)), 0, `${operation} is absent from App`);
    assert.equal(count(context, new RegExp(`const ${operation} = `)), 1, `${operation} has one provider definition`);
    assert.match(value, new RegExp(`\\b${operation}\\b`), `${operation} is exposed by TestsContext`);
  }
});

test('Custom-test mutation and persistence semantics are preserved', () => {
  const required = [
    "if (!customForm.name || !customForm.userPrompt)",
    "addToast('Name and Attacker Prompt are required.')",
    'id: editingTestId || `custom_${Date.now()}`',
    "origin: editingTestId ? 'User Edited (overrides original payload)' : 'User Defined Custom Payload'",
    'updated = customTests.map(t => t.id === editingTestId ? newTest : t)',
    'updated = [...customTests, newTest]',
    'setSelectedTests(prev => prev.includes(newTest.id) ? prev : [...prev, newTest.id])',
    "if (await askConfirm('Remove this test from the suite?'))",
    'const updated = disabledTestIds.includes(id) ? disabledTestIds : [...disabledTestIds, id]',
    'if (!persistDisabledTestIds(updated)) return false;',
    'setSelectedTests(prev => prev.filter(tId => tId !== id))',
  ];
  let cursor = -1;
  for (const needle of required) {
    const at = context.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `catalog mutation step remains ordered: ${needle}`);
    cursor = at;
  }
  // Catalog writes are persistence-first through the shared boundary — state
  // commits only after the storage write succeeds.
  assert.match(context, /commitCatalogArray\(CATALOG_KEYS\.customTests, tests, setCustomTests, addToast/);
  assert.ok(count(context, /persistDisabledTestIds\(/) >= 3,
    'disabled-state writes retain all persistence paths through the shared boundary');
});

test('Preset apply/save keeps stale pruning, dialogs, ids, and copy', () => {
  const apply = context.slice(context.indexOf('const applyPreset = '), context.indexOf('const saveCurrentAsPreset = '));
  assert.match(apply, /preset\.testIds\.filter\(id => allTests\.some\(t => t\.id === id\)\)/);
  assert.match(apply, /savePresets\(presets\.map\(p => p\.id === preset\.id \? \{ \.\.\.p, testIds: ids \} : p\)\)/);
  assert.match(apply, /setPresetFeedback\(\{ name: preset\.name, count: ids\.length, ids \}\)/);

  const save = context.slice(context.indexOf('const saveCurrentAsPreset = '), context.indexOf('const removePreset = '));
  assert.match(save, /addToast\('Select at least one test to save as a preset\.'\)/);
  assert.match(save, /await askInput\('Name for this preset \(e\.g\. "Top Injection Attacks"\):'\)/);
  assert.match(save, /await askConfirm\(`A preset named "\$\{name\}" already exists\. Replace it\?`\)/);
  assert.match(save, /\{ id: `\$\{Date\.now\(\)\}`, name, testIds: selectedTests \}/);
  assert.match(save, /addToast\(`Preset "\$\{name\}" saved with \$\{selectedTests\.length\} test\(s\)\.`\)/);
  assert.match(context, /commitCatalogArray\(CATALOG_KEYS\.presets, next, setPresets, addToast/);
});

test('Matrix and Runner consume the shared derived catalog', () => {
  if (catalog) {
    assert.match(context, /indexTestCatalog\(PRESET_TESTS, autoTests, customTests\)/,
      'provider delegates custom-last indexing to the catalog module');
    assert.match(context, /projectEnabledTests\(allTestsWithDisabled, disabledSet\)/,
      'provider delegates enabled projection to the catalog module');
  } else {
    assert.match(context, /\[\.\.\.PRESET_TESTS, \.\.\.autoTests, \.\.\.customTests\]\.forEach/,
      'custom tests retain last-write override precedence');
    assert.match(context, /allTestsWithDisabled\.filter\(t => !disabledSet\.has\(t\.id\)\)/,
      'enabled catalog excludes disabled ids');
  }
  assert.match(matrixView, /return allTests\.filter\(t => t\.techniqueId === techId\);/,
    'Matrix maps techniques from shared allTests');
  assert.match(runnerView, /checked=\{selectedTests\.includes\(test\.id\)\}/,
    'Runner selection retains array membership semantics');
  assert.match(runnerView, /testFilterOptions\.techniques\.map/,
    'Runner filters come from the shared catalog');
  assert.match(auditHook, /selectedTests\.map\(id => allTestsById\[id\]\)\.filter\(Boolean\)/,
    'audit payloads resolve through the shared id map');
  assert.match(testsView, /\{presets\.map\(p => \(/, 'Tests view renders shared presets');
});

test('App has no catalog storage ownership', () => {
  for (const key of ['atlas_custom_tests', 'atlas_disabled_tests', 'atlas_test_presets']) {
    assert.equal(app.includes(key), false, `${key} is absent from App`);
  }
  // The provider owns the keys through the shared persistence-first boundary
  // (CATALOG_KEYS), never via optimistic setItem.
  assert.ok(context.includes('CATALOG_KEYS'), 'the catalog keys are owned by TestsProvider through the shared boundary');
  assert.doesNotMatch(context, /localStorage\.setItem\('(atlas_custom_tests|atlas_disabled_tests|atlas_test_presets)'/, 'no optimistic catalog setItem remains in the provider');
});
