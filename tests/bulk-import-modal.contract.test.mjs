// Contract: the bulk-import modal lives in
// src/components/modals/BulkImportModal.jsx — props-in/events-out, owning the
// transient dialog state (importText/importResult/importSelected/importError/
// importHelpOpen/importSample) and the parse/toggle/sample/confirm handlers;
// App keeps importOpen/setImportOpen, openBulkImport, the
// `{importOpen && (<BulkImportModal … />)}` gate and the 4d section comment,
// and applies the confirmed import (setCustomTests + setSelectedTests + toast
// + close) through onConfirmImport. Because the gate unmounts the modal, the
// six fresh-mount initializers reproduce openBulkImport's reset semantics
// exactly.
//
// Hermetic under bare `node --test`: no server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBulkTests, SAMPLE_TEMPLATES } from '../src/utils/testImporter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
const modal = readIfExists('src/components/modals/BulkImportModal.jsx');
const app = readSource('src/App.jsx');

// ── member-extraction mechanics ─────────────────────────────────────────────
function extractMember(source, name) {
  const declRe = new RegExp(`^  const ${name} = `, 'm');
  const m = declRe.exec(source);
  assert.ok(m, `member ${name} not found at the 2-space body indent`);
  const lines = source.slice(m.index).split('\n');
  const first = lines[0];
  if (/;\s*$/.test(first)) return first;
  const buf = [first];
  const nextDecl = /^  (const \w+ = |useEffect\(|function )/;
  for (let i = 1; i < lines.length; i++) {
    if (i > 1 && nextDecl.test(lines[i])) assert.fail(`member ${name} never closed before the next declaration`);
    buf.push(lines[i]);
    if (lines[i] === '  };' || lines[i] === '  });') return buf.join('\n');
  }
  assert.fail(`member ${name} has no closing line`);
}

const ArrowFnEval = Function;
function compileMember(source, name, env) {
  const member = extractMember(source, name);
  const names = Object.keys(env);
  const lines = member.split('\n');
  let inner;
  let params = '';
  if (lines.length === 1) {
    const am = /^  const \w+ = \s*(?:async\s*)?(\([^)]*\))\s*=>\s*(.+);\s*$/.exec(lines[0]);
    assert.ok(am, `single-line member ${name} is not a plain arrow const`);
    params = am[1].slice(1, -1);
    inner = `return ${am[2].trim()};`;
  } else {
    const hm = /^  const \w+ = \s*(?:async\s*)?(\([^)]*\))\s*=>\s*\{$/.exec(lines[0]);
    assert.ok(hm, `member ${name} head is not an arrow const`);
    params = hm[1].slice(1, -1);
    inner = lines.slice(1, -1).join('\n');
  }
  const factory = new ArrowFnEval(...names, `'use strict';\nreturn (async (${params}) => {\n${inner}\n});`);
  return (...args) => factory(...names.map((n) => env[n]))(...args);
}

// Finds the modal's confirm handler: the 2-indent const arrow whose body calls
// onConfirmImport — whatever it is named.
function confirmHandlerName(source) {
  const decls = [...source.matchAll(/^  const (\w+) = (?:async\s*)?\(/gm)].map((m) => m[1]);
  for (const name of decls) {
    try {
      const member = extractMember(source, name);
      if (member.includes('onConfirmImport(')) return name;
    } catch { /* not a block member */ }
  }
  return null;
}

// Live-state environment.
const makeEnv = (over = {}) => {
  const calls = [];
  const slots = {
    importText: '',
    importResult: null,
    importSelected: null,
    importError: '',
    importHelpOpen: true,
    importSample: 'native',
    expandedCriteria: new Set(),
  };
  const env = {};
  for (const [name, initial] of Object.entries(slots)) {
    let value = over[name] !== undefined ? over[name] : initial;
    Object.defineProperty(env, name, { enumerable: true, get: () => value });
    const setterName = 'set' + name[0].toUpperCase() + name.slice(1);
    env[setterName] = (update) => {
      value = typeof update === 'function' ? update(value) : update;
      calls.push([setterName, value]);
    };
  }
  env.parseBulkTests = parseBulkTests;
  env.SAMPLE_TEMPLATES = SAMPLE_TEMPLATES;
  env.addToast = (msg) => calls.push(['addToast', msg]);
  for (const [k, v] of Object.entries(over)) {
    if (!(k in slots)) env[k] = v;
  }
  return { calls, env };
};

// ── 1. module identity + fresh-mount reset semantics ─────────────────────────
test('The module exists and exports a default BulkImportModal component', () => {
  assert.ok(modal.length > 0, 'src/components/modals/BulkImportModal.jsx exists');
  assert.match(modal, /^export default function BulkImportModal\(/m);
});

test('The modal owns the six transient useState slots with openBulkImport reset initializers', () => {
  assert.match(modal, /^  const \[importText, setImportText\] = useState\(''\);$/m);
  assert.match(modal, /^  const \[importResult, setImportResult\] = useState\(null\);( \/\/ \{ format, formatLabel, tests, warnings \})?$/m);
  assert.match(modal, /^  const \[importSelected, setImportSelected\] = useState\(null\);( \/\/ Set of test ids)?$/m);
  assert.match(modal, /^  const \[importError, setImportError\] = useState\(''\);$/m);
  assert.match(modal, /^  const \[importHelpOpen, setImportHelpOpen\] = useState\(true\);$/m);
  assert.match(modal, /^  const \[importSample, setImportSample\] = useState\('native'\);$/m);
  assert.match(modal, /^  const \[expandedCriteria, setExpandedCriteria\] = useState\(new Set\(\)\);( \/\/ Set of expanded test ids)?$/m, 'expandedCriteria state for criteria review');
  assert.doesNotMatch(modal, /const \[importOpen, setImportOpen\]/, 'importOpen stays App-owned (the gate unmounts the modal)');
});

test('The testImporter import moved module-side (all three symbols)', () => {
  // From src/components/modals/ the resolvable specifier is
  // '../../utils/testImporter' — the pin generalizes the leading dot-dot
  // segments and keeps every other requirement intact (module-side import of
  // all three testImporter symbols).
  const m = /import \{([^}]*)\} from '(?:\.\.\/)+utils\/testImporter(\.js)?';/.exec(modal);
  assert.ok(m, 'the modal imports from ../utils/testImporter');
  for (const sym of ['parseBulkTests', 'IMPORT_FORMATS', 'SAMPLE_TEMPLATES']) {
    assert.match(m[1], new RegExp(`\\b${sym}\\b`), `${sym} imported module-side`);
  }
});

// ── 2. the moved JSX region: key structural elements ────────────────────────

test('The moved modal JSX carries key structural elements', () => {
  // Test rows carry expandable criteria sections, so instead of an exact JSX
  // match, verify key structural elements are present
  assert.match(modal, /Bulk Import Test Cases/, 'modal title present');
  assert.match(modal, /Parse & Preview/, 'parse button present');
  assert.match(modal, /Select all/, 'select all button present');
  assert.match(modal, /Import Selected/, 'import button present');
  assert.match(modal, /IMPORT_FORMATS\.map/, 'format enumeration present');
  assert.match(modal, /importResult\.tests\.map/, 'test row rendering present');
  assert.match(modal, /extractTestCriteria\(t\)/, 'criteria extraction in test rows');
  assert.match(modal, /toggleCriteriaExpansion/, 'criteria expansion handler');
});

test('Rewired seams: close buttons call onClose, no setImportOpen leaks into the modal', () => {
  assert.match(modal, /onClick=\{onClose\} className="btn-secondary icon-btn" data-tip="Close"/,
    'the header close button is rewired to the onClose prop');
  assert.match(modal, /onClick=\{onClose\} className="btn-secondary">\s*Cancel/,
    'the Cancel button is rewired to the onClose prop');
  assert.doesNotMatch(modal, /setImportOpen/, 'App owns importOpen — the modal never touches its setter');
});

// ── 3. behavioral: the modal's real handler bodies (compiled) ────────────────
test('ParseImportText (modal body): adopts the real parser result and pre-selects every id', () => {
  const payload = JSON.stringify([
    { name: 'Alpha', userPrompt: 'p1' },
    { name: 'Beta', userPrompt: 'p2' },
  ]);
  const { calls, env } = makeEnv({ importText: payload });
  return compileMember(modal, 'parseImportText', env)().then(() => {
    const reference = parseBulkTests(payload);
    const setResult = calls.find(([n]) => n === 'setImportResult');
    assert.ok(setResult, 'importResult is set');
    assert.equal(setResult[1].format, reference.format);
    assert.equal(setResult[1].formatLabel, reference.formatLabel);
    assert.equal(setResult[1].tests.length, 2);
    const setSelected = calls.find(([n]) => n === 'setImportSelected');
    assert.ok(setSelected[1] instanceof Set);
    assert.deepEqual([...setSelected[1]], setResult[1].tests.map((t) => t.id), 'every parsed id is pre-selected');
    assert.deepEqual(calls.find(([n]) => n === 'setImportError'), ['setImportError', '']);
    // expanded criteria state is reset on parse
    const setExpanded = calls.find(([n]) => n === 'setExpandedCriteria');
    assert.ok(setExpanded, 'expandedCriteria is reset');
    assert.ok(setExpanded[1] instanceof Set && setExpanded[1].size === 0, 'expandedCriteria reset to empty Set');
  });
});

test('ParseImportText (modal body): failure path resets result+selection with the parser message', () => {
  const { calls, env } = makeEnv({ importText: 'not,json,yaml,anything' });
  return compileMember(modal, 'parseImportText', env)().then(() => {
    let parserMessage = '';
    try { parseBulkTests('not,json,yaml,anything'); } catch (err) { parserMessage = err.message; }
    assert.deepEqual(calls.find(([n]) => n === 'setImportResult'), ['setImportResult', null]);
    assert.deepEqual(calls.find(([n]) => n === 'setImportSelected'), ['setImportSelected', null]);
    assert.deepEqual(calls.find(([n]) => n === 'setImportError'), ['setImportError', parserMessage]);
    // expanded criteria state is reset on parse failure too
    assert.ok(calls.find(([n]) => n === 'setExpandedCriteria'), 'expandedCriteria reset on error');
  });
});

test('ToggleImportItem (modal body): add / remove / null-selection semantics', () => {
  const { calls: addCalls, env: addEnv } = makeEnv({ importSelected: new Set(['a']) });
  const toggle = compileMember(modal, 'toggleImportItem', addEnv);
  return toggle('b').then(() => {
    assert.deepEqual([...addCalls.find(([n]) => n === 'setImportSelected')[1]], ['a', 'b']);
  }).then(() => {
    const { calls: rmCalls, env: rmEnv } = makeEnv({ importSelected: new Set(['a', 'b']) });
    return compileMember(modal, 'toggleImportItem', rmEnv)('b').then(() => {
      assert.deepEqual([...rmCalls.find(([n]) => n === 'setImportSelected')[1]], ['a']);
    });
  }).then(() => {
    const { calls: nullCalls, env: nullEnv } = makeEnv({ importSelected: null });
    return compileMember(modal, 'toggleImportItem', nullEnv)('a').then(() => {
      assert.deepEqual([...nullCalls.find(([n]) => n === 'setImportSelected')[1]], ['a']);
    });
  });
});

test('InsertImportSample (modal body): real template fill + parse-state reset + unknown-key empty string', () => {
  const { calls, env } = makeEnv({ importResult: { tests: [] }, importSelected: new Set(['a']), importError: 'boom' });
  return compileMember(modal, 'insertImportSample', env)('native').then(() => {
    assert.deepEqual(calls.find(([n]) => n === 'setImportText'), ['setImportText', SAMPLE_TEMPLATES.native]);
    assert.deepEqual(calls.find(([n]) => n === 'setImportResult'), ['setImportResult', null]);
    assert.deepEqual(calls.find(([n]) => n === 'setImportSelected'), ['setImportSelected', null]);
    assert.deepEqual(calls.find(([n]) => n === 'setImportError'), ['setImportError', '']);
    // expanded criteria state is also reset
    assert.ok(calls.find(([n]) => n === 'setExpandedCriteria'), 'expandedCriteria reset on sample insert');
  }).then(() => {
    const { calls: unk, env: unkEnv } = makeEnv({});
    return compileMember(modal, 'insertImportSample', unkEnv)('no-such-format').then(() => {
      assert.deepEqual(unk.find(([n]) => n === 'setImportText'), ['setImportText', '']);
    });
  });
});

test('Confirm flow: empty selection toasts the exact copy modal-side and never calls onConfirmImport', () => {
  const name = confirmHandlerName(modal);
  assert.ok(name, 'a modal-side handler calls onConfirmImport');
  const a = { id: 'A', name: 'A', userPrompt: 'p' };
  const { calls, env } = makeEnv({
    importResult: { format: 'native', formatLabel: 'Native test cases (JSON / YAML)', tests: [a], warnings: [] },
    importSelected: new Set(),
    onConfirmImport: (chosen) => calls.push(['onConfirmImport', chosen]),
  });
  return compileMember(modal, name, env)().then(() => {
    assert.deepEqual(calls, [['addToast', 'Select at least one test to import.']],
      'the empty-selection gate fires modal-side before any hand-off');
  });
});

test('Confirm flow: onConfirmImport receives exactly the chosen tests (events-out)', () => {
  const name = confirmHandlerName(modal);
  const a = { id: 'A', name: 'A', userPrompt: 'p', tactic: 'Execution', techniqueId: 'AML.T0034', failKeywords: [], refusalKeywords: [] };
  const b = { id: 'B', name: 'B', userPrompt: 'q', tactic: 'Recon', techniqueId: 'AML.T0000', failKeywords: [], refusalKeywords: [] };
  const { calls, env } = makeEnv({
    importResult: { format: 'native', formatLabel: 'Native test cases (JSON / YAML)', tests: [a, b], warnings: [] },
    importSelected: new Set(['B']),
    onConfirmImport: (chosen) => calls.push(['onConfirmImport', chosen]),
  });
  return compileMember(modal, name, env)().then(() => {
    const handoff = calls.find(([n]) => n === 'onConfirmImport');
    assert.ok(handoff, 'onConfirmImport is called');
    assert.deepEqual(handoff[1], [b], 'exactly the selected tests, in parse order, no extras');
    assert.ok(!calls.some(([n]) => n === 'setCustomTests' || n === 'setSelectedTests'),
      'events-out purity: the modal never touches suite state directly');
  });
});

// ── 4. App adoption + shed ───────────────────────────────────────────────────
function mountBlock(source, tag) {
  const start = source.indexOf('<' + tag);
  assert.ok(start >= 0, `App mounts <${tag} … />`);
  const tagIndent = /^[\t ]*/.exec(source.slice(source.lastIndexOf('\n', start) + 1))[0];
  const end = source.indexOf(`\n${tagIndent}/>`, start);
  assert.ok(end > start, 'the mount closes at its own indentation level');
  return source.slice(start, end + `\n${tagIndent}/>`.length);
}

test('App mounts <BulkImportModal inside the App-owned importOpen gate with the full prop set', () => {
  assert.match(app, /^import BulkImportModal from '\.\/components\/modals\/BulkImportModal(\.jsx)?';$/m,
    'App imports the module');
  const gateAt = app.indexOf('{importOpen && (');
  assert.ok(gateAt >= 0, 'the {importOpen && ( gate stays App-side');
  const sectionAt = app.indexOf('{/* 5. DIALOG MODAL: ADD CUSTOM TEST CASE */}', gateAt);
  assert.ok(sectionAt > gateAt, 'the 5. section comment closes the gate span');
  const gateSpan = app.slice(gateAt, sectionAt);
  const mount = mountBlock(app, 'BulkImportModal');
  assert.ok(gateSpan.includes(mount), 'the mount sits inside the {importOpen && ( gate');
  for (const prop of ['customTests={customTests}', 'onConfirmImport={', 'onClose={', 'addToast={addToast}']) {
    assert.ok(mount.includes(prop), `mount wires ${prop}`);
  }
});

test('App sheds the moved internals; the 4d comment and openBulkImport stay', () => {
  assert.ok(app.includes('{/* 4d. BULK IMPORT MODAL */}'), 'the section comment stays App-side (audit-detail-modal-port pin)');
  assert.match(app, /^  const openBulkImport = \(\) => \{$/m, 'openBulkImport stays App-side (t11 pin)');
  assert.doesNotMatch(app, /^  const parseImportText = /m, 'parseImportText left App');
  assert.doesNotMatch(app, /^  const toggleImportItem = /m, 'toggleImportItem left App');
  assert.doesNotMatch(app, /^  const insertImportSample = /m, 'insertImportSample left App');
  assert.doesNotMatch(app, /^  const confirmBulkImport = /m, 'confirmBulkImport left App');
  assert.doesNotMatch(app, /utils\/testImporter/, 'App no longer imports the testImporter symbols');
  assert.doesNotMatch(app, /^  const \[importText, setImportText\]/m, 'transient state left App');
  assert.doesNotMatch(app, /^  const \[importResult, setImportResult\]/m);
  assert.doesNotMatch(app, /^  const \[importSelected, setImportSelected\]/m);
  assert.doesNotMatch(app, /^  const \[importError, setImportError\]/m);
  assert.doesNotMatch(app, /^  const \[importHelpOpen, setImportHelpOpen\]/m);
  assert.doesNotMatch(app, /^  const \[importSample, setImportSample\]/m);
});

test('App-side onConfirmImport applies the suite merge, toasts the exact copy and closes', () => {
  const mount = mountBlock(app, 'BulkImportModal');
  const m = /onConfirmImport=\{([^}]+)\}/.exec(mount);
  assert.ok(m, 'the mount wires onConfirmImport');
  const ref = m[1].trim();
  let handler;
  if (/=>/.test(ref)) {
    handler = ref;
  } else {
    handler = extractMember(app, ref);
  }
  assert.match(String(handler), /setCustomTests\(/, 'the handler merges into customTests');
  assert.match(String(handler), /setSelectedTests\(/, 'the handler unions into selectedTests');
  assert.match(String(handler), /setImportOpen\(false\)/, 'the handler closes the modal');
  assert.match(String(handler), /chosen\.length/, 'the toast reports the chosen count');
  assert.match(String(handler), /test\(s\) imported and pre-selected in the suite\./, 'exact App-side toast copy');
  assert.equal((app.match(/test\(s\) imported and pre-selected in the suite\./g) || []).length, 1,
    'the import toast copy survives exactly once, App-side');
  assert.equal((modal.match(/Select at least one test to import\./g) || []).length, 1,
    'the empty-selection toast copy survives exactly once, modal-side');
  assert.doesNotMatch(app, /Select at least one test to import\./, 'the empty-selection gate left App');
});
