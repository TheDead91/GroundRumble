import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
const { useAuditDetail } = await import('../src/hooks/useAuditDetail.js');
const { buildRunReportBody } = await import('../src/utils/report-builder.js');
const { UIProvider } = await import('../src/context/UIContext.jsx');

async function mountAuditDetail(t, props) {
  let current;
  function Probe(p) { const value = useAuditDetail(p); useLayoutEffect(() => { current = value; }); return null; }
  function Harness(p) { return React.createElement(UIProvider, null, React.createElement(Probe, p)); }
  const view = await mountComponent(t, Harness, props);
  return { ...view, get current() { return current; } };
}

test('audit detail expansion is independent per result and toggling does not mutate previous selection', async t => {
  const view = await mountAuditDetail(t, {});
  await act(async () => view.current.toggleExpandedDetail('first'));
  const previous = view.current.expandedDetailIds;
  await act(async () => view.current.toggleExpandedDetail('second'));
  assert.deepEqual(previous, new Set(['first']));
  assert.deepEqual(view.current.expandedDetailIds, new Set(['first', 'second']));
  await act(async () => view.current.toggleExpandedDetail('first'));
  assert.deepEqual(view.current.expandedDetailIds, new Set(['second']));
});

test('report preconditions prevent opening reports for locked, unsupported and empty sessions', async t => {
  const toasts = [], opened = [];
  const props = { addToast: message => toasts.push(message), vaultSupported: () => true,
    openPrintableReport: (...args) => opened.push(args), buildRunReportBody, effectiveDetails: value => value };
  const view = await mountAuditDetail(t, { ...props, vaultLocked: true });
  view.current.printRunReport([{ status: 'SECURE' }]);
  await view.render({ ...props, vaultSupported: () => false });
  view.current.printRunReport([{ status: 'SECURE' }]);
  await view.render(props);
  view.current.printRunReport([]);
  assert.deepEqual(toasts, ['Unlock your API keys to generate reports.', 'Reports require IndexedDB support (secure context).', 'No results to report yet.']);
  assert.deepEqual(opened, []);
});
