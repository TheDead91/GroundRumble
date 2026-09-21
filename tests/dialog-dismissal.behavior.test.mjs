import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';

const { ConfirmDialog } = await import('../src/components/ConfirmDialog.jsx');

const mount = async (t, confirmState) => {
  const answers = [];
  const view = await mountComponent(t, ConfirmDialog, {
    confirmState, setConfirmState() {}, resolveDialog: (v) => answers.push(v),
  });
  return { ...view, answers };
};

const pressEscape = async (container) => {
  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'dialog landmark exists');
  await act(async () => {
    dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  return dialog;
};

test('Generic confirm exposes a dialog landmark with an accessible name', async (t) => {
  const { container } = await mount(t, { type: 'confirm', message: 'Delete provider?\n\nThis removes it.' });
  const dialog = container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'role="dialog" present');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok((dialog.getAttribute('aria-label') || '').includes('Delete provider?'), 'accessible name derived from the message');
});

test('Escape carries Cancel semantics per dialog type', async (t) => {
  const answers = [];
  const base = { setConfirmState() {}, resolveDialog: (v) => answers.push(v) };
  const view = await mountComponent(t, ConfirmDialog, { ...base, confirmState: { type: 'confirm', message: 'Sure?' } });
  await pressEscape(view.container);
  assert.deepEqual(answers, [false], 'confirm Escape resolves false');

  await view.render({ ...base, confirmState: { type: 'choice', message: 'Keys?', cancelText: 'Cancel', secondaryText: 'Plain', primaryText: 'Encrypt' } });
  await pressEscape(view.container);
  assert.deepEqual(answers, [false, 'cancel'], 'choice Escape resolves cancel');

  await view.render({ ...base, confirmState: { type: 'prompt', message: 'Name?', inputValue: 'typed' } });
  await pressEscape(view.container);
  assert.deepEqual(answers, [false, 'cancel', null], 'prompt Escape resolves null');
});

test('Focus enters the dialog on a safe control', async (t) => {
  const base = { setConfirmState() {}, resolveDialog() {} };
  await mountComponent(t, ConfirmDialog, { ...base, confirmState: { type: 'confirm', message: 'Sure?' } });
  assert.equal(document.activeElement?.textContent, 'Cancel', 'confirm focuses Cancel (least destructive)');
});

test('Prompt focuses its text input', async (t) => {
  const base = { setConfirmState() {}, resolveDialog() {} };
  await mountComponent(t, ConfirmDialog, { ...base, confirmState: { type: 'prompt', message: 'Name?', inputValue: '' } });
  assert.equal(document.activeElement?.tagName, 'INPUT', 'prompt focuses the text input');
});

test('Override dialog keeps its blocking contract while busy', async (t) => {
  const view = await mount(t, {
    type: 'override', message: 'Override verdict', inputValue: 'reason', busy: true,
    onSave: async () => true,
  });
  const dialog = view.container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'override keeps its dialog landmark');
  await act(async () => {
    dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  assert.deepEqual(view.answers, [], 'busy override ignores Escape');
  const close = view.container.querySelector('button[aria-label="Close override dialog"]');
  await act(async () => { close.click(); });
  assert.deepEqual(view.answers, [], 'busy override ignores the X button');
});
