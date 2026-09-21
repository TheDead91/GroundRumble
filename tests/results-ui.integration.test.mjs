import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, useState } from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
const { AuditContext } = await import('../src/context/AuditContext.jsx');
const { HistoryProvider, useHistory } = await import('../src/context/HistoryContext.jsx');
const { TestsContext } = await import('../src/context/TestsContext.jsx');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { SettingsContext } = await import('../src/context/SettingsContext.jsx');
const { UIContext } = await import('../src/context/UIContext.jsx');
const { ComparisonResults } = await import('../src/components/runner/ComparisonResults.jsx');
const { DashboardView } = await import('../src/components/views/DashboardView.jsx');

const targets = [{ uid: 'a', provider: 'p', model: 'Alpha' }, { uid: 'b', provider: 'q', model: 'Beta' }];
const results = ['VULNERABLE', 'SECURE', 'ERROR', 'EMPTY', 'INCONCLUSIVE'].map((status, i) => ({
  auditId: 'run', testId: `test-${i}`, testName: `Payload ${i}`, targetUid: 'a', provider: 'p', model: 'Alpha', status,
  techniqueId: `AML.T000${i}`, tactic: 'Execution', systemPrompt: 'Confidential system', userPrompt: 'Attack payload', response: '<img src=x> literal response', reasoning: `Reason for ${status}`,
}));
const allTests = results.map(result => ({ ...result, id: result.testId, name: result.testName }));
const record = { id: 'run', timestamp: '2026-09-01T00:00:00Z', details: results, targets, cancelled: true };

async function setup(t, mode = 'comparison') {
  let history;
  const toasts = [], reports = [], selected = [], expansions = [], deleted = [];
  function Content({ locked, records, rows, running }) {
    const state = useHistory();
    const { setHistory } = state;
    useLayoutEffect(() => { history = state; });
    useLayoutEffect(() => setHistory(records), [records, setHistory]);
    const [expandedCell, setExpandedCell] = useState(null);
    return mode === 'comparison' ? React.createElement(AuditContext.Provider, { value: { running, results: rows } },
      React.createElement(ComparisonResults, { targets, expandedCell, setExpandedCell, handleResultOverride: state.setResultOverride, printRunReport: (...args) => reports.push(args) }))
      : React.createElement(DashboardView, { effectiveDetails: state.effectiveDetails, printRunReport: (...args) => reports.push(args),
        setSelectedAudit: value => selected.push(value), setExpandedDetailIds: value => expansions.push(value), handleDeleteAudit: id => deleted.push(id), clearHistory: () => deleted.push('all'), locked });
  }
  const initial = { locked: false, records: [record], rows: results, running: false };
  function Harness(props) {
    return React.createElement(UIContext.Provider, { value: { addToast: message => toasts.push(message) } },
      React.createElement(ProvidersContext.Provider, { value: { vaultLocked: props.locked, vaultPassphraseSet: props.locked, providerLabel: id => `Provider ${id}`, modelTargetLabel: (provider, model) => `${provider}/${model}` } },
        React.createElement(SettingsContext.Provider, { value: { atlasMatrix: [{ id: 'TA0001', name: 'Execution', techniques: [] }] } },
          React.createElement(TestsContext.Provider, { value: { allTests } }, React.createElement(HistoryProvider, null, React.createElement(Content, props))))));
  }
  const view = await mountComponent(t, Harness, initial);
  window.HTMLElement.prototype.scrollIntoView = t.mock.fn();
  return { ...view, initial, get history() { return history; }, toasts, reports, selected, expansions, deleted };
}

function containsButton(container, text) {
  const node = [...container.querySelectorAll('button')].find(item => item.textContent.includes(text));
  assert.ok(node, `button containing ${text}`);
  return node;
}

test('comparison separates technical results, excludes them from scoring, and prevents upgrading them to verdicts', async t => {
  const f = await setup(t);
  const summary = f.container.querySelector('[data-testid="model-summary-a"]');
  assert.match(summary.textContent, /50%/);
  assert.match(summary.textContent, /1 errors.*1 empty.*1 inconclusive/);
  assert.match(f.container.querySelector('[data-testid="model-summary-b"]').textContent, /—/);
  await click(containsButton(f.container, 'Inconclusive (errors / empty)'));
  for (const i of [2, 3, 4]) {
    const row = f.container.querySelector(`[data-testid="result-row-test-${i}"]`);
    assert.equal(row.querySelectorAll('button')[1].disabled, true, 'missing results cannot open a detail');
    await click(row.querySelector('button'));
    const detail = f.container.querySelector('[data-tour="expanded-result"]');
    assert.match(detail.textContent, new RegExp(`Reason for ${results[i].status}`));
    assert.equal(detail.querySelector('img'), null);
    await click(button(detail, 'Secure'));
    assert.deepEqual(f.history.overrides, {});
    assert.match(f.toasts.at(-1), /cannot be converted into scored verdicts/);
    await click(detail.querySelector('button'));
    assert.equal(f.container.querySelector('[data-tour="expanded-result"]'), null);
  }
});

test('technical, secure and partial comparisons make no unsupported resistance assurance', async t => {
  const f = await setup(t);
  for (const rows of [results.slice(2), [results[1]], [results[1], results[2]]]) {
    await f.render({ ...f.initial, rows });
    assert.match(f.container.textContent, /No vulnerable results recorded\./);
    assert.doesNotMatch(f.container.textContent, /every attack was resisted/);
    assert.match(f.container.querySelector('[data-testid="model-summary-b"]').textContent, /—/, 'missing target results are not security evidence');
  }
});

test('comparison override updates groups, score and report and can be cleared to the original verdict', async t => {
  const f = await setup(t);
  await click(f.container.querySelector('[data-testid="result-row-test-0"] button'));
  const detail = () => f.container.querySelector('[data-tour="expanded-result"]');
  await click(button(detail(), 'Secure'));
  assert.match(f.container.querySelector('[data-testid="model-summary-a"]').textContent, /100%/);
  await click(button(f.container, 'Download Report'));
  assert.equal(f.reports[0][0][0].status, 'SECURE');
  assert.match(f.reports[0][1].meta[0], /p\/Alpha.*q\/Beta/);
  await click(button(detail(), 'Inconclusive'));
  assert.match(detail().textContent, /INCONCLUSIVE/);
  await click(button(detail(), 'Vulnerable'));
  assert.match(f.container.querySelector('[data-testid="model-summary-a"]').textContent, /50%/);
  await click(button(detail(), 'Clear override'));
  assert.deepEqual(f.history.overrides, {});
  assert.equal(results[0].status, 'VULNERABLE', 'manual decisions must not mutate original evidence');
  await f.render({ ...f.initial, locked: true });
  assert.equal(button(f.container, 'Download Report').disabled, true);
  assert.match(detail().textContent, /Vault locked/);
  assert.doesNotMatch(detail().textContent, /Confidential system|literal response|Reason for/);
});

test('comparison override highlighting reads each canonical verdict and clears with the entity', async t => {
  const f = await setup(t);
  await click(f.container.querySelector('[data-testid="result-row-test-0"] button'));
  for (const verdict of [null, 'SECURE', 'VULNERABLE', 'INCONCLUSIVE', null]) {
    await act(async () => f.history.setResultOverride(results[0], verdict, 'Reviewed'));
    const detail = f.container.querySelector('[data-tour="expanded-result"]');
    for (const [label, status, color] of [['Secure', 'SECURE', 'secure'], ['Vulnerable', 'VULNERABLE', 'vulnerable'], ['Inconclusive', 'INCONCLUSIVE', 'warning']]) {
      assert.equal(button(detail, label).style.color, verdict === status ? `var(--color-${color})` : '');
    }
    assert.equal([...detail.querySelectorAll('button')].some(b => b.textContent === 'Clear override'), verdict !== null);
  }
});

test('comparison sorting changes visible order within groups and supports empty and running states', async t => {
  const f = await setup(t);
  await f.render({ ...f.initial, rows: results.map(result => ({ ...result, status: 'VULNERABLE' })) });
  const firstCell = () => f.container.querySelector('tbody tr td').textContent;
  assert.equal(firstCell(), 'Payload 0');
  await click(f.container.querySelectorAll('th')[0]);
  assert.equal(firstCell(), 'Payload 4');
  await click(f.container.querySelectorAll('th')[0]);
  assert.equal(firstCell(), 'Payload 0');
  await click(f.container.querySelectorAll('th')[1]);
  assert.match(f.container.querySelectorAll('th')[1].textContent, /↑/);
  await click(f.container.querySelectorAll('th')[2]);
  assert.match(f.container.querySelectorAll('th')[2].textContent, /↑/);
  await click(containsButton(f.container, 'Succeeded Attack Payloads'));
  assert.match(f.container.textContent, /No succeeded payloads/);
  await f.render({ ...f.initial, rows: [] });
  assert.match(f.container.textContent, /No results yet/);
  await f.render({ ...f.initial, rows: [], running: true });
  assert.doesNotMatch(f.container.textContent, /No results yet/);
});

test('dashboard uses effective verdicts for cancelled runs and routes detail, delete and report actions to the correct audit', async t => {
  const f = await setup(t, 'dashboard');
  await act(async () => f.history.setResultOverride(results[0], 'SECURE'));
  assert.match(f.container.querySelector('[data-tour="dash-overall"]').textContent, /100%/);
  const row = f.container.querySelector('[data-testid="history-row"]');
  assert.match(row.textContent, /3 errors\/empty\/inconclusive \(excluded from score\)/);
  await click(row.querySelector('[data-tip="View"]'));
  assert.deepEqual(f.expansions, [new Set()]);
  assert.equal(f.selected[0].id, 'run');
  await click(row.querySelector('[data-tip="Report"]'));
  assert.equal(f.reports[0][0][0].status, 'SECURE');
  await click(row.querySelector('[data-tip="Delete"]'));
  await click(button(f.container, 'Clear History'));
  assert.deepEqual(f.deleted, ['run', 'all']);
  const open = t.mock.method(window, 'open', () => null);
  await click(f.container.querySelector('[data-tour="resilience-by-model"] [data-tip="Report"]'));
  assert.equal(open.mock.callCount(), 1);
  assert.match(f.toasts.at(-1), /pop.?up/i);
  await f.render({ ...f.initial, locked: true });
  assert.ok([...f.container.querySelectorAll('[data-tip]')].every(node => node.disabled));
  assert.equal(button(f.container, 'Clear History').disabled, true);
});

test('dashboard sorts model, provider, tactic and overall scores and shows legacy and empty history safely', async t => {
  const f = await setup(t, 'dashboard');
  const other = { ...record, id: 'legacy', model: 'Beta', provider: 'q', targets: undefined,
    details: [{ ...results[1], auditId: 'legacy', targetUid: 'b', model: 'Beta', provider: 'q' }] };
  await f.render({ ...f.initial, records: [record, other] });
  const table = f.container.querySelector('[data-tour="resilience-by-model"] table');
  assert.equal(table.querySelector('tbody td').textContent, 'Alpha');
  await click(table.querySelectorAll('th')[0]);
  assert.equal(table.querySelector('tbody td').textContent, 'Beta');
  for (const index of [1, 2, 3]) {
    await click(table.querySelectorAll('th')[index]);
    assert.match(table.querySelectorAll('th')[index].textContent, /↑/);
    await click(table.querySelectorAll('th')[index]);
    assert.match(table.querySelectorAll('th')[index].textContent, /↓/);
  }
  assert.match(f.container.querySelectorAll('[data-testid="history-row"]')[1].textContent, /Beta.*Provider q/);
  await f.render({ ...f.initial, records: [] });
  assert.match(f.container.textContent, /No historical scans available/);
  assert.match(f.container.querySelector('[data-tour="dash-overall"]').textContent, /—/);
});
