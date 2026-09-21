// Top-level React Error Boundary behavior.
//
// The boundary must catch an unexpected render failure anywhere in its subtree,
// degrade to a recovery surface instead of a blank/unmounted root, and never
// expose raw exception/stack/secret material. These tests mount the real
// component and drive real render failures; no server, no network, no browser.
import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mountComponent, click } from './helpers/react-harness.mjs';

const { ErrorBoundary } = await import('../src/components/ErrorBoundary.jsx');

const SECRET = 'AbCdEfGhIjKlMnOp';
const Bomb = () => { throw new Error(`render exploded with ${SECRET}`); };
const Ok = () => React.createElement('span', null, 'rendered fine');

const buttonByLabel = (view, label) =>
  [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('a child render error triggers the fallback without leaking raw material', async t => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => { logged.push(args.map(String).join(' ')); });
  const view = await mountComponent(t, ErrorBoundary, { children: React.createElement(Bomb) });

  const text = view.container.textContent;
  assert.match(text, /Unexpected error/, 'the fallback states an unexpected UI error');
  assert.match(text, /could not continue rendering/, 'the fallback does not pretend rendering succeeded');
  assert.ok(view.container.querySelector('[role="alert"]'), 'the fallback is announced as an alert');
  assert.doesNotMatch(text, new RegExp(SECRET), 'a secret in the render error is never shown');
  assert.doesNotMatch(text, /render exploded/, 'the raw exception message is never shown');
  assert.doesNotMatch(text, /componentStack|at (ErrorBoundary|Bomb|Probe)/i, 'no stack trace is shown');

  // The boundary's own diagnostic log applies strict projection, never the raw
  // secret/stack. (React's dev-mode caught-error logging is not the boundary's
  // diagnostic and is absent from the production build.)
  const boundaryLog = logged.find((line) => line.includes('Unexpected application render error'));
  assert.ok(boundaryLog, 'the boundary logs a contextual diagnostic');
  assert.ok(!boundaryLog.includes(SECRET), 'the boundary log never leaks the secret');
  assert.match(boundaryLog, /\[REDACTED_TOKEN\]/, 'the boundary log projects the short token');
});

test('the fallback offers operable reload and reset recovery controls', async t => {
  t.mock.method(console, 'error', () => {});
  const view = await mountComponent(t, ErrorBoundary, { children: React.createElement(Bomb) });

  const reload = buttonByLabel(view, 'Reload application');
  const retry = buttonByLabel(view, 'Try again');
  assert.ok(reload, 'a reload control is present');
  assert.ok(retry, 'a reset control is present');
  assert.equal(reload.tagName, 'BUTTON', 'reload is a real keyboard-accessible button');
  assert.equal(retry.tagName, 'BUTTON', 'reset is a real keyboard-accessible button');
});

test('Try again resets the boundary and re-renders the children', async t => {
  let shouldThrow = true;
  const Flaky = () => {
    if (shouldThrow) throw new Error('transient failure');
    return React.createElement('span', null, 'recovered');
  };
  t.mock.method(console, 'error', () => {});
  const view = await mountComponent(t, ErrorBoundary, { children: React.createElement(Flaky) });
  assert.match(view.container.textContent, /Unexpected error/);

  shouldThrow = false;
  await click(buttonByLabel(view, 'Try again'));
  assert.match(view.container.textContent, /recovered/, 'reset re-renders the same children');
  assert.equal(view.container.querySelector('[role="alert"]'), null, 'the fallback is dismissed after recovery');
});

test('Reload application is operable and does not auto-recover or loop', async t => {
  t.mock.method(console, 'error', () => {});
  const view = await mountComponent(t, ErrorBoundary, { children: React.createElement(Bomb) });
  assert.match(view.container.textContent, /Unexpected error/);

  // jsdom exposes a read-only, non-configurable Location.reload; we assert the
  // recovery control is a real, clickable button that does not silently reset
  // the fallback into a re-throwing loop (reload is a navigation, not a reset).
  const reload = buttonByLabel(view, 'Reload application');
  await click(reload);
  assert.match(view.container.textContent, /Unexpected error/, 'reload never auto-recovers into a loop');
  assert.equal(view.container.querySelector('[role="alert"]') !== null, true, 'the fallback stays visible');
});

test('normal rendering passes children through unchanged with no fallback', async t => {
  const view = await mountComponent(t, ErrorBoundary, { children: React.createElement(Ok) });
  assert.match(view.container.textContent, /rendered fine/);
  assert.equal(view.container.querySelector('[role="alert"]'), null, 'no fallback when nothing throws');
});

test('the boundary covers a deeply nested application surface', async t => {
  const DeepBomb = () => { throw new Error('deep failure'); };
  const tree = React.createElement(
    'div',
    null,
    React.createElement('section', null,
      React.createElement('main', null, React.createElement(DeepBomb))
    )
  );
  t.mock.method(console, 'error', () => {});
  const view = await mountComponent(t, ErrorBoundary, { children: tree });
  assert.match(view.container.textContent, /Unexpected error/, 'a throw in a deep descendant is caught at the root boundary');
});
