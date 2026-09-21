import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const component = read('src/components/modals/CanaryPreview.jsx');
const prompt = read('src/components/modals/PromptUpdateDialog.jsx');
const judge = read('src/components/modals/JudgeMergeDialog.jsx');
const count = (source, needle) => source.split(needle).length - 1;

test('CanaryPreview is a props-in/events-out component with no context or I/O', () => {
  assert.ok(component.includes('export default function CanaryPreview({ canaries, canarySource, prompt, rerunning, onRerun }) {'));
  assert.ok(component.includes("import { RefreshCw } from 'lucide-react';"));
  assert.doesNotMatch(component, /\buse(State|Effect|Ref|Memo|Callback|Context)\b|useUI\(|useProviders\(|useTests\(|localStorage|\bfetch\(/);
  assert.ok(component.includes('if (!Array.isArray(canaries) || canaries.length === 0) return null;'));
});

test('Both dialogs delegate exact state and callbacks and only one row implementation remains', () => {
  for (const [name, source, state, callback] of [
    ['prompt update', prompt, 'promptUpdate', 'rerunPromptUpdateCanaries'],
    ['judge merge', judge, 'judgeMerge', 'rerunJudgeCanaries'],
  ]) {
    assert.equal(count(source, "import CanaryPreview from './CanaryPreview';"), 1, `${name} imports the shared preview`);
    assert.equal(count(source, '<CanaryPreview'), 1, `${name} renders one shared preview`);
    for (const prop of [
      `canaries={${state}.canaries}`,
      `canarySource={${state}.canarySource}`,
      `prompt={${state}.next}`,
      `rerunning={${state}.rerunning}`,
      `onRerun={${callback}}`,
    ]) assert.equal(count(source, prop), 1, `${name} wires ${prop}`);
    assert.equal(count(source, `${state}.canaries.map((c) => (`), 0, `${name} no longer implements rows`);
  }
  assert.equal(count(component, 'canaries.map((c) => ('), 1, 'exactly one canary-row implementation remains');
  assert.equal(count(prompt + judge + component, 'Canary preview (does this prompt still classify obvious cases correctly?)'), 1, 'preview copy has one implementation');
});

test('Stale, loading, badges, divergence, and copy contracts live in the shared component', () => {
  for (const needle of [
    'const stale = canarySource != null && prompt !== canarySource;',
    'opacity: stale ? 0.5 : 1',
    'onClick={onRerun}',
    'disabled={rerunning}',
    'Canary preview (does this prompt still classify obvious cases correctly?)',
    'Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.',
    "rerunning ? <><RefreshCw size={11} className=\"animate-spin-custom\" style={{ marginRight: '6px' }} /> Running…</> : 'Re-run canaries'",
    "c.expected === 'SECURE' ? 'badge-secure' : c.expected === 'VULNERABLE' ? 'badge-vulnerable' : ''",
    "c.status === 'SECURE' ? 'badge-secure' : c.status === 'VULNERABLE' ? 'badge-vulnerable' : ''",
    "c.diverged ? '✗' : '✓'",
    "c.diverged && <span style={{ color: 'var(--color-vulnerable)' }}>diverged</span>",
  ]) assert.equal(count(component, needle), 1, `shared component preserves ${needle}`);
});

let bundle;
let bundleError;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't21-canary-preview');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, `import CanaryPreview from '${join(root, 'src/components/modals/CanaryPreview.jsx')}';\nexport default CanaryPreview;\n`);
  const build = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/, /^lucide-react$/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } },
  });
  const { output } = await build.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const outputPath = join(dir, 'bundle.mjs');
  writeFileSync(outputPath, output[0].code);
  await build.close();
  bundle = await import(pathToFileURL(outputPath).href);
} catch (error) {
  bundleError = error;
}

const canaries = [
  { name: 'obvious refusal', expected: 'VULNERABLE', status: 'SECURE', diverged: true },
  { name: 'benign question', expected: 'SECURE', status: 'SECURE', diverged: false },
  { name: 'ambiguous answer', expected: 'INCONCLUSIVE', status: 'INCONCLUSIVE', diverged: false },
];

async function render(props) {
  assert.ifError(bundleError);
  const { JSDOM } = await import('jsdom');
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1/' });
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Element', 'getComputedStyle']) globalThis[key] = dom.window[key];
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.getElementById('root');
  const reactRoot = createRoot(container);
  await act(async () => reactRoot.render(React.createElement(bundle.default, props)));
  return { act, container, dom, reactRoot };
}

test('Runtime: empty canaries render nothing', async () => {
  for (const empty of [null, [], 'not-an-array']) {
    const h = await render({ canaries: empty, canarySource: 'p', prompt: 'p', rerunning: false, onRerun() {} });
    assert.equal(h.container.textContent, '');
    await h.act(async () => h.reactRoot.unmount());
  }
});

test('Runtime: fresh rows preserve ordering, badges, and divergence details', async () => {
  const h = await render({ canaries, canarySource: 'current', prompt: 'current', rerunning: false, onRerun() {} });
  const text = h.container.textContent;
  assert.ok(text.includes('obvious refusal — expectedVULNERABLEgotSECUREdiverged'));
  assert.ok(text.indexOf('obvious refusal') < text.indexOf('benign question') && text.indexOf('benign question') < text.indexOf('ambiguous answer'));
  assert.equal(h.container.querySelectorAll('.badge-vulnerable').length, 1);
  assert.equal(h.container.querySelectorAll('.badge-secure').length, 3);
  assert.equal(h.container.querySelectorAll('.badge:not(.badge-secure):not(.badge-vulnerable)').length, 2);
  assert.equal((text.match(/✗/g) || []).length, 1);
  assert.equal((text.match(/✓/g) || []).length, 2);
  assert.ok(!text.includes('Stale —'));
  assert.equal(h.container.firstElementChild.style.opacity, '1');
  await h.act(async () => h.reactRoot.unmount());
});

test('Runtime: stale state dims and warns; rerun state disables without dispatch', async () => {
  let calls = 0;
  const h = await render({ canaries, canarySource: 'old', prompt: 'edited', rerunning: true, onRerun: () => { calls += 1; } });
  assert.equal(h.container.firstElementChild.style.opacity, '0.5');
  assert.ok(h.container.textContent.includes('Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.'));
  const button = h.container.querySelector('button');
  assert.equal(button.textContent.trim(), 'Running…');
  assert.equal(button.disabled, true);
  await h.act(async () => button.click());
  assert.equal(calls, 0);
  await h.act(async () => h.reactRoot.unmount());
});

test('Runtime: enabled rerun invokes the supplied callback once with the click event', async () => {
  const args = [];
  const h = await render({ canaries, canarySource: null, prompt: 'current', rerunning: false, onRerun: (...received) => args.push(received) });
  const button = h.container.querySelector('button');
  assert.equal(button.textContent.trim(), 'Re-run canaries');
  await h.act(async () => button.click());
  assert.equal(args.length, 1);
  assert.equal(args[0].length, 1);
  assert.equal(args[0][0].type, 'click');
  await h.act(async () => h.reactRoot.unmount());
});
