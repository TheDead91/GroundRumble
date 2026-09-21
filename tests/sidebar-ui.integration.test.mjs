import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
const { UIProvider } = await import('../src/context/UIContext.jsx');
const { useUI } = await import('../src/context/useUI.js');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { Sidebar } = await import('../src/components/Sidebar.jsx');

async function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ui;
  function Content() {
    const current = useUI();
    useLayoutEffect(() => { ui = current; });
    return React.createElement(Sidebar, current);
  }
  function Harness({ locked = false }) {
    return React.createElement(UIProvider, null, React.createElement(ProvidersContext.Provider, { value: { vaultLocked: locked, vaultPassphraseSet: locked } }, React.createElement(Content)));
  }
  const view = await mountComponent(t, Harness, {});
  return { ...view, get ui() { return ui; } };
}

test('sidebar section links change tabs, close menus and scroll to the selected section after navigation', async t => {
  const f = await setup(t);
  const target = document.createElement('div');
  target.dataset.tour = 'account-data';
  target.scrollIntoView = t.mock.fn();
  document.body.append(target);
  await click(f.container.querySelector('[title="Show Settings sections"]'));
  assert.equal(f.ui.expandedNav, 'settings');
  await click(button(f.container, 'Account & Data'));
  assert.equal(f.ui.activeTab, 'settings');
  assert.equal(f.ui.expandedNav, null);
  await act(async () => t.mock.timers.tick(180));
  assert.deepEqual(target.scrollIntoView.mock.calls[0].arguments, [{ behavior: 'smooth', block: 'start' }]);
  await click(f.container.querySelector('[title="Show Dashboard sections"]'));
  await click(f.container.querySelector('[title="Hide Dashboard sections"]'));
  assert.equal(f.ui.expandedNav, null);
  await click(button(f.container, 'Skip'));
  assert.equal(localStorage.getItem('atlas_onboarding_done'), 'true');
  assert.doesNotMatch(f.container.textContent, /Welcome to GroundRumble/);
  await f.render({ locked: true });
  await click(f.container.querySelector('[data-tour="nav-runner"]'));
  assert.equal(f.ui.activeTab, 'settings');
  await click(f.container.querySelector('[data-tour="nav-dashboard"]'));
  assert.equal(f.ui.activeTab, 'dashboard');
});

test('sidebar shows bounded redacted notification history, expands its badge and clears persistent notifications', async t => {
  const f = await setup(t);
  await act(async () => {
    for (let i = 0; i < 11; i++) f.ui.addToast(`Message ${i} api_key=sk-abcdefghijklmnopqrstuvwxyz123456`, ['info', 'success', 'error'][i % 3]);
  });
  assert.doesNotMatch(f.container.textContent, /sk-abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(localStorage.getItem('atlas_notifications'), /sk-abcdefghijklmnopqrstuvwxyz123456/);
  assert.match(f.container.textContent, /Message 10/);
  assert.doesNotMatch(f.container.textContent, /Message 0/);
  await click(f.container.querySelector('[title="Collapse sidebar"]'));
  assert.equal(localStorage.getItem('atlas_sidebar_collapsed'), 'true');
  assert.match(f.container.textContent, /9\+/);
  await click(f.container.querySelector('[title="11 recent notification(s) — click to view"]'));
  assert.equal(localStorage.getItem('atlas_sidebar_collapsed'), 'false');
  await click(f.container.querySelector('[title="Clear notification history"]'));
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas_notifications')), []);
  assert.doesNotMatch(f.container.textContent, /Recent notifications/);
  await click(f.container.querySelector('[title="Collapse sidebar"]'));
  assert.ok(f.container.querySelector('[title="No recent notifications"]'));
});
