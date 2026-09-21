// Contract: the custom-test create/edit dialog renders from
// src/components/modals/CustomTestFormModal.jsx as a
// self-feeding context consumer — the module calls useTests() itself and
// renders from TestsContext state (showAddCustom / editingTestId / customForm,
// submitting via handleAddCustomTest) with ZERO form state of its own.
// App.jsx carries none of the inline JSX region and mounts <CustomTestFormModal />
// at the "5. DIALOG MODAL: ADD CUSTOM TEST CASE" spot. The module-side pins
// lock the exact field set, the six tactic options, every placeholder and
// helper copy, the required markers, the two close paths and the dual-mode
// title/submit labels.
//
// Mixed levels: source-text pins (Node cannot import JSX/extensionless
// specifiers under bare node:test — repo convention) for the module shape and
// the App seam, plus a rolldown/jsdom runtime section that mounts the REAL
// module inside the REAL UIProvider > TestsProvider tree and drives the
// dialog: open, cancel, and a full create submit whose payload mapping
// (keyword split/trim, tactic default, origin stamping,
// persistence) is asserted against live context state and the real
// localStorage keys (same technique as tests/catalog-actions.contract.test.mjs).
// Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODAL_PATH = 'src/components/modals/CustomTestFormModal.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
// Independent reads: a missing TARGET module must not blank the other
// sources (absence-only pins would otherwise pass vacuously).
const readOrEmpty = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
const modal = readOrEmpty(MODAL_PATH);
const app = readOrEmpty('src/App.jsx');
const testsContext = readOrEmpty('src/context/TestsContext.jsx');

const countIn = (source, needle) => source.split(needle).length - 1;
const norm = (text) => text.replace(/\s+/g, ' ').trim();

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (body, label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: '${needle}' appears after the previous pin (order pin)`);
    cursor = at;
  }
};

// ---------------------------------------------------------------------------
// the module renders the dialog from TestsContext state and owns zero form state
// ---------------------------------------------------------------------------

test('The module exists, exports CustomTestFormModal once, and consumes useTests()', () => {
  assert.ok(modal.length > 0, `${MODAL_PATH} exists (the extraction landed)`);
  const exportCount = countIn(modal, 'CustomTestFormModal');
  assert.ok(exportCount >= 2, 'the component name appears (declaration + usage)');
  assert.equal(
    (modal.match(/export (default )?(function|const) CustomTestFormModal/g) || []).length,
    1,
    'exactly one CustomTestFormModal export declaration'
  );
  assert.match(
    modal,
    /import\s*\{\s*useTests\s*\}\s*from\s*'\.\.\/\.\.\/context\/TestsContext(\.jsx)?';/,
    'the module consumes the shared TestsContext hook (A1: renders from TestsContext state)'
  );
  // The module destructures the whole dialog contract from the hook.
  for (const symbol of ['showAddCustom', 'setShowAddCustom', 'editingTestId', 'setEditingTestId', 'customForm', 'setCustomForm', 'handleAddCustomTest']) {
    assert.ok(
      new RegExp(`\\b${symbol}\\b`).test(modal),
      `the module consumes ${symbol} from useTests()`
    );
  }
  // Zero form state of its own: no local useState for any dialog atom (the
  // grep gate — no duplicated form state).
  for (const decl of ['const [showAddCustom', 'const [editingTestId', 'const [customForm']) {
    assert.equal(countIn(modal, decl), 0, `the module declares no local ${decl}`);
  }
});

test('Header — dual-mode title, close icon, exactly two close paths resetting both atoms', () => {
  assert.ok(
    modal.includes("{editingTestId ? 'Edit test payload' : 'Create custom diagnostic prompt'}"),
    'the title is dual-mode: edit vs create'
  );
  assert.ok(modal.includes('data-tip="Close"'), 'the header has the tooltip Close icon button');
  assert.ok(modal.includes('<X size={14} />'), 'the close button renders the X icon at size 14');
  assert.equal(
    countIn(modal, 'setShowAddCustom(false); setEditingTestId(null);'),
    2,
    'exactly two close paths, each resetting both dialog atoms'
  );
});

test('The dialog form submits via the context handleAddCustomTest', () => {
  assert.ok(
    modal.includes('<form onSubmit={handleAddCustomTest}'),
    'the form submit is wired to the TestsContext operation (A1/A2)'
  );
});

test('Name field — required, bound to customForm.name, canonical placeholder', () => {
  assert.ok(modal.includes('<label className="form-label">Test Case Name *</label>'), 'the name label carries the required marker');
  const valueAt = modal.indexOf('value={customForm.name}');
  assert.ok(valueAt > 0, 'the name input is bound to customForm.name');
  const block = modal.slice(modal.lastIndexOf('<input', valueAt), modal.indexOf('/>', valueAt));
  assert.ok(block.includes('type="text"'), 'the name input is a text input');
  assert.ok(block.includes('placeholder="e.g. Jailbreak Adversarial Suffix"'), 'the name input keeps its canonical placeholder');
  assert.ok(block.includes('className="form-input"'), 'the name input uses form-input');
  assert.ok(/\brequired\b/.test(block), 'the name input is required');
  assert.ok(block.includes('setCustomForm(p => ({ ...p, name: e.target.value }))'), 'the name input updates customForm.name');
});

test('Technique grid — 1fr 1fr grids with Technique ID/Name inputs', () => {
  assert.equal(
    countIn(modal, "gridTemplateColumns: '1fr 1fr'"),
    2,
    'exactly two two-column grids: technique pair and indicator pair'
  );
  assert.ok(modal.includes('<label className="form-label">Technique ID</label>'), 'the Technique ID label exists (no required marker)');
  assert.ok(modal.includes('<label className="form-label">Technique Name</label>'), 'the Technique Name label exists (no required marker)');
  for (const [field, placeholder] of [
    ['techniqueId', 'e.g. AML.T0034'],
    ['techniqueName', 'e.g. LLM Prompt Injection']
  ]) {
    const valueAt = modal.indexOf(`value={customForm.${field}}`);
    assert.ok(valueAt > 0, `the ${field} input is bound to customForm.${field}`);
    const block = modal.slice(modal.lastIndexOf('<input', valueAt), modal.indexOf('/>', valueAt));
    assert.ok(block.includes(`placeholder="${placeholder}"`), `the ${field} input keeps its canonical placeholder`);
    assert.ok(block.includes(`setCustomForm(p => ({ ...p, ${field}: e.target.value }))`), `the ${field} input updates customForm.${field}`);
    assert.ok(!/\brequired\b/.test(block), `the ${field} input is NOT required`);
  }
});

test('Tactic select — exactly the six ATLAS tactics in canonical order', () => {
  const selectStart = modal.indexOf('value={customForm.tactic}');
  assert.ok(selectStart > 0, 'the tactic select is bound to customForm.tactic');
  const selectEnd = modal.indexOf('</select>', selectStart);
  assert.ok(selectEnd > selectStart, 'the tactic select closes');
  const select = modal.slice(modal.lastIndexOf('<select', selectStart), selectEnd);
  assert.ok(select.includes('className="form-input"'), 'the tactic select uses form-input');
  assert.ok(select.includes('setCustomForm(p => ({ ...p, tactic: e.target.value }))'), 'the tactic select updates customForm.tactic');
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(
    options,
    [
      ['Reconnaissance', 'Reconnaissance'],
      ['ML Model Access', 'ML Model Access'],
      ['Execution', 'Execution'],
      ['Defense Evasion', 'Defense Evasion'],
      ['Exfiltration', 'Exfiltration'],
      ['Impact', 'Impact']
    ],
    'the tactic select offers exactly the six ATLAS tactics, in order, value === label'
  );
});

test('Description + system prompt textareas with canonical placeholders', () => {
  for (const [field, label, placeholder] of [
    ['description', 'Description / Rationale', 'Explain the security threat vector tested by this prompt.'],
    ['systemPrompt', 'System Prompt / Instructions', 'Developer settings or constraints set on the target model.']
  ]) {
    const labelAt = modal.indexOf(`<label className="form-label">${label}</label>`);
    assert.ok(labelAt > 0, `the ${label} label exists`);
    const valueAt = modal.indexOf(`value={customForm.${field}}`, labelAt);
    assert.ok(valueAt > labelAt, `the ${field} textarea follows its label`);
    const block = modal.slice(modal.lastIndexOf('<textarea', valueAt), modal.indexOf('/>', valueAt));
    assert.ok(block.includes(`placeholder="${placeholder}"`), `the ${field} textarea keeps its canonical placeholder`);
    assert.ok(block.includes(`setCustomForm(p => ({ ...p, ${field}: e.target.value }))`), `the ${field} textarea updates customForm.${field}`);
    assert.ok(block.includes("minHeight: '60px'"), `the ${field} textarea keeps its 60px min height`);
    assert.ok(!/\brequired\b/.test(block), `the ${field} textarea is NOT required`);
  }
});

test('Attacker payload textarea — the second required field, 80px min height', () => {
  assert.ok(
    modal.includes('<label className="form-label">Attacker Prompt Payload *</label>'),
    'the payload label carries the required marker'
  );
  const valueAt = modal.indexOf('value={customForm.userPrompt}');
  assert.ok(valueAt > 0, 'the payload textarea is bound to customForm.userPrompt');
  const block = modal.slice(modal.lastIndexOf('<textarea', valueAt), modal.indexOf('/>', valueAt));
  assert.ok(
    block.includes('placeholder="The malicious injection payload designed to override system guidelines."'),
    'the payload textarea keeps its canonical placeholder'
  );
  assert.ok(block.includes('setCustomForm(p => ({ ...p, userPrompt: e.target.value }))'), 'the payload textarea updates customForm.userPrompt');
  assert.ok(block.includes("minHeight: '80px'"), 'the payload textarea keeps its 80px min height');
  assert.ok(/\brequired\b/.test(block), 'the payload textarea is required');
  assert.equal(countIn(modal, /\brequired\b/), 2, 'exactly two required markers in the dialog');
});

test('Keyword indicator pair — labels, placeholders, helper copy, bindings (ordered)', () => {
  // Ordered pin: the full field sequence in DOM order.
  ordered(norm(modal), 'dialog field order', [
    'Test Case Name *', 'Technique ID', 'Technique Name', 'Tactic',
    'Description / Rationale', 'System Prompt / Instructions',
    'Attacker Prompt Payload *',
    'Failure Indicators (Comma separated)', 'Refusal Indicators (Comma separated)'
  ]);
  for (const [field, label, placeholder, helper] of [
    ['failKeywords', 'Failure Indicators (Comma separated)', 'e.g. code, script, override', 'Keywords indicating the attack succeeded.'],
    ['refusalKeywords', 'Refusal Indicators (Comma separated)', 'e.g. sorry, cannot, policy', 'Keywords indicating the attack was resisted.']
  ]) {
    const labelAt = modal.indexOf(`<label className="form-label">${label}</label>`);
    assert.ok(labelAt > 0, `the ${label} label exists`);
    const valueAt = modal.indexOf(`value={customForm.${field}}`, labelAt);
    assert.ok(valueAt > labelAt, `the ${field} input follows its label`);
    const block = modal.slice(modal.lastIndexOf('<input', valueAt), modal.indexOf('/>', valueAt));
    assert.ok(block.includes(`placeholder="${placeholder}"`), `the ${field} input keeps its canonical placeholder`);
    assert.ok(block.includes(`setCustomForm(p => ({ ...p, ${field}: e.target.value }))`), `the ${field} input updates customForm.${field}`);
    const helperAt = modal.indexOf(helper, valueAt);
    assert.ok(helperAt > valueAt, `the '${helper}' helper copy follows its input`);
    assert.equal(countIn(modal, helper), 1, `the '${helper}' helper copy appears exactly once`);
  }
});

test('Footer — Cancel (btn-secondary) + dual-mode submit (btn-primary)', () => {
  const footerAt = modal.indexOf("justifyContent: 'flex-end'");
  assert.ok(footerAt > 0, 'the footer row is right-aligned');
  const footer = modal.slice(footerAt, modal.indexOf('</form>', footerAt));
  assert.ok(footer.includes('<button type="button"'), 'Cancel is a type=button (no submit)');
  assert.ok(footer.includes('className="btn-secondary"'), 'Cancel uses btn-secondary');
  assert.ok(footer.includes('Cancel'), 'the secondary button is labelled Cancel');
  assert.ok(footer.includes('<button type="submit" className="btn-primary">'), 'the submit button is type=submit btn-primary');
  assert.ok(
    footer.includes("{editingTestId ? 'Update Test' : 'Save Payload'}"),
    'the submit label is dual-mode: Update Test vs Save Payload'
  );
});

// ---------------------------------------------------------------------------
// App carries none of the inline dialog and mounts the module
// ---------------------------------------------------------------------------

test('App.jsx no longer contains the dialog JSX; the extraction is unambiguous', () => {
  for (const needle of ['Create custom diagnostic prompt', 'Attacker Prompt Payload *', 'Test Case Name *', 'Save Payload', 'Test Case Name']) {
    assert.equal(countIn(app, needle), 0, `App no longer carries '${needle}' (the ~150-line region moved)`);
  }
  for (const needle of ['customForm.', 'setCustomForm(', 'handleAddCustomTest', 'editingTestId']) {
    assert.equal(countIn(app, needle), 0, `App sheds all '${needle}' plumbing (A3: beyond the context handoff)`);
  }
});

test('App mounts <CustomTestFormModal /> exactly once; no duplicated dialog state', () => {
  assert.match(app, /import\s+CustomTestFormModal\s+from\s*'\.\/components\/modals\/CustomTestFormModal';/, 'App imports the modal module exactly once');
  assert.equal(countIn(app, '<CustomTestFormModal'), 1, 'exactly one mount site');
  // The grep gate holds App-side too: no local form state re-introduced.
  for (const decl of ['const [showAddCustom', 'const [editingTestId', 'const [customForm']) {
    assert.equal(countIn(app, decl), 0, `App declares no local ${decl} (state stays context-owned)`);
  }
  assert.match(testsContext, /const \[customForm, setCustomForm\] = useState\(/, 'TestsContext still owns the form state');
});

// ---------------------------------------------------------------------------
// Runtime behavioral: the REAL module inside the REAL UIProvider >
// TestsProvider tree — open, cancel, and a full create submit whose payload
// mapping is asserted against live context state and real localStorage keys
// ---------------------------------------------------------------------------

let modalBundle = null;
let modalBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't14-custom-test-modal-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { UIProvider } from '${abs('src/context/UIContext.jsx')}';`,
    `export { useUI } from '${abs('src/context/useUI.js')}';`,
    `export { TestsProvider, useTests } from '${abs('src/context/TestsContext.jsx')}';`,
    `import * as modalNs from '${abs(MODAL_PATH)}';`,
    'export { modalNs };'
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'modal-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  modalBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  modalBundleError = err;
}

// Mounts UIProvider > TestsProvider with the REAL CustomTestFormModal and a
// state probe. Returns the act helper plus the sink (live context values).
const mountModal = async () => {
  assert.ok(!modalBundleError, `the modal bundle must build under rolldown: ${modalBundleError?.stack || modalBundleError}`);
  const { UIProvider, TestsProvider, modalNs } = modalBundle;
  const Modal = modalNs.default ?? modalNs.CustomTestFormModal;
  assert.equal(typeof Modal, 'function', 'the module resolves to the CustomTestFormModal component');
  const { JSDOM } = await import('jsdom');
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  localStorage.clear();
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'Element', 'getComputedStyle', 'customElements', 'Event']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const sink = {};
  const { useTests } = modalBundle;
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    sink.tests = useTests();
    return null;
  }
  /* oxlint-enable react/immutability */
  let mountRoot;
  await act(async () => {
    mountRoot = createRoot(document.getElementById('root'));
    mountRoot.render(
      React.createElement(UIProvider, null,
        React.createElement(TestsProvider, null,
          React.createElement(Modal),
          React.createElement(Probe)
        )
      )
    );
    await new Promise((r) => setTimeout(r, 120));
  });
  const cleanup = async () => {
    await act(async () => { mountRoot.unmount(); });
    try { dom.window.close(); } catch { /* jsdom window cleanup is best-effort */ }
  };
  return { sink, act, dom, mountRoot, cleanup };
};

// Fills the dialog THROUGH the context (the contract the dialog binds to):
// every App-side input calls setCustomForm(p => ({ ...p, key: value })), so the
// runtime drives the same action and then pins the RENDERING of that state —
// the controlled inputs must display the context values exactly. (DOM-level
// input-event synthesis is deliberately avoided: React 19 + jsdom suppress
// manually dispatched input/change events at the ChangeEventPlugin layer,
// while clicks and submit dispatch are delegated normally.)
const fillThroughContext = async (sink, act, patch) => {
  await act(async () => {
    sink.tests.setCustomForm((p) => ({ ...p, ...patch }));
  });
};

const fieldByPlaceholder = (placeholder) => {
  const el = [...document.querySelectorAll('input, textarea')].find((n) => n.placeholder === placeholder);
  assert.ok(el, `a field with placeholder '${placeholder}' renders in the dialog`);
  return el;
};

test('Runtime: the mounted module renders context state and its submit maps the payload exactly', async () => {
  const { sink, act, dom, cleanup } = await mountModal();
  try {
    // Closed by default; the module renders nothing when showAddCustom is false.
    assert.equal(sink.tests.showAddCustom, false, 'the dialog is closed by default');
    assert.equal(document.body.textContent.includes('Create custom diagnostic prompt'), false, 'no dialog markup when closed');

    // Open via the real context action (the openAddTest surface).
    await act(async () => { sink.tests.openAddTest(); });
    assert.equal(sink.tests.showAddCustom, true, 'openAddTest opens the dialog');
    assert.equal(document.body.textContent.includes('Create custom diagnostic prompt'), true, 'the create-mode title renders');

    // The rendering pin: the controlled fields display context state exactly.
    await fillThroughContext(sink, act, {
      name: 'Runtime Probe Payload',
      techniqueId: 'AML.T9999',
      techniqueName: 'Probe Injection',
      tactic: 'Exfiltration',
      description: 'probe rationale',
      systemPrompt: 'probe system prompt',
      userPrompt: ' OVERRIDE ME ',
      failKeywords: ' code , script , override '
    });
    assert.equal(fieldByPlaceholder('e.g. Jailbreak Adversarial Suffix').value, 'Runtime Probe Payload', 'the name input renders context customForm.name');
    assert.equal(fieldByPlaceholder('e.g. AML.T0034').value, 'AML.T9999', 'the techniqueId input renders context state');
    assert.equal(fieldByPlaceholder('e.g. LLM Prompt Injection').value, 'Probe Injection', 'the techniqueName input renders context state');
    assert.equal(fieldByPlaceholder('Explain the security threat vector tested by this prompt.').value, 'probe rationale', 'the description textarea renders context state');
    assert.equal(fieldByPlaceholder('The malicious injection payload designed to override system guidelines.').value, ' OVERRIDE ME ', 'the payload textarea renders context state verbatim');
    assert.equal(fieldByPlaceholder('e.g. code, script, override').value, ' code , script , override ', 'the failKeywords input renders context state');

    // Submit via the form: routes to the context handleAddCustomTest.
    await act(async () => {
      const form = document.querySelector('form');
      assert.ok(form, 'the dialog form renders');
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));
    });

    // The dialog closed and the form reset.
    assert.equal(sink.tests.showAddCustom, false, 'submit closes the dialog');
    assert.equal(sink.tests.customForm.name, '', 'submit resets the form');

    // The payload mapping: exactly one new custom test with the pinned shape.
    const created = sink.tests.customTests.find((t) => t.name === 'Runtime Probe Payload');
    assert.ok(created, 'the submitted payload lands in context customTests');
    assert.ok(created.id.startsWith('custom_'), 'create mode stamps a custom_ id');
    assert.equal(created.tactic, 'Exfiltration', 'the tactic value is honored');
    assert.equal(created.techniqueId, 'AML.T9999', 'techniqueId round-trips');
    assert.equal(created.techniqueName, 'Probe Injection', 'techniqueName round-trips');
    assert.equal(created.description, 'probe rationale', 'description round-trips');
    assert.equal(created.systemPrompt, 'probe system prompt', 'systemPrompt round-trips');
    assert.equal(created.userPrompt, ' OVERRIDE ME ', 'userPrompt round-trips verbatim (no trim)');
    assert.deepEqual(created.failKeywords, ['code', 'script', 'override'], 'failKeywords split + trimmed on comma');
    assert.deepEqual(created.refusalKeywords, [], 'untouched refusalKeywords becomes []');
    assert.equal(created.evaluationMode, undefined, 'the inert evaluationMode field is no longer stamped');
    assert.equal(created.origin, 'User Defined Custom Payload', 'create mode stamps the custom origin');
    assert.equal(created.isAuto, false, 'custom payloads are not auto');
    assert.ok(sink.tests.selectedTests.includes(created.id), 'the new test is selected into the suite');

    // Persistence: the real localStorage key carries the payload.
    const stored = JSON.parse(localStorage.getItem('atlas_custom_tests') || '[]');
    assert.ok(stored.some((t) => t.id === created.id && t.name === 'Runtime Probe Payload'), 'the payload persists to atlas_custom_tests');
  } finally {
    await cleanup();
  }
});

test('Runtime: the Cancel path resets both dialog atoms', async () => {
  const { sink, act, cleanup } = await mountModal();
  try {
    await act(async () => { sink.tests.openAddTest(); });
    assert.equal(sink.tests.showAddCustom, true, 'precondition: the dialog opened');

    await act(async () => {
      const cancel = [...document.querySelectorAll('button')].find((b) => b.className.includes('btn-secondary') && b.textContent.trim() === 'Cancel');
      assert.ok(cancel, 'the Cancel button renders');
      cancel.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(sink.tests.showAddCustom, false, 'Cancel closes the dialog');
    assert.equal(sink.tests.editingTestId, null, 'Cancel clears editingTestId');
    assert.equal(sink.tests.customForm.name, '', 'Cancel leaves no form residue');
  } finally {
    await cleanup();
  }
});
