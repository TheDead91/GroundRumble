import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { useLayoutEffect, useState } from 'react';
import { mountComponent, button, click, fill } from './helpers/react-harness.mjs';
import { makeTest } from './fixtures/audit-factory.mjs';

const { default: Results, AiGenWizardResultsFooter: Footer } = await import('../src/components/modals/AiGenWizardResults.jsx');
const { AIGenContext } = await import('../src/context/AIGenContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { SettingsContext } = await import('../src/context/SettingsContext.jsx');

function fixture(initial = {}, props = {}, provider = {}) {
  const calls = [];
  let state;
  const generated = makeTest({ sourceTitle: 'Research', sourceReasoning: 'Relevant evidence', sourceExtract: 'quoted payload' });
  function Harness() {
    const [value, setValue] = useState({
      aiWizardStep: 'running', aiWizardError: '', aiGenerating: false, aiGenStage: 'generating',
      aiGenStageDetail: 'One source', aiGenProgress: 50, aiGenMode: 'deep', aiGenElapsed: 3,
      aiDraft: { tests: [generated], failures: 1 }, aiProfileEdits: {}, aiProfileExpanded: {},
      aiFineTune: 'Shorter payloads', aiRefining: false, aiUsedGuidance: 'Use evidence',
      aiRunCtxRef: { current: { sources: [] } }, ...initial,
    });
    useLayoutEffect(() => { state = value; }, [value]);
    const context = { ...value };
    for (const key of [...Object.keys(value), 'aiWizardOpen', 'aiSourceProfiles']) {
      context[`set${key[0].toUpperCase()}${key.slice(1)}`] = update => setValue(prev => ({ ...prev, [key]: typeof update === 'function' ? update(prev[key]) : update }));
    }
    const actions = {};
    for (const action of ['cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests', 'toggleAiPreviewItem', 'runAiGeneration', 'startAiGeneration', 'confirmAiPreview', 'setAiPreview', 'setAiPreviewSelected']) {
      actions[action] = (...args) => calls.push([action, ...args]);
    }
    const input = { ...actions, aiPreview: { tests: [generated] }, aiPreviewSelected: new Set([generated.id]), ...props };
    return React.createElement(ProvidersContext.Provider, { value: { vaultLocked: false, providerLabel: id => id, ...provider } },
      React.createElement(SettingsContext.Provider, { value: { effectiveGenConfig: { provider: 'provider', model: 'generator' } } },
        React.createElement(AIGenContext.Provider, { value: context },
          React.createElement(Results, input), React.createElement(Footer, input))));
  }
  return { Harness, calls, get state() { return state; } };
}

test('WizardResults_FailedGeneration_ShowsErrorAndRetriesWithOriginalGuidance', async t => {
  // Arrange
  const f = fixture({ aiWizardError: 'Provider quota exhausted' });
  const { container } = await mountComponent(t, f.Harness);
  // Act
  const message = container.textContent;
  await click(button(container, 'Retry'));
  // Assert
  assert.match(message, /Generation failed/);
  assert.match(message, /Provider quota exhausted/);
  assert.doesNotMatch(message, /Elapsed:/);
  assert.deepEqual(f.calls, [['startAiGeneration', 'Use evidence']]);
});

for (const [stage, label] of [['analyzing', 'Analyzing sources…'], ['generating', 'Generating test payloads…'], ['critiquing', 'Critiquing & refining tests…']]) {
  test(`WizardResults_${stage}_DisplaysProgressAndCancels`, async t => {
    // Arrange
    const f = fixture({ aiGenerating: true, aiGenStage: stage });
    const { container } = await mountComponent(t, f.Harness);
    // Act
    const message = container.textContent;
    await click(button(container, 'Back'));
    // Assert
    assert.ok(message.includes(label));
    assert.match(message, /50%/);
    assert.match(message, /Elapsed: 3s/);
    assert.equal(f.calls[0][0], 'cancelAiGeneration');
  });
}

test('WizardResults_EditableProfiles_ClampsWeightAndPreservesOtherVectors', async t => {
  // Arrange
  const f = fixture({
    aiWizardStep: 'profiles', aiProfileExpanded: { research: true },
    aiRunCtxRef: { current: { sources: [{ key: 'research', title: 'Research' }, { key: 'raw', title: 'Unanalyzed' }] } },
    aiProfileEdits: { research: { vulnerabilityClass: 'Injection', weight: 2, vectors: [{ name: 'Original', techniqueId: 'AML.T0034' }] } },
  });
  const { container } = await mountComponent(t, f.Harness);
  // Act
  await fill(container.querySelector('input[type="number"]'), '99');
  await click(button(container, 'Vector'));
  await fill(container.querySelectorAll('input[placeholder="Vector name"]')[1], 'Second vector');
  await click(button(container, 'Continue to generation'));
  // Assert
  assert.equal(f.state.aiProfileEdits.research.weight, 3);
  assert.deepEqual(f.state.aiProfileEdits.research.vectors.map(v => v.name), ['Original', 'Second vector']);
  assert.deepEqual(f.state.aiSourceProfiles, f.state.aiProfileEdits);
  assert.match(container.textContent, /No profile — raw content/);
  assert.equal(f.calls[0][0], 'runAiGeneration');
});

test('WizardResults_DraftEdit_UpdatesOnlySelectedTestAndNormalizesKeywords', async t => {
  // Arrange
  const second = makeTest({ id: 'case-2', name: 'Keep this test' });
  const f = fixture({ aiWizardStep: 'draft', aiDraft: { tests: [makeTest(), second], failures: 1 } });
  const { container } = await mountComponent(t, f.Harness);
  // Act
  await fill(container.querySelector('input[placeholder="Test name"]'), 'Edited test');
  await fill(container.querySelector('input[placeholder="Fail keywords (comma-separated)"]'), ' leak, , token ');
  await click(button(container, 'Refine & finish'));
  // Assert
  assert.equal(f.state.aiDraft.tests[0].name, 'Edited test');
  assert.deepEqual(f.state.aiDraft.tests[0].failKeywords, ['leak', 'token']);
  assert.deepEqual(f.state.aiDraft.tests[1], second);
  assert.match(container.textContent, /1 generation call\(s\) failed/);
  assert.deepEqual(f.calls, [['finalizeAiDraft', true]]);
});

test('WizardResults_EmptyDraft_DisplaysRecoveryAndReturnsToFastConfig', async t => {
  // Arrange
  const f = fixture({ aiWizardStep: 'draft', aiGenMode: 'fast', aiDraft: { tests: [], failures: 0 } });
  const { container } = await mountComponent(t, f.Harness);
  const message = container.textContent;
  // Act
  // The real modal switches bodies on step change; test the callback separately
  // by observing state through the provider and retaining a non-null preview.
  await click(button(container, 'Back'));
  // Assert
  assert.match(message, /No tests were generated/);
  assert.equal(f.state.aiWizardStep, 'config');
  assert.doesNotMatch(message, /Refine & finish/);
});

for (const [scenario, state, provider] of [
  ['BlankGuidance', { aiFineTune: '   ' }, {}],
  ['LockedVault', {}, { vaultLocked: true }],
  ['AlreadyRefining', { aiRefining: true }, {}],
]) {
  test(`WizardResults_${scenario}_DisablesRefinement`, async t => {
    // Arrange
    const f = fixture({ aiWizardStep: 'results', ...state }, {}, provider);
    const { container } = await mountComponent(t, f.Harness);
    const action = button(container, state.aiRefining ? 'Refining…' : 'Refine with AI');
    // Act
    await click(action);
    // Assert
    assert.equal(action.disabled, true);
    assert.deepEqual(f.calls, []);
  });
}

test('WizardResults_PreviewSelection_DelegatesSelectionAndCommit', async t => {
  // Arrange
  const f = fixture({ aiWizardStep: 'results' });
  const { container } = await mountComponent(t, f.Harness);
  // Act
  await click(container.querySelector('input[type="checkbox"]'));
  await click(button(container, 'Add Selected (1)'));
  // Assert
  assert.match(container.textContent, /Source: Research/);
  assert.match(container.textContent, /quoted payload/);
  assert.deepEqual(f.calls[0], ['toggleAiPreviewItem', 'case-1']);
  assert.equal(f.calls[1][0], 'confirmAiPreview');
});
