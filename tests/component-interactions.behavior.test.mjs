import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { mountComponent, click, button, fill } from './helpers/react-harness.mjs';
const { ConfirmDialog } = await import('../src/components/ConfirmDialog.jsx');
const { StyledCheckbox } = await import('../src/components/StyledCheckbox.jsx');
const { GenModelSelector } = await import('../src/components/GenModelSelector.jsx');
const { JudgeModelSelector } = await import('../src/components/JudgeModelSelector.jsx');
const { ToastContainer } = await import('../src/components/ToastContainer.jsx');

async function key(element, value, options = {}) {
  const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
  await act(async () => element.dispatchEvent(event));
  return event;
}

async function select(element, value) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

for (const inputType of ['text', 'textarea']) {
  test(`confirmation ${inputType} prompt focuses, edits and submits with the keyboard`, async t => {
    const answers = [];
    function Harness() {
      const [state, setState] = useState({ type: 'prompt', inputType, inputValue: 'old', message: 'Enter guidance' });
      return React.createElement(ConfirmDialog, { confirmState: state, setConfirmState: setState, resolveDialog: value => answers.push(value) });
    }
    const { container } = await mountComponent(t, Harness);
    const input = container.querySelector('input, textarea');
    assert.equal(document.activeElement, input);
    await fill(input, 'new guidance');
    await key(input, 'a');
    if (inputType === 'textarea') {
      assert.equal((await key(input, 'Enter', { shiftKey: true })).defaultPrevented, false);
    }
    assert.deepEqual(answers, []);
    assert.equal((await key(input, 'Enter')).defaultPrevented, true);
    await click(button(container, 'OK'));
    await click(button(container, 'Cancel'));
    assert.deepEqual(answers, ['new guidance', 'new guidance', null]);
  });
}

test('confirmation checkbox state persists independently of boolean dialog responses', async t => {
  const answers = [];
  function Harness() {
    const [state, setState] = useState({ type: 'confirm', message: 'Proceed?', checkbox: 'Remember consent', checkboxValue: false });
    return React.createElement(ConfirmDialog, { confirmState: state, setConfirmState: setState,
      resolveDialog: value => answers.push({ value, remembered: state.checkboxValue }) });
  }
  const { container } = await mountComponent(t, Harness);
  await click(container.querySelector('label'));
  assert.equal(container.querySelector('input').checked, true);
  await click(button(container, 'Confirm'));
  await click(container.querySelector('label'));
  await click(button(container, 'Cancel'));
  assert.deepEqual(answers, [{ value: true, remembered: true }, { value: false, remembered: false }]);
});

test('choice dialog distinguishes all three decisions and supports custom labels', async t => {
  const answers = [];
  const props = { confirmState: { type: 'choice', message: 'Save secrets?' }, resolveDialog: value => answers.push(value) };
  const view = await mountComponent(t, ConfirmDialog, props);
  for (const label of ['Cancel', 'Save anyway', 'Set up encryption']) await click(button(view.container, label));
  await view.render({ ...props, confirmState: { ...props.confirmState, cancelText: 'Stop', secondaryText: 'Plain', primaryText: 'Encrypt', primaryColor: 'danger' } });
  for (const label of ['Stop', 'Plain', 'Encrypt']) await click(button(view.container, label));
  assert.deepEqual(answers, ['cancel', 'secondary', 'primary', 'cancel', 'secondary', 'primary']);
  await view.render({ ...props, confirmState: null });
  assert.equal(view.container.textContent, '');
});

test('disabled checkbox cannot change consent and forwards its accessible name', async t => {
  const changed = t.mock.fn();
  const { container } = await mountComponent(t, StyledCheckbox, { checked: false, disabled: true, onChange: changed, label: 'Consent', 'aria-label': 'Provider consent' });
  await click(container.querySelector('label'));
  assert.equal(container.querySelector('input').checked, false);
  assert.equal(container.querySelector('input').getAttribute('aria-label'), 'Provider consent');
  assert.equal(changed.mock.callCount(), 0);
});

for (const kind of ['generator', 'judge']) {
  test(`${kind} selector resets the model on provider changes and retains config on model edits`, async t => {
    const changes = [];
    const config = { provider: 'one', model: 'old', temperature: 0.2 };
    const providers = [{ id: 'one', name: 'One', models: ['old', 'new'] }, { id: 'two', name: 'Two', models: [] }, { id: 'off', name: 'Disabled', enabled: false }];
    const props = kind === 'generator'
      ? { effectiveGenConfig: config, selectedGenProvider: providers[0], genModelList: ['fallback'], saveGenConfig: value => changes.push(value) }
      : { judgeConfig: config, selectedJudgeProvider: providers[0], judgeModelList: ['fallback'], saveJudgeConfig: value => changes.push(value) };
    Object.assign(props, { providers, helperProviderSelectable: id => id !== 'missing' });
    const view = await mountComponent(t, kind === 'generator' ? GenModelSelector : JudgeModelSelector, props);
    assert.deepEqual([...view.container.querySelector('select').options].map(o => o.value), ['one', 'two']);
    await select(view.container.querySelector('select'), 'two');
    await select(view.container.querySelectorAll('select')[1], 'new');
    const providerKey = kind === 'generator' ? 'selectedGenProvider' : 'selectedJudgeProvider';
    await view.render({ ...props, [providerKey]: providers[1] });
    await fill(view.container.querySelector('input'), 'manual-model');
    await view.render({ ...props, [providerKey]: null });
    assert.deepEqual([...view.container.querySelectorAll('select')[1].options].map(o => o.value), ['old', 'fallback']);
    await select(view.container.querySelectorAll('select')[1], 'fallback');
    assert.deepEqual(changes, [{ provider: 'two', model: '' }, { ...config, model: 'new' }, { ...config, model: 'manual-model' }, { ...config, model: 'fallback' }]);
    const configKey = kind === 'generator' ? 'effectiveGenConfig' : 'judgeConfig';
    await view.render({ ...props, [providerKey]: null, [configKey]: { provider: 'missing', model: '' } });
    assert.equal(view.container.querySelector('option').disabled, true);
    assert.match(view.container.textContent, /No provider configured/);
  });
}

test('judge configuration is disabled during a run and when judging is switched off', async t => {
  const props = { judgeConfig: { provider: 'p', model: 'm' }, providers: [{ id: 'p', name: 'Provider' }], judgeModelList: ['m'], helperProviderSelectable: () => true };
  const view = await mountComponent(t, JudgeModelSelector, { ...props, running: true });
  for (const selectedJudgeProvider of [null, { models: ['m'] }, { models: [] }]) {
    for (const gate of [{ running: true }, { disabled: true }]) {
      await view.render({ ...props, selectedJudgeProvider, ...gate });
      assert.ok([...view.container.querySelectorAll('select,input')].every(input => input.disabled));
    }
  }
  await view.render(props);
  assert.ok([...view.container.querySelectorAll('select')].every(input => !input.disabled));
});

test('toast dismiss targets only the selected notification and messages remain literal text', async t => {
  function Harness() {
    const [toasts, setToasts] = useState(['error', 'success', 'info'].map((type, id) => ({ id, type, message: `${type}: <img src=x>` })));
    return React.createElement(ToastContainer, { toasts, removeToast: id => setToasts(prev => prev.filter(toast => toast.id !== id)) });
  }
  const { container } = await mountComponent(t, Harness);
  assert.equal(container.querySelector('img'), null);
  await click(container.querySelectorAll('button')[1]);
  assert.doesNotMatch(container.textContent, /success/);
  assert.match(container.textContent, /error: <img src=x>/);
  assert.match(container.textContent, /info:/);
  await click(container.querySelector('button'));
  await click(container.querySelector('button'));
  assert.equal(container.textContent, '');
});
