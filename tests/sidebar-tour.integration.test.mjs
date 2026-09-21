import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
import { buildTourSteps } from '../src/utils/tour-steps.js';

const { UIProvider } = await import('../src/context/UIContext.jsx');
const { useUI } = await import('../src/context/useUI.js');
const { ProvidersContext } = await import('../src/context/ProvidersContext.jsx');
const { Sidebar } = await import('../src/components/Sidebar.jsx');
const { default: Tour } = await import('../src/components/Tour.jsx');

function TourShell() {
  const ui = useUI();
  const steps = buildTourSteps({
    setActiveTab: ui.setActiveTab, selectedTechniqueRef: { current: null },
    targets: [], presets: [], DEFAULT_PRESET_ID: 'default', allTests: [],
    selectedTests: [], running: false, results: [], expandedCell: null, useDemoMode: true,
  });
  return React.createElement(React.Fragment, null,
    React.createElement(Sidebar, {
      activeTab: ui.activeTab, setActiveTab: ui.setActiveTab,
      sidebarCollapsed: ui.sidebarCollapsed, toggleSidebar: ui.toggleSidebar,
    }),
    React.createElement('output', null, ui.activeTab),
    React.createElement('button', { onClick: () => ui.setOnboardingOpen(true) }, 'Replay onboarding'),
    React.createElement(Tour, { steps, active: ui.tourRunning, onFinish: () => ui.setTourRunning(false) }),
  );
}

function Fixture() {
  return React.createElement(UIProvider, null,
    React.createElement(ProvidersContext.Provider, { value: { vaultLocked: false, vaultPassphraseSet: false } },
      React.createElement(TourShell)));
}

test('sidebar Start Tour completes onboarding and opens the real tour; replay restarts at step one', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { container } = await mountComponent(t, Fixture);
  // JSDOM has no layout/scrolling implementation; the real tour finds Sidebar's anchor.
  window.HTMLElement.prototype.scrollIntoView = () => {};
  assert.doesNotMatch(container.textContent, /Tutorial \d/);

  await click(button(container, 'Start Tour'));
  assert.match(container.textContent, /Tutorial 1 \/ /);
  assert.equal(container.querySelector('output').textContent, 'settings', 'the real first step enters Settings');
  assert.equal(localStorage.getItem('atlas_onboarding_done'), 'true');
  assert.doesNotMatch(container.textContent, /Welcome to GroundRumble!/);
  await click(button(container, 'Next'));
  assert.match(container.textContent, /Tutorial 2 \/ /);
  await click(container.querySelector('[title="Close tutorial"]'));
  assert.doesNotMatch(container.textContent, /Tutorial \d/);

  await click(button(container, 'Replay onboarding'));
  await click(button(container, 'Start Tour'));
  assert.match(container.textContent, /Tutorial 1 \/ /, 'reopening resets the existing Tour instance');
  await click(container.querySelector('[title="Close tutorial"]'));
  assert.doesNotMatch(container.textContent, /Tutorial \d/);
});

test('sidebar Skip persists onboarding completion without starting a tour', async t => {
  const { container } = await mountComponent(t, Fixture);
  await click(button(container, 'Skip'));
  assert.equal(localStorage.getItem('atlas_onboarding_done'), 'true');
  assert.doesNotMatch(container.textContent, /Welcome to GroundRumble!|Tutorial \d/);
  assert.equal(container.querySelector('output').textContent, 'dashboard');
});
