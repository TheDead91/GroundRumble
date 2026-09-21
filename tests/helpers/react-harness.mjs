import React, { act } from 'react';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

export async function mountHook(t, hook, initialProps, renderResult = false) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://groundrumble.test/' });
  const errors = [];
  dom.window.addEventListener('error', event => errors.push(event.error || event.message));
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Element', 'navigator', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
  });
  const { createRoot } = await import('react-dom/client');
  const container = document.getElementById('root');
  const root = createRoot(container);
  let current;
  function Probe(props) { current = hook(props); return renderResult ? current : null; }
  const render = async props => {
    await act(async () => root.render(React.createElement(Probe, props)));
  };
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    assert.deepEqual(errors, [], 'React event handlers must not throw uncaught errors');
  });
  await render(initialProps);
  return { get current() { return current; }, container, render };
}

export const mountComponent = (t, Component, props) => mountHook(t, value => React.createElement(Component, value), props, true);

export async function click(element) {
  if (!element) throw new Error('Cannot click a missing element');
  await act(async () => element.click());
}

export function button(container, name) {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent.trim() === name);
  if (!found) throw new Error(`Button not found: ${name}`);
  return found;
}

export async function fill(element, value) {
  if (!element) throw new Error('Cannot fill a missing input');
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
