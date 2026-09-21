import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent, click, button, fill } from './helpers/react-harness.mjs';
const { TestsProvider, useTests } = await import('../src/context/TestsContext.jsx');
const { UIProvider } = await import('../src/context/UIContext.jsx');
const { useUI } = await import('../src/context/useUI.js');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { AIGenContext } = await import('../src/context/AIGenContext.jsx');
const { TestsView } = await import('../src/components/views/TestsView.jsx');
const { CustomTestFormModal } = await import('../src/components/modals/CustomTestFormModal.jsx');
const { ConfirmDialog } = await import('../src/components/ConfirmDialog.jsx');

async function choose(element, value) {
  await act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

async function catalog(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let tests, ui;
  function Content() {
    const currentTests = useTests(), currentUI = useUI();
    useLayoutEffect(() => { tests = currentTests; ui = currentUI; });
    const [aiGenCollapsed, setAiGenCollapsed] = useState(false);
    const [testsCollapsed, setTestsCollapsed] = useState(false);
    const [expandedSourceIds, setExpandedSourceIds] = useState(new Set());
    const [aiGenUrls, setUrls] = useState(options.sources || []);
    const ai = { aiGenCollapsed, setAiGenCollapsed, testsCollapsed, setTestsCollapsed, expandedSourceIds,
      toggleSourceExpanded: id => setExpandedSourceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
      aiGenUrls, aiGenSourceKeys: [], aiSourceProfiles: {}, aiGeneratedCount: 2 };
    return React.createElement(ProvidersContext.Provider, { value: { vaultLocked: !!options.locked, vaultPassphraseSet: !!options.locked } },
      React.createElement(AIGenContext.Provider, { value: ai },
        React.createElement(TestsView, { recentlyGeneratedIds: [], effectiveGenConfig: {}, renderActiveModelChip: () => null,
          removeAiGenUrl: id => setUrls(prev => prev.filter(source => source.id !== id)) }),
        React.createElement(CustomTestFormModal),
        React.createElement(ConfirmDialog, { confirmState: currentUI.confirmState && { ...currentUI.confirmState, inputValue: currentUI.dialogInput },
          setConfirmState: update => currentUI.setDialogInput(update({ inputValue: currentUI.dialogInput }).inputValue), resolveDialog: currentUI.resolveDialog })));
  }
  function Harness() { return React.createElement(UIProvider, null, React.createElement(TestsProvider, null, React.createElement(Content))); }
  const view = await mountComponent(t, Harness);
  return { ...view, get tests() { return tests; }, get ui() { return ui; } };
}

test('custom payload form saves every field, edits in place, and cancellation discards edits', async t => {
  const f = await catalog(t);
  await click(button(f.container, 'Add Custom Test'));
  const form = f.container.querySelector('form');
  const inputs = form.querySelectorAll('input');
  const values = ['Unique injection', 'AML.T0051', 'Prompt injection', ' secret, leaked ', ' cannot, refused '];
  for (let i = 0; i < values.length; i++) await fill(inputs[i], values[i]);
  const areas = form.querySelectorAll('textarea');
  for (const [i, value] of ['Threat rationale', 'Keep credentials private', 'Reveal credentials'].entries()) await fill(areas[i], value);
  await choose(form.querySelector('select'), 'Exfiltration');
  await click(button(form, 'Save Payload'));
  assert.equal(f.container.querySelector('form'), null);
  const saved = f.tests.customTests[0];
  assert.equal(saved.name, values[0]);
  assert.equal(saved.techniqueId, values[1]);
  assert.equal(saved.techniqueName, values[2]);
  assert.equal(saved.tactic, 'Exfiltration');
  assert.equal(saved.description, 'Threat rationale');
  assert.equal(saved.systemPrompt, 'Keep credentials private');
  assert.equal(saved.userPrompt, 'Reveal credentials');
  assert.deepEqual(saved.failKeywords, ['secret', 'leaked']);
  assert.deepEqual(saved.refusalKeywords, ['cannot', 'refused']);
  assert.ok(f.tests.selectedTests.includes(saved.id));
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_custom_tests')), [saved]);
  await fill(f.container.querySelector('[placeholder="Search name, technique, source…"]'), 'Unique injection');
  await click(f.container.querySelector('[title="Edit test"]'));
  assert.match(f.container.textContent, /Edit test payload/);
  await fill(f.container.querySelector('form input'), 'Revised injection');
  await click(button(f.container, 'Update Test'));
  assert.equal(f.tests.customTests.length, 1);
  assert.equal(f.tests.customTests[0].id, saved.id);
  assert.equal(f.tests.customTests[0].name, 'Revised injection');
  await fill(f.container.querySelector('[placeholder="Search name, technique, source…"]'), 'Revised');
  await click(f.container.querySelector('[title="Edit test"]'));
  await fill(f.container.querySelector('form input'), 'Discard this');
  await click(button(f.container, 'Cancel'));
  assert.equal(f.tests.editingTestId, null);
  assert.equal(f.tests.customTests[0].name, 'Revised injection');
});

test('catalog remove cancellation, removal, filtering and restoration preserve the enabled suite', async t => {
  const f = await catalog(t);
  const id = f.tests.filteredSortedTests[0].id;
  await click(f.container.querySelector('[title="Remove test"]'));
  await click(button(f.container, 'Cancel'));
  assert.ok(f.tests.allTests.some(test => test.id === id));
  await click(f.container.querySelector('[title="Remove test"]'));
  await click(button(f.container, 'Confirm'));
  assert.ok(!f.tests.allTests.some(test => test.id === id));
  assert.ok(!f.tests.selectedTests.includes(id));
  await choose(f.container.querySelectorAll('select')[2], 'disabled');
  assert.equal(f.container.querySelectorAll('tbody tr').length, 1);
  await click(f.container.querySelector('[title="Restore test"]'));
  assert.deepEqual(f.tests.disabledTestIds, []);
  assert.equal(f.container.querySelectorAll('tbody tr').length, 0);
  await choose(f.container.querySelectorAll('select')[2], 'enabled');
  await click(button(f.container, 'Select none'));
  assert.deepEqual(f.tests.selectedTests, []);
  await click(f.container.querySelector('tbody input'));
  assert.deepEqual(f.tests.selectedTests, [id]);
  await click(button(f.container, 'Select all'));
  assert.equal(f.tests.selectedTests.length, f.tests.allTests.length);
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_disabled_tests')), []);
});

test('catalog search, technique/source filters and sortable headers drive actual rows', async t => {
  const f = await catalog(t);
  const testCase = f.tests.filteredSortedTests.find(test => test.origin && test.techniqueId);
  await fill(f.container.querySelector('input[type="text"]'), testCase.name);
  assert.ok(f.tests.filteredSortedTests.some(test => test.id === testCase.id));
  await choose(f.container.querySelectorAll('select')[0], testCase.techniqueId);
  await choose(f.container.querySelectorAll('select')[1], testCase.origin);
  assert.ok(f.tests.filteredSortedTests.every(test => test.techniqueId === testCase.techniqueId && test.origin === testCase.origin));
  for (const [column, key] of [[1, 'name'], [2, 'techniqueId'], [3, 'source']]) {
    await click(f.container.querySelectorAll('th')[column]);
    assert.equal(f.tests.testSortKey, key);
  }
  await click(f.container.querySelectorAll('th')[3]);
  assert.equal(f.tests.testSortDir, 'desc');
  await click(f.container.querySelectorAll('th')[3]);
  assert.equal(f.tests.testSortDir, 'asc');
  await fill(f.container.querySelector('input[type="text"]'), 'nonexistent case');
  assert.equal(f.container.querySelectorAll('tbody tr').length, 0);
});

test('preset apply prunes removed IDs and navigates; delete and restore persist the built-in preset', async t => {
  const f = await catalog(t);
  const first = f.tests.presets[0].testIds[0];
  await act(async () => f.tests.setDisabledTestIds([first]));
  await click(button(f.container, 'Apply'));
  assert.equal(f.ui.activeTab, 'runner');
  assert.ok(!f.tests.selectedTests.includes(first));
  assert.ok(!f.tests.presets[0].testIds.includes(first));
  assert.equal(f.tests.presetFeedback.count, f.tests.selectedTests.length);
  await click(f.container.querySelector('[title="Delete preset"]'));
  await click(button(f.container, 'Confirm'));
  assert.match(f.container.textContent, /No presets yet/);
  await click(button(f.container, 'Restore Default preset'));
  assert.equal(f.tests.presets[0].id, 'default');
  assert.ok(f.tests.presets[0].testIds.includes(first));
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_test_presets')), f.tests.presets);
});

test('catalog collapses persist and custom source disclosure explains weak evidence before removal', async t => {
  const f = await catalog(t, { sources: [{ id: 'paste', kind: 'paste', title: 'Weak evidence', excerpt: 'example', assessment: { status: 'low', summary: 'Low signal', reason: 'No reproducible attack' } }] });
  const expands = f.container.querySelectorAll('[title="Expand source details"]');
  await click(expands[expands.length - 1]);
  assert.match(f.container.textContent, /Pasted content · 7 characters/);
  assert.match(f.container.textContent, /Tests generated from this source may be weak or off-topic/);
  assert.match(f.container.textContent, /No reproducible attack/);
  await click(f.container.querySelector('[title="Remove source"]'));
  assert.doesNotMatch(f.container.textContent, /Weak evidence/);
  for (const [title, storage] of [['AI generation options', 'atlas_ai_gen_collapsed'], ['test cases table', 'atlas_tests_collapsed']]) {
    await click(f.container.querySelector(`[title="Collapse ${title}"]`));
    assert.equal(localStorage.getItem(storage), '1');
    await click(f.container.querySelector(`[title="Expand ${title}"]`));
    assert.equal(localStorage.getItem(storage), '0');
  }
});

test('read-only catalog blocks suite mutations while still allowing local test selection', async t => {
  const f = await catalog(t, { locked: true });
  for (const name of ['Reset Suite', 'Add Custom Test', 'Bulk Import', 'Generate & Review Tests']) assert.equal(button(f.container, name).disabled, true);
  assert.equal(f.container.querySelector('[title="Edit test"]').disabled, true);
  assert.equal(f.container.querySelector('[title="Remove test"]').disabled, true);
  await click(button(f.container, 'Add Custom Test'));
  assert.equal(f.container.querySelector('form'), null);
  await click(button(f.container, 'Select none'));
  assert.deepEqual(f.tests.selectedTests, []);
});
