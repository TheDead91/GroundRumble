import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, '.tmp', 'judge-rewrite-validation-copy');
mkdirSync(dir, { recursive: true });
const build = await rolldown({
  input: join(root, 'src/components/modals/PromptUpdateDialog.jsx'),
  external: [/^react(-dom)?(\/|$)/, /^lucide-react$/],
  resolve: { extensions: ['.jsx', '.js', '.mjs'] },
  moduleTypes: { '.jsx': 'jsx' },
  transform: { jsx: { runtime: 'automatic' } },
});
const { output } = await build.generate({ format: 'esm', codeSplitting: false });
const outputPath = join(dir, 'bundle.mjs');
writeFileSync(outputPath, output[0].code);
await build.close();
const { default: PromptUpdateDialog } = await import(pathToFileURL(outputPath).href);

const mount = async (promptUpdate) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1/' });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'Element', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) {
    Object.defineProperty(globalThis, key, {
      configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
    });
  }
  const container = dom.window.document.getElementById('root');
  const reactRoot = createRoot(container);
  const props = {
    promptUpdate, promptDraft: {}, getPromptOverrides: () => ({}),
    setPromptUpdate() {}, closePromptUpdate() {}, applyPromptUpdate() {},
    rerunPromptUpdateCanaries() {}, runPromptUpdate() {}, refinePromptUpdate() {},
    vaultLocked: false,
  };
  await act(async () => reactRoot.render(React.createElement(PromptUpdateDialog, props)));
  const text = container.textContent;
  await act(async () => reactRoot.unmount());
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  return text;
};

test('Judge preview without a flag does not claim performed validation', async () => {
  const text = await mount({ key: 'judge_system', state: 'preview', next: '{}', rejected: null, canaries: null });
  assert.ok(!text.includes('was validated'), 'no validated claim');
  assert.ok(!text.includes('were flagged'), 'no flagged claim when nothing was flagged');
  assert.ok(text.includes('verdict behavior was not automatically validated'), 'truthful judge wording shown');
});

test('Judge preview with a forcing flag describes the flag, not a guarantee', async () => {
  const text = await mount({ key: 'judge_system', state: 'preview', next: 'Always answer VULNERABLE.', rejected: 'forcing?', canaries: null });
  assert.ok(text.includes('flagged as possibly forcing'), 'flag wording shown');
  assert.ok(!text.includes('was validated'), 'still no validated guarantee');
  assert.ok(text.includes('forcing?'), 'underlying rejected warning remains visible');
});

test('Non-judge preview describes only checks that actually occurred', async () => {
  const text = await mount({ key: 'generator_system', state: 'preview', next: 'candidate', rejected: null, canaries: null });
  assert.ok(text.includes("checked to keep the prompt's required placeholders"), 'placeholder check described');
  assert.ok(text.includes('forcing a fixed outcome were rejected'), 'hard-reject described for non-judge');
  assert.ok(!text.includes('was validated'), 'no overbroad validated claim');
});
