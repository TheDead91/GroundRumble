import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
import { installFakeIndexedDB } from './helpers/dom.mjs';
const db = installFakeIndexedDB();
const { default: App } = await import('../src/App.jsx');
const { UIProvider } = await import('../src/context/UIContext.jsx');
const { ProvidersProvider } = await import('../src/context/ProvidersContext.jsx');
const { TestsProvider } = await import('../src/context/TestsContext.jsx');
const { HistoryProvider } = await import('../src/context/HistoryContext.jsx');
const { AuditProvider } = await import('../src/context/AuditContext.jsx');
const { AIGenProvider } = await import('../src/context/AIGenContext.jsx');
const { SettingsProvider } = await import('../src/context/SettingsContext.jsx');

test('real app retains mode on quota failure, reports it, and persists successful retries across remount', async t => {
  db.reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const warnings = t.mock.method(console, 'warn', () => {});
  function Harness({ session } = {}) {
    return [UIProvider, ProvidersProvider, TestsProvider, HistoryProvider, AuditProvider, AIGenProvider, SettingsProvider]
      .reduceRight((children, Provider) => React.createElement(Provider, { key: session }, children), React.createElement(App));
  }
  const f = await mountComponent(t, Harness);
  await click(button(f.container, 'Skip — I already know this tool'));
  await click(button(f.container, 'Settings'));
  const toggle = () => f.container.querySelector('[data-tour="sandbox-toggle"] input');
  let session = 0;
  for (const previous of [true, false]) {
    assert.equal(toggle().checked, previous);
    const storedBefore = localStorage.getItem('atlas_demo_mode');
    const proto = Object.getPrototypeOf(localStorage), original = proto.setItem;
    const writes = t.mock.method(proto, 'setItem', function (key, value) {
      if (!previous || key === 'atlas_demo_mode') throw new DOMException('Preference quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    await click(toggle());
    assert.equal(toggle().checked, previous);
    assert.equal(localStorage.getItem('atlas_demo_mode'), storedBefore);
    assert.match(f.container.textContent, /Could not save sandbox mode: Preference quota exceeded/);
    if (!previous) assert.ok(warnings.mock.calls.some(c => c.arguments.includes('Could not persist notification:')));
    writes.mock.restore();
    await f.render({ session: ++session });
    assert.equal(toggle().checked, previous, 'failed write does not affect rehydration');
    await click(toggle());
    assert.equal(toggle().checked, !previous);
    assert.equal(localStorage.getItem('atlas_demo_mode'), String(!previous));
    await f.render({ session: ++session });
    assert.equal(toggle().checked, !previous, 'successful retry survives rehydration');
  }
});
