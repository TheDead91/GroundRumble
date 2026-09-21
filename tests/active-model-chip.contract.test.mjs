// Regression guard for BUG #1: running a comparison audit with the
// heuristic (keywords) engine rendered `Judge: undefined (0 models)/default`
// on the running chip. Root cause: the ActiveModelChip blindly interpolated
// providerLabel(cfg.provider) — and providerLabel, called with a provider id,
// read `id.name` (undefined) — then appended `/{cfg.model || 'default'}`.
//
// Guards:
//  1. resolveProviderLabel (pure util) resolves provider ids to names and
//     never emits the "undefined (0 models)" interpolation artifact.
//  2. The real ActiveModelChip renders a clean label when no provider is
//     configured (heuristic runs show the engine name).
//  3. RunnerView passes an engine-aware running-chip label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const count = (source, needle) => source.split(needle).length - 1;

const { resolveProviderLabel } = await import('../src/utils/provider-record.js');

test('resolveProviderLabel: unset/empty refs label cleanly instead of interpolating garbage', () => {
  const providers = [{
    id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-5'], endpoint: 'https://api.openai.com/v1', connector: 'openai'
  }];
  assert.equal(resolveProviderLabel('', providers), 'Not configured', 'empty provider -> "Not configured"');
  assert.equal(resolveProviderLabel(null, providers), 'Not configured', 'null provider -> "Not configured"');
  assert.equal(resolveProviderLabel(undefined, providers), 'Not configured', 'undefined provider -> "Not configured"');
});

test('resolveProviderLabel: resolves provider ids to name + model-count labels', () => {
  const providers = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-5'], endpoint: 'https://api.openai.com/v1', connector: 'openai' },
    { id: 'local', name: 'Ollama', models: [], endpoint: 'http://localhost:11434/v1', connector: 'openai' }
  ];
  assert.equal(resolveProviderLabel('openai', providers), 'OpenAI (2 models)', 'known id renders the provider label');
  assert.equal(resolveProviderLabel('local', providers), 'Ollama (0 models)', 'known id with zero models renders the provider label');
  assert.equal(resolveProviderLabel({ name: 'Obj', models: ['m'] }, providers), 'Obj (1 models)', 'provider objects still label directly');
  assert.equal(resolveProviderLabel('unknown-id', providers), 'unknown-id', 'unknown id falls back to the raw id, not garbage');
  assert.ok(!resolveProviderLabel('openai', providers).includes('undefined'), 'no "undefined" artifact for resolved ids');
});

test('BUG #1: ProvidersContext labels ids via the pure resolver (no id.name interpolation)', () => {
  const ctx = read('src/context/ProvidersContext.jsx');
  assert.ok(ctx.includes("resolveProviderLabel(ref, providers)"), 'ProviderLabel delegates to the pure resolver');
  assert.ok(ctx.includes("import { validateProviders, resolveProviderLabel } from '../utils/provider-record.js';"), 'ProviderContext imports the resolver');
  assert.equal(count(ctx, 'const providerLabel = useCallback((ref) => {'), 1, 'ProviderLabel takes a ref and resolves it');
  assert.doesNotMatch(ctx, /providerLabel = useCallback\(\(cp\) => `${cp\.name}/, 'the naive id-unaware label body is gone');
});

let bundle;
let bundleError;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 'active-model-chip');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, `import { ActiveModelChip } from '${join(root, 'src/components/ActiveModelChip.jsx')}';\nexport { ActiveModelChip };\n`);
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
  const rootNode = document.getElementById('root');
  const reactRoot = createRoot(rootNode);
  await act(async () => reactRoot.render(React.createElement(bundle.ActiveModelChip, props)));
  return { act, rootNode, reactRoot };
}

const defaultResolver = (id) => (id === 'p1' ? 'OpenAI (12 models)' : id === 'groq' ? 'Groq (13 models)' : id);

test('BUG #1 runtime: unset judge config renders a clean label, not "undefined (0 models)/default"', async () => {
  const h = await render({ label: 'Judge:', cfg: { provider: '', model: '' }, providerLabel: defaultResolver });
  const text = h.rootNode.textContent;
  assert.equal(text, 'Judge:', 'unset judge chip shows the bare label');
  assert.ok(!text.includes('undefined'), 'no "undefined (0 models)" artifact');
  assert.ok(!text.includes('default'), 'no "/default" artifact');
  await h.act(async () => h.reactRoot.unmount());
});

test('BUG #1 runtime: heuristic runs show the engine name on the chip', async () => {
  const h = await render({ label: 'Heuristic Keywords (offline)', cfg: { provider: '', model: '' }, providerLabel: defaultResolver });
  assert.equal(h.rootNode.textContent, 'Heuristic Keywords (offline)', 'heuristic chip reads the engine, offline');
  await h.act(async () => h.reactRoot.unmount());
});

test('BUG #1 runtime: a configured judge keeps showing provider/model on the chip', async () => {
  const h = await render({ label: 'Judge:', cfg: { provider: 'p1', model: 'gpt-4o' }, providerLabel: defaultResolver });
  assert.equal(h.rootNode.textContent, 'Judge: OpenAI/gpt-4o', 'configured judge chip shows provider/model without the model count');
  await h.act(async () => h.reactRoot.unmount());
});

test('BUG runtime: AI-judge running chip drops the model-count suffix (Judge: Groq/allam-2-7b)', async () => {
  const h = await render({ label: 'Judge:', cfg: { provider: 'groq', model: 'allam-2-7b' }, providerLabel: defaultResolver });
  assert.equal(h.rootNode.textContent, 'Judge: Groq/allam-2-7b', 'chip renders provider/model without "(N models)"');
  assert.ok(!h.rootNode.textContent.includes('models'), 'no model-count artifact on the running chip');
  await h.act(async () => h.reactRoot.unmount());
});

test('BUG: ActiveModelChip strips the model-count suffix from the provider label', () => {
  const src = read('src/components/ActiveModelChip.jsx');
  assert.ok(src.includes(".replace(/ \\(\\d+ models\\)$/, '')"), 'chip strips the "(N models)" count from providerLabel');
  assert.doesNotMatch(src, /providerLabel\(cfg\.provider\)}\//, 'no count-laden providerLabel interpolation remains in the chip');
});

test('BUG #1 runtime: null cfg never throws and renders the label', async () => {
  const h = await render({ label: 'Judge:', cfg: null, providerLabel: defaultResolver });
  assert.equal(h.rootNode.textContent, 'Judge:', 'null cfg falls back to the bare label');
  await h.act(async () => h.reactRoot.unmount());
});

test('BUG #1: RunnerView drives the running chip with an engine-aware label', () => {
  const view = read('src/components/views/RunnerView.jsx');
  assert.ok(view.includes("'Heuristic Keywords (offline)'"), 'runner labels heuristic runs with the engine name');
  assert.equal(count(view, 'renderActiveModelChip'), 2, 'runner keeps exactly its chip prop destructure + call site');
});