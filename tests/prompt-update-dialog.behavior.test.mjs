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
const dir = join(root, '.tmp', 'prompt-update-dialog-behavior');
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

test('prompt update renders judge-only controls and copy across key and state changes', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1/' });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'Element', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
  });
  const container = document.getElementById('root');
  const reactRoot = createRoot(container);
  let update;
  const props = {
    promptDraft: {}, getPromptOverrides: () => ({}),
    setPromptUpdate: updater => { update = updater(update); },
    closePromptUpdate() {}, applyPromptUpdate() {}, rerunPromptUpdateCanaries() {},
    runPromptUpdate() {}, refinePromptUpdate() {}, vaultLocked: false,
  };
  const render = async () => {
    await act(async () => reactRoot.render(React.createElement(PromptUpdateDialog, { ...props, promptUpdate: update })));
  };
  const shortNote = "This rewrite was checked to keep the prompt's required placeholders; instructions forcing a fixed outcome were rejected. Review it before applying.";
  const judgeNote = "This rewrite keeps required placeholders, but verdict behavior was not automatically validated — review the canary preview before applying.";
  const judgeFlaggedNote = "This rewrite keeps required placeholders, but it was flagged as possibly forcing a fixed outcome — review it before applying.";
  try {
    for (const key of ['judge_system', 'propose_system', 'judge_user', 'assess_system', 'analyzer_system', 'generator_system', 'critic_system']) {
      const judge = key === 'judge_system' || key === 'judge_user';
      update = { key, state: 'feedback', feedback: '', next: 'Candidate', canaries: null };
      await render();
      let checkbox = container.querySelector('input[type="checkbox"]');
      assert.equal(!!checkbox, judge, key);
      assert.ok(!container.textContent.includes('the prompt will still be checked when you apply it'));
      if (judge) {
        assert.equal(checkbox.closest('label').textContent.trim(), 'Skip canary preview');
        assert.equal(checkbox.checked, false);
        await act(async () => checkbox.click());
        assert.equal(update.skipCanaries, true);
        await render();
        checkbox = container.querySelector('input[type="checkbox"]');
        assert.equal(checkbox.checked, true);
        await act(async () => checkbox.click());
        assert.equal(update.skipCanaries, false);
      }
      update = { ...update, state: 'preview' };
      await render();
      const note = [...container.querySelectorAll('span')].find(span => span.textContent.startsWith('This rewrite'));
      assert.equal(note?.textContent, judge ? judgeNote : shortNote, key);
      assert.ok(!container.textContent.includes('was validated'), `${key}: no false validation claim`);
      if (judge) {
        update = { ...update, state: 'preview', rejected: 'forcing signal' };
        await render();
        const flagged = [...container.querySelectorAll('span')].find(span => span.textContent.startsWith('This rewrite'));
        assert.equal(flagged?.textContent, judgeFlaggedNote, `${key}: flagged wording`);
      }
      assert.equal(container.querySelector('input[type="checkbox"]'), null);
      for (const state of ['loading', 'refining', 'error']) {
        update = { ...update, state, error: 'test error' };
        await render();
        assert.equal(container.querySelector('input[type="checkbox"]'), null);
        assert.ok(!container.textContent.includes('This rewrite was validated'));
      }
    }
  } finally {
    await act(async () => reactRoot.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
