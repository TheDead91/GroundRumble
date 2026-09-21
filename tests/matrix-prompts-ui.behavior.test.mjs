import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { mountComponent, click, button, fill } from './helpers/react-harness.mjs';
const { MatrixView } = await import('../src/components/views/MatrixView.jsx');
const { PromptsView } = await import('../src/components/views/PromptsView.jsx');
const { TestsContext } = await import('../src/context/TestsContext.jsx');
const { SettingsContext } = await import('../src/context/SettingsContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { getPrompt, getPromptOverrides, DEFAULT_PROMPTS } = await import('../src/utils/prompts.js');

test('matrix technique details expose real mitigations, subtechniques and unmapped-technique recovery', async t => {
  const selected = [], deleted = [], run = [], forms = [];
  const techniques = [
    { id: 'AML.T0034', name: 'Injection', description: 'Instructions as data', subtechniques: [{ id: 'AML.T0034.001', name: 'Indirect', description: 'Via a document' }], mitigations: [{ id: 'M1', name: 'Boundaries', description: 'Separate instructions' }] },
    { id: 'AML.T0015', name: 'Evasion' }, { id: 'AML.T0099', name: 'Other' },
  ];
  const custom = { id: 'custom_probe', name: 'Probe', techniqueId: 'AML.T0034', origin: 'User' };
  const values = { allTests: [custom], setSelectedTests: value => run.push(value), setEditingTestId: value => forms.push(['id', value]),
    setCustomForm: update => forms.push(['form', update({ name: 'Unfinished draft' })]), setShowAddCustom: value => forms.push(['open', value]), deleteTest: id => deleted.push(id) };
  function Harness({ matrix, locked = false }) {
    return React.createElement(TestsContext.Provider, { value: values }, React.createElement(SettingsContext.Provider, { value: { atlasMatrix: matrix, atlasSyncStatus: 'Cached matrix' } },
      React.createElement(ProvidersContext.Provider, { value: { vaultLocked: locked, vaultPassphraseSet: locked } }, React.createElement(UIContext.Provider, { value: { setActiveTab: tab => run.push(tab) } },
        React.createElement(MatrixView, { onSelectedTechniqueChange: technique => selected.push(technique?.id || null) })))));
  }
  const matrix = [{ id: 'TA1', name: 'Execution', techniques }];
  const view = await mountComponent(t, Harness, { matrix });
  await click(view.container.querySelector('.technique-card'));
  assert.match(view.container.textContent, /AML.T0034.001: Indirect/);
  assert.match(view.container.textContent, /M1 - Boundaries: Separate instructions/);
  await click(button(view.container, 'Run'));
  assert.deepEqual(run, [['custom_probe'], 'runner']);
  const detail = view.container.querySelector('[data-tour="technique-detail"]');
  await click(detail.querySelectorAll('button')[2]);
  assert.deepEqual(deleted, ['custom_probe']);
  await click(button(view.container, 'Add Prompt'));
  assert.deepEqual(forms, [['id', null], ['form', { name: 'Unfinished draft', techniqueId: 'AML.T0034', techniqueName: 'Injection' }], ['open', true]]);
  await click(detail.querySelector('button'));
  assert.equal(selected.at(-1), null);
  await click(view.container.querySelectorAll('.technique-card')[1]);
  assert.match(view.container.textContent, /Adversarial alignment during training/);
  assert.match(view.container.textContent, /No test prompts mapped/);
  await click(view.container.querySelectorAll('.technique-card')[2]);
  assert.match(view.container.textContent, /Standard system prompt filtering/);
  await view.render({ matrix, locked: true });
  assert.equal(button(view.container, 'Add Prompt').disabled, true);
  await click(view.container.querySelector('[data-tour="technique-detail"] button'));
  await view.render({ matrix: [] });
  assert.match(view.container.textContent, /No matrix loaded yet/);
});

test('prompt editor saves on blur, resets one override and opens AI feedback for the selected key', async t => {
  const updates = [], toasts = [];
  function Harness({ locked = false, configured = true }) {
    const [draft, setDraft] = useState({});
    return React.createElement(PromptsView, { promptDraft: draft, setPromptDraft: setDraft, getPromptOverrides,
      setPromptUpdate: update => updates.push(update), addToast: message => toasts.push(message), vaultLocked: locked, vaultPassphraseSet: locked, judgeConfigured: configured });
  }
  const view = await mountComponent(t, Harness, {});
  const editor = view.container.querySelector('textarea');
  await fill(editor, 'Use explicit evidence before deciding.');
  assert.equal(getPromptOverrides().judge_system, undefined);
  await act(async () => editor.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
  assert.equal(getPrompt('judge_system'), 'Use explicit evidence before deciding.');
  const panel = view.container.querySelector('[data-tour="ai-prompts-judge"]');
  await click(button(panel, 'Update with AI'));
  assert.deepEqual(updates, [{ key: 'judge_system', state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' }]);
  await click(button(panel, 'Reset to default'));
  assert.equal(editor.value, DEFAULT_PROMPTS.judge_system);
  assert.equal(getPromptOverrides().judge_system, undefined);
  assert.deepEqual(toasts, ['Prompt reset to default.']);
  await view.render({ configured: false });
  assert.equal(button(panel, 'Update with AI').disabled, true);
  await view.render({ locked: true });
  assert.ok([...view.container.querySelectorAll('button')].every(node => node.disabled));
});
