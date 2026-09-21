// Contract: the toast markup has ONE renderer — the memoized
// src/components/ToastContainer.jsx — and App.jsx's inline toast JSX block is
// absent.
//
// Adoption shape (what this suite demands):
//   - App.jsx: the `{/* 6. TOAST NOTIFICATIONS */}` inline block is deleted
//     outright; the now-unused `toasts` / `removeToast` destructures leave the
//     useUI() destructure (addToast stays); App.jsx is strictly net-smaller.
//   - src/components/layout/AppLayout.jsx keeps mounting
//     `<ToastContainer toasts={ui.toasts} removeToast={ui.removeToast} />`
//     inside App's render tree — that mount is the ONLY toast markup in src/.
//   - src/components/ToastContainer.jsx keeps its memo wrapper and is aligned
//     byte-compatible with the inline block's style constants: the container
//     stack rides zIndex 140; every item/button constant is identical and
//     must stay that way.
//   - UIContext's addToast/removeToast lifecycle is untouched.
//
// Hermetic: bare node --test, no dev server, no network, no browser. The
// runtime section bundles the REAL ToastContainer with rolldown (same
// technique as tests/audit-history-context.contract.test.mjs) and locks the
// serialized markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const TC_PATH = 'src/components/ToastContainer.jsx';
const LAYOUT_PATH = 'src/components/layout/AppLayout.jsx';
const UICTX_PATH = 'src/context/UIContext.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', tc = '', layout = '', uictx = '';
try {
  app = readSource(APP_PATH);
  tc = readSource(TC_PATH);
  layout = readSource(LAYOUT_PATH);
  uictx = readSource(UICTX_PATH);
} catch { /* missing files fail their first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const lineCount = (s) => s.split('\n').length;

const srcFiles = () => readdirSync(join(root, 'src'), { recursive: true })
  .map((p) => `src/${p.split(sep).join('/')}`)
  .filter((p) => /\.(jsx|js|mjs)$/.test(p) && !p.endsWith('atlas-bundled.js'));

// The frozen visual contract of the inline block. The adopted component must
// reproduce these constants byte-compatible.
const PINNED_CONTAINER_STYLE = "position: 'fixed', top: '16px', right: '16px', zIndex: 140, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px'";
const PINNED_ITEM_STYLE = "display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '10px', fontSize: '0.82rem', lineHeight: 1.45, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', background: t.type === 'error' ? 'rgba(127,29,29,0.92)' : t.type === 'success' ? 'rgba(6,78,59,0.92)' : 'rgba(23,37,84,0.95)', border: `1px solid ${t.type === 'error' ? 'rgba(239,68,68,0.5)' : t.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(96,165,250,0.35)'}`, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word'";
const PINNED_BUTTON = `<button onClick={() => removeToast(t.id)} className="btn-secondary" style={{ padding: '2px', flexShrink: 0 }}>`;

// ---------------------------------------------------------------------------
// 1. grep gates: App.jsx holds no toast markup; src/ has exactly one
// ---------------------------------------------------------------------------

test('App.jsx inline toast block is deleted — zero toast markup tokens', () => {
  assert.ok(!app.includes('{/* 6. TOAST NOTIFICATIONS */}'), 'section marker comment gone');
  assert.equal(countIn(app, /\{toasts\.length > 0 && \(/g), 0, 'inline gate gone');
  assert.equal(countIn(app, /\{toasts\.map\(/g), 0, 'inline toasts.map gone');
  assert.equal(countIn(app, /zIndex: 140/g), 0, 'the fixed zIndex-140 stack is gone from App.jsx');
  assert.ok(!/\bremoveToast\b/.test(app), 'removeToast leaves App.jsx entirely (destructure + call site)');
  assert.ok(!/^ {4}toasts,$/m.test(app), 'the unused toasts destructure is removed');
  assert.ok(/^ {4}addToast,$/m.test(app), 'addToast stays destructured (still used across App)');
});

test('Src/ has exactly ONE toast renderer — the memoized ToastContainer', () => {
  const mappers = srcFiles().filter((p) => readSource(p).includes('toasts.map('));
  assert.deepEqual(mappers, ['src/components/ToastContainer.jsx'],
    'toasts.map( survives only inside ToastContainer.jsx — no duplicated toast markup in src/');
  const mounts = srcFiles().filter((p) => p !== 'src/components/ToastContainer.jsx' && /<ToastContainer\s/.test(readSource(p)));
  assert.deepEqual(mounts, ['src/components/layout/AppLayout.jsx'],
    'exactly one <ToastContainer mount in src/, in AppLayout (inside App\'s tree)');
});

test('The AppLayout mount feeds the UIContext toasts/removeToast unchanged', () => {
  assert.ok(layout.includes("import { ToastContainer } from '../ToastContainer';"), 'import intact');
  assert.ok(/<ToastContainer\s/.test(layout), 'mount intact');
  assert.ok(layout.includes('toasts={ui.toasts}'), 'same toasts source');
  assert.ok(layout.includes('removeToast={ui.removeToast}'), 'same removeToast source');
});

// ---------------------------------------------------------------------------
// 2. structural parity: the component reproduces the block
// ---------------------------------------------------------------------------

test('ToastContainer keeps its memo wrapper and empty-state short-circuit', () => {
  assert.ok(tc.includes("export const ToastContainer = memo(function ToastContainer({ toasts, removeToast }) {"),
    'memoized function component taking { toasts, removeToast }');
  assert.ok(tc.includes("ToastContainer.displayName = 'ToastContainer';"), 'displayName pinned');
  assert.ok(tc.includes('if (!toasts.length) return null;'), 'empty toasts render nothing');
});

test('Container style aligned to the deleted block — zIndex 140, same constants, same order', () => {
  assert.equal(countIn(tc, new RegExp(PINNED_CONTAINER_STYLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), 1,
    'container style literal is byte-identical to the deleted inline block (zIndex 140)');
  assert.equal(countIn(tc, /zIndex: 99999/g), 0, 'the baseline 99999 divergence is gone');
  for (const f of srcFiles()) {
    assert.equal(countIn(readSource(f), /zIndex: 99999/g), 0, `no zIndex 99999 residue in ${f}`);
  }
});

test('Item/button anatomy stays byte-identical to the deleted block', () => {
  const tcStyleStart = tc.indexOf('style={{', tc.indexOf('toasts.map('));
  const tcStyleBody = tc.slice(tcStyleStart + 'style={{'.length, tc.indexOf('}}>', tcStyleStart));
  assert.equal(norm(tcStyleBody), norm(PINNED_ITEM_STYLE),
    'mapped item style is byte-identical to the frozen inline-block constants');
  for (const c of ['rgba(127,29,29,0.92)', 'rgba(6,78,59,0.92)', 'rgba(23,37,84,0.95)',
    'rgba(239,68,68,0.5)', 'rgba(34,197,94,0.4)', 'rgba(96,165,250,0.35)']) {
    assert.ok(tcStyleBody.includes(c), `color constant ${c} preserved`);
  }
  assert.ok(tc.includes(PINNED_BUTTON), 'dismiss button identical: removeToast(t.id), btn-secondary, padding 2px / flexShrink 0');
  assert.ok(tc.includes('<X size={12} />'), 'lucide X icon at size 12');
  assert.ok(tc.includes('<span style={{ flexGrow: 1 }}>{t.message}</span>'), 'message span identical');
  assert.ok(tc.includes('<div key={t.id} style={{'), 'items keyed by toast id');
});

// ---------------------------------------------------------------------------
// 3. runtime parity: render the REAL component and lock the serialized
//    markup against the frozen constants
// ---------------------------------------------------------------------------

let tcBundle = null;
let tcBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't11-post-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, `export { ToastContainer } from '${abs(TC_PATH)}';\n`);
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'toast-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  tcBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  tcBundleError = err;
}

test('Runtime: memoized component, empty->null, exact adopted serialization (z-index 140)', async () => {
  assert.ok(!tcBundleError, `the ToastContainer bundle must build under rolldown: ${tcBundleError?.stack || tcBundleError}`);
  const { ToastContainer } = tcBundle;
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');

  assert.equal(typeof ToastContainer, 'object', 'the export stays a memo wrapper (object, not a function)');
  assert.equal(renderToString(React.createElement(ToastContainer, { toasts: [], removeToast: () => {} }), ''),
    '', 'empty toasts render nothing');

  const toasts = [
    { id: 't1', message: 'plain info', type: 'info', time: 1 },
    { id: 't2', message: 'bad thing\nsecond line', type: 'error', time: 2 },
    { id: 't3', message: 'good thing', type: 'success', time: 3 }
  ];
  const html = renderToString(React.createElement(ToastContainer, { toasts, removeToast: () => {} }));

  // container: the block's stack, byte-compatible (zIndex 140)
  assert.ok(html.includes('style="position:fixed;top:16px;right:16px;z-index:140;display:flex;flex-direction:column;gap:8px;max-width:420px"'),
    'serialized container matches the deleted block exactly (z-index 140)');

  // items: full serialized style string per type — byte-equal to the frozen constants
  const ITEM_HEAD = 'style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:10px;font-size:0.82rem;line-height:1.45;box-shadow:0 8px 30px rgba(0,0,0,0.45);';
  assert.ok(html.includes(`${ITEM_HEAD}background:rgba(23,37,84,0.95);border:1px solid rgba(96,165,250,0.35);color:#fff;white-space:pre-wrap;word-break:break-word"`),
    'info item serialized style is byte-identical');
  assert.ok(html.includes(`${ITEM_HEAD}background:rgba(127,29,29,0.92);border:1px solid rgba(239,68,68,0.5);color:#fff;white-space:pre-wrap;word-break:break-word"`),
    'error item serialized style is byte-identical');
  assert.ok(html.includes(`${ITEM_HEAD}background:rgba(6,78,59,0.92);border:1px solid rgba(34,197,94,0.4);color:#fff;white-space:pre-wrap;word-break:break-word"`),
    'success item serialized style is byte-identical');

  // order + copy + multiline passthrough (pre-wrap contract)
  assert.ok(html.indexOf('plain info') < html.indexOf('bad thing') && html.indexOf('bad thing') < html.indexOf('good thing'),
    'toasts render in array order');
  assert.ok(html.includes('bad thing\nsecond line'), 'multi-line message serialized raw (white-space: pre-wrap)');
  assert.ok(html.includes('<span style="flex-grow:1">'), 'message span keeps flexGrow 1');

  // dismiss buttons
  assert.equal(countIn(html, /<button class="btn-secondary" style="padding:2px;flex-shrink:0">/g), 3,
    'one dismiss button per toast, identical classes/styles');
  assert.equal(countIn(html, /class="lucide lucide-x"/g), 3, 'one X icon per dismiss button');
  assert.equal(countIn(html, /width="12" height="12"/g), 3, 'X icon stays size 12');
});

// ---------------------------------------------------------------------------
// 4. lifecycle: UIContext addToast/removeToast semantics untouched
// ---------------------------------------------------------------------------

test('UIContext toast lifecycle is unchanged by the swap', () => {
  assert.ok(uictx.includes("const addToast = useCallback((message, type = 'info') => {"), 'addToast signature');
  assert.ok(uictx.includes("message: type === 'error' ? redactErrorText(message) : redactSensitiveText(message)"),
    'per-type redaction choke point intact');
  assert.ok(uictx.includes('setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);'),
    '6s auto-dismiss intact');
  assert.ok(uictx.includes('const removeToast = useCallback((id) => {'), 'removeToast signature');
  assert.ok(uictx.includes('setToasts(prev => prev.filter(t => t.id !== id));'), 'removeToast filter intact');
});

// ---------------------------------------------------------------------------
// 5. Adoption is strictly net-smaller for App.jsx
// ---------------------------------------------------------------------------

test('App.jsx is strictly net-smaller than the 2521-line baseline', () => {
  assert.ok(lineCount(app) < 2510,
    `App.jsx must shed the 19-line toast block + the 2 unused destructures (baseline 2521 -> ~2500); got ${lineCount(app)}`);
});
