import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent, click, button, fill } from './helpers/react-harness.mjs';
const { RunnerView } = await import('../src/components/views/RunnerView.jsx');
const { TestsProvider, useTests } = await import('../src/context/TestsContext.jsx');
const { AuditContext } = await import('../src/context/AuditContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { HistoryContext } = await import('../src/context/HistoryContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { SettingsContext } = await import('../src/context/SettingsContext.jsx');

const provider = { id: 'p', name: 'Provider', endpoint: 'https://provider.example/v1', connector: 'openai', models: ['one', 'two'] };
async function choose(element, value) {
  await act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
async function setup(t) {
  let tests;
  const calls = [];
  function Content(props) {
    const state = useTests();
    useLayoutEffect(() => { tests = state; });
    const [model, setModel] = useState('one');
    const [selectedProvider, setSelectedProvider] = useState('p');
    const [targets, setTargets] = useState([]);
    return React.createElement(RunnerView, { targets, selectedProvider, setSelectedProvider, selectedModel: model, setSelectedModel: setModel,
      addTarget: () => setTargets(prev => [...prev, { uid: `${prev.length}`, model, provider: selectedProvider }]),
      removeTarget: id => setTargets(prev => prev.filter(target => target.uid !== id)),
      activeModels: provider.models.map(id => ({ id, name: id })), selectedProviderObj: props.manual ? { ...provider, models: [] } : provider,
      providerSelectable: id => id === 'p', renderJudgeSelector: disabled => React.createElement('input', { 'aria-label': 'Judge model', disabled }),
      renderActiveModelChip: label => React.createElement('span', null, label), runSecurityAudit: () => calls.push('run'), stopSecurityAudit: () => calls.push('stop') });
  }
  function Harness({ running = false, stopping = false, logs = [], manual = false, judgeConfig = {} }) {
    const [terminalOpen, setTerminalOpen] = useState(false);
    return React.createElement(UIContext.Provider, { value: { terminalOpen, setTerminalOpen, addToast: message => calls.push(message) } },
      React.createElement(ProvidersContext.Provider, { value: { providers: [provider], syncProviderModels: value => calls.push(value), providerLabel: id => id } },
        React.createElement(SettingsContext.Provider, { value: { useDemoMode: false, judgeConfig } },
          React.createElement(HistoryContext.Provider, { value: {} }, React.createElement(AuditContext.Provider, { value: { running, stopping, progress: 45, currentTestName: 'Secret probe', consoleLogs: logs, results: [] } },
            React.createElement(TestsProvider, null, React.createElement(Content, { manual })))))));
  }
  const view = await mountComponent(t, Harness, {});
  return { ...view, calls, get tests() { return tests; } };
}

test('runner model selection, refresh and removal operate on the selected lineup entry', async t => {
  const f = await setup(t);
  const lineup = f.container.querySelector('[data-tour="runner-lineup"]');
  await choose(lineup.querySelectorAll('select')[1], 'two');
  await click(button(lineup, 'Add to Comparison'));
  assert.match(lineup.textContent, /Comparison Lineup \(1\).*two/);
  await click(lineup.querySelector('[title="Fetch models from endpoint"]'));
  assert.equal(f.calls[0], provider);
  await click([...lineup.querySelectorAll('button')].find(node => node.querySelector('.lucide-x')));
  assert.match(lineup.textContent, /No models added yet/);
  await f.render({ manual: true });
  await fill(lineup.querySelector('[placeholder="e.g. gpt-4o"]'), 'manual-model');
  await click(button(lineup, 'Add to Comparison'));
  assert.match(lineup.textContent, /Comparison Lineup \(1\).*manual-model/);
  await click(lineup.querySelector('[title="Fetch models from endpoint"]'));
  assert.deepEqual(f.calls[1], { ...provider, models: [] });
});

test('runner presets and filters affect visible payloads without losing the underlying selection', async t => {
  const f = await setup(t);
  const panel = f.container.querySelector('[data-tour="payload-selection"]');
  await click(button(panel, 'Clear All'));
  assert.deepEqual(f.tests.selectedTests, []);
  await choose(panel.querySelector('[data-tour="preset-select"]'), 'default');
  assert.deepEqual(f.tests.selectedTests, f.tests.presets[0].testIds);
  assert.equal(panel.querySelector('[data-tour="preset-select"]').value, '');
  assert.match(panel.textContent, /Applied "Default"/);
  const chosen = f.tests.allTests[0];
  await fill(panel.querySelector('input[type="text"]'), chosen.name);
  await choose(panel.querySelectorAll('select')[1], chosen.techniqueId);
  assert.ok(panel.querySelectorAll('input[type="checkbox"]').length > 0);
  await click(panel.querySelector('input[type="checkbox"]'));
  assert.ok(!f.tests.selectedTests.includes(chosen.id));
  await fill(panel.querySelector('input[type="text"]'), 'no such payload');
  assert.equal(panel.querySelectorAll('input[type="checkbox"]').length, 0);
  await click(button(panel, 'Select All'));
  assert.equal(f.tests.selectedTests.length, f.tests.allTests.length, 'Select All includes payloads outside the current view filter');
  await click(button(f.container, 'AI Judge'));
  assert.equal(localStorage.getItem('atlas_eval_mode'), 'judge');
  assert.equal(f.container.querySelector('[aria-label="Judge model"]').disabled, false);
  await click(button(f.container, 'Heuristic Keywords'));
  assert.equal(localStorage.getItem('atlas_eval_mode'), 'keywords');
  assert.equal(f.container.querySelector('[aria-label="Judge model"]').disabled, true);
});

test('runner active and stopping states prevent duplicate commands and console controls show diagnostic errors', async t => {
  const f = await setup(t);
  await click(button(f.container, 'Show Console'));
  assert.match(f.container.textContent, /Console idle/);
  await click(button(f.container, 'Run Comparison Audit'));
  assert.deepEqual(f.calls, ['run']);
  await f.render({ running: true, logs: ['✓ Connected', 'Evaluation: pending', '✗ ERROR provider failed', 'Verdict: VULNERABLE'] });
  assert.equal(f.container.querySelector('[data-testid="audit-run"]').disabled, true);
  assert.match(f.container.textContent, /Progress: 45%/);
  assert.match(f.container.textContent, /Heuristic Keywords \(offline\)/);
  assert.match(f.container.querySelector('[data-tour="show-console"]').textContent, /1 errors/);
  assert.equal(f.container.querySelector('[data-tour="add-target"] select').disabled, true);
  assert.ok([...f.container.querySelectorAll('input[type="checkbox"]')].every(node => node.disabled));
  await click(button(f.container, 'Stop Audit'));
  await f.render({ running: true, stopping: true });
  await click(button(f.container, 'Stopping…'));
  assert.deepEqual(f.calls, ['run', 'stop']);
  await click(button(f.container, 'AI Judge'));
  assert.match(f.container.textContent, /Judge: Not configured/);
  await click(button(f.container, 'Hide Console'));
  assert.doesNotMatch(f.container.textContent, /Console idle/);
});
