import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { mountComponent, click, button } from './helpers/react-harness.mjs';
const { default: Tour } = await import('../src/components/Tour.jsx');

test('tour navigation, skip, finish, escape and reopening follow the visible step', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const finish = t.mock.fn(), enter = t.mock.fn();
  const steps = [
    { target: '#absent', title: 'First', body: 'One', waitFor: () => false, onEnter: enter },
    { target: '#absent', title: 'Second', body: 'Two' },
    { target: '#absent', title: 'Last', body: 'Three' },
  ];
  const props = { active: true, steps, onFinish: finish };
  const view = await mountComponent(t, Tour, props);
  assert.equal(button(view.container, 'Back').disabled, true);
  assert.equal(button(view.container, 'Next').disabled, true);
  await click(button(view.container, 'Next'));
  assert.match(view.container.textContent, /Tutorial 1 \/ 3/);
  await click(button(view.container, 'Skip this step'));
  assert.match(view.container.textContent, /Tutorial 2 \/ 3/);
  await click(button(view.container, 'Back'));
  assert.equal(enter.mock.callCount(), 2);
  await click(button(view.container, 'Skip this step'));
  await click(button(view.container, 'Next'));
  await click(button(view.container, 'Finish'));
  await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
  await click(view.container.querySelector('[title="Close tutorial"]'));
  assert.equal(finish.mock.callCount(), 3);
  await view.render({ ...props, active: false });
  await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
  assert.equal(finish.mock.callCount(), 3, 'inactive tours remove the global keyboard listener');
  assert.equal(view.container.textContent, '');
  await view.render(props);
  assert.match(view.container.textContent, /Tutorial 1 \/ 3/);
});

test('tour tolerates a temporarily unavailable condition and advances only after it becomes true', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let ready = false;
  const props = { active: true, onFinish() {}, steps: [
    { target: '#missing', title: 'Wait', waitFor: () => { if (!ready) throw new Error('loading'); return true; }, autoAdvance: true },
    { target: '#missing', title: 'Ready' },
  ] };
  const view = await mountComponent(t, Tour, props);
  await act(async () => t.mock.timers.tick(50));
  assert.equal(button(view.container, 'Next').disabled, true);
  ready = true;
  await act(async () => t.mock.timers.tick(50));
  assert.equal(button(view.container, 'Next').disabled, false);
  await act(async () => t.mock.timers.tick(50));
  assert.match(view.container.textContent, /Ready/);
  await view.render({ ...props, active: false });
  await view.render(props);
  await act(async () => t.mock.timers.tick(500));
  assert.match(view.container.textContent, /Tutorial 1 \/ 2/, 'an already satisfied condition does not auto-advance');
});

test('tour unions multiple anchors, follows resizing, and does not steal user focus on refresh', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const props = { active: false, onFinish() {}, steps: [{ target: ['#lower', '#upper'], title: 'Targets' }] };
  const view = await mountComponent(t, Tour, props);
  const lower = document.createElement('button'), upper = document.createElement('button');
  lower.id = 'lower'; upper.id = 'upper';
  document.body.append(lower, upper);
  let right = 400;
  lower.getBoundingClientRect = () => ({ top: 200, bottom: 240, left: 40, right, width: right - 40, height: 40 });
  upper.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 20, right: 300, width: 280, height: 40 });
  lower.scrollIntoView = t.mock.fn(); upper.scrollIntoView = t.mock.fn();
  await view.render({ ...props, active: true });
  assert.equal(upper.scrollIntoView.mock.callCount(), 1);
  const spotlight = () => [...view.container.querySelectorAll('div')].find(el => el.style.zIndex === '130');
  assert.equal(spotlight().style.top, '100px');
  assert.equal(spotlight().style.left, '20px');
  assert.equal(spotlight().style.width, '380px');
  assert.equal(spotlight().style.height, '140px');
  lower.focus(); right = 500;
  await act(async () => window.dispatchEvent(new window.Event('resize')));
  assert.equal(spotlight().style.width, '480px');
  assert.equal(document.activeElement, lower);
  await act(async () => t.mock.timers.tick(500));
  assert.equal(upper.scrollIntoView.mock.callCount(), 1);
  await view.render({ ...props, active: false });
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(view.container.textContent, '');
});

test('tour stops searching for absent targets and still permits completion', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const finish = t.mock.fn();
  const { container } = await mountComponent(t, Tour, { active: true, steps: [{ target: '#missing', title: 'Unavailable' }], onFinish: finish });
  for (let i = 0; i < 50; i++) await act(async () => t.mock.timers.tick(250));
  assert.match(container.textContent, /Couldn't highlight this element/);
  await click(button(container, 'Finish'));
  assert.equal(finish.mock.callCount(), 1);
});

test('tour clamps the tooltip into a narrow viewport when every preferred placement overflows', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const props = { active: false, onFinish() {}, steps: [{ target: '#large-target', title: 'Small screen' }] };
  const view = await mountComponent(t, Tour, props);
  Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 240, configurable: true });
  const target = document.createElement('div');
  target.id = 'large-target';
  target.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 240, right: 360, height: 240, width: 360 });
  target.scrollIntoView = t.mock.fn();
  document.body.append(target);
  await view.render({ ...props, active: true });
  const tooltip = view.container.querySelector('[tabindex="-1"]');
  assert.equal(tooltip.style.left, '12px');
  assert.ok(parseFloat(tooltip.style.top) >= 12 && parseFloat(tooltip.style.top) <= 228);
  assert.equal(tooltip.style.maxWidth, 'calc(100vw - 24px)');
  assert.equal(document.activeElement, tooltip);
});
