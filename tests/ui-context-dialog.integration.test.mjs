import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useContext, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
const { UIContext, UIProvider } = await import('../src/context/UIContext.jsx');

async function setup(t) {
  let current;
  function Probe() {
    const ui = useContext(UIContext);
    useLayoutEffect(() => { current = ui; });
    return null;
  }
  function Harness() {
    return React.createElement(UIProvider, null, React.createElement(Probe));
  }
  await mountComponent(t, Harness);
  return { get current() { return current; } };
}

test('input dialogs retain editable defaults and resolve accepted and cancelled answers', async t => {
  const f = await setup(t);
  let answer;
  await act(async () => { answer = f.current.askInput('Vault passphrase', 'initial', 'password'); });
  assert.equal(f.current.confirmState.type, 'prompt');
  assert.equal(f.current.confirmState.message, 'Vault passphrase');
  assert.equal(f.current.confirmState.inputType, 'password');
  assert.equal(f.current.dialogInput, 'initial');
  await act(async () => f.current.setDialogInput('replacement'));
  await act(async () => f.current.resolveDialog(f.current.dialogInput));
  assert.equal(await answer, 'replacement');
  assert.equal(f.current.confirmState, null);

  await act(async () => { answer = f.current.askInput('Name'); });
  assert.equal(f.current.dialogInput, '', 'a new prompt clears the previous answer');
  assert.equal(f.current.confirmState.inputType, 'text');
  await act(async () => f.current.resolveDialog(null));
  assert.equal(await answer, null);
  assert.equal(f.current.confirmState, null);
});

test('sidebar open, close, clear and toggle persist the visible collapsed state', async t => {
  const f = await setup(t);
  for (const [action, collapsed] of [
    ['closeSidebar', true], ['openSidebar', false], ['closeSidebar', true],
    ['clearSidebar', false], ['toggleSidebar', true], ['toggleSidebar', false],
  ]) {
    await act(async () => f.current[action]());
    assert.equal(f.current.sidebarCollapsed, collapsed, action);
    assert.equal(localStorage.getItem('atlas_sidebar_collapsed'), String(collapsed), action);
  }
});
