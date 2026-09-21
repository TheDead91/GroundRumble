// Contract: src/hooks/useVaultActions.js owns the
// Key-Vault session actions — the vaultInput state and the protect /
// unprotect / lock handler trio — carried out of App.jsx; App.jsx
// keeps only the hook adoption (an explicit cross-domain deps object) and the
// bare-identifier prop wiring into the SettingsView mount.
//
// The deps-object shape is the contract: providers-context pieces, the
// aiGenUrls pair, the history summary pair, the audit/AI abort refs + run
// context, the backup-passphrase reset (a callback — App binds it from the
// later useBackupFlow call), and the ui callbacks (addToast/askConfirm/
// setActiveTab) plus the App-local panel setters. The hook body performs no
// context deep-reach (no useUI/useProviders/... calls); the vault utils
// (clearAuditHistory, saveSourceUrls), the audit summarizer and the secret
// redactor are imported directly from src/utils, mirroring useBackupFlow.
//
// Source-text assertions + a behavioral runtime that evaluates the hook source
// with its collaborators injected — Node cannot import JSX /
// extensionless specifiers under bare node:test (repo convention:
// the sibling bundled-entry suites). The behavioral scenarios mirror the
// App.jsx bodies the hook carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';
import * as auditRecordMod from '../src/utils/audit-record.js';
import * as redactMod from '../src/utils/redact.js';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useVaultActions.js';
const APP_PATH = 'src/App.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let hook = '';
let app = '';
try {
  hook = readSource(HOOK_PATH);
  app = readSource(APP_PATH);
} catch { /* missing target files fail their first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;

// App.jsx with the bare-identifier <SettingsView … /> mount stripped, so the
// mount's `handleProtectVault={handleProtectVault}`-style prop wiring is not
// mistaken for a definition site of the hook-owned concerns (repo convention:
// the sibling hook suites).
function appWithoutMount() {
  const start = app.indexOf('<SettingsView');
  if (start < 0) return app;
  const end = app.indexOf('/>', start);
  if (end < 0) return app;
  return app.slice(0, start) + app.slice(end + 2);
}

// ---------------------------------------------------------------------------
// Extraction machinery (brace-aware, comment/string/template safe)
// ---------------------------------------------------------------------------

function scanGroup(src, i) {
  const closeOf = { '{': '}', '(': ')', '[': ']', "'": "'", '"': '"', '`': '`' };
  const open = src[i];
  const close = closeOf[open];
  if (!close) throw new Error(`scanGroup: not an opener at ${i}: ${JSON.stringify(open)}`);
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (open === '`' || open === "'" || open === '"') {
      if (c === open) return i + 1;
      if (open === '`' && c === '$' && src[i + 1] === '{') { i = scanGroup(src, i + 1); continue; }
      i += 1; continue;
    }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i); i = end < 0 ? src.length : end + 2; continue; }
    if (closeOf[c]) { i = scanGroup(src, i); continue; }
    if (c === close) return i + 1;
    i += 1;
  }
  throw new Error('scanGroup: unbalanced source');
}

function extractHookFunctionSource(src, name) {
  const m = src.match(new RegExp(`export function ${name}\\(`));
  assert.ok(m, `${name} must be exported from the hook module source`);
  let i = m.index + `export function ${name}`.length;
  while (/\s/.test(src[i])) i += 1;
  i = scanGroup(src, i);
  while (/\s/.test(src[i])) i += 1;
  i = scanGroup(src, i);
  return src.slice(m.index + 'export '.length, i);
}

// ---------------------------------------------------------------------------
// the hook module owns the trio + vaultInput; App keeps only the adoption
// ---------------------------------------------------------------------------

test('The hook module exists and exports useVaultActions', () => {
  assert.match(hook, /export (default )?(function|const) useVaultActions\b/, 'a named (or default) useVaultActions export is the public entry');
});

test('Every extracted concern has exactly one definition site — inside the hook', () => {
  const ownedDeclarations = [
    /\bhandleProtectVault\s*=/,
    /\bhandleUnprotectVault\s*=/,
    /\bhandleLockVault\s*=/,
    /\[vaultInput,\s*setVaultInput\]\s*=\s*useState\(/
  ];
  for (const decl of ownedDeclarations) {
    assert.equal(countIn(hook, decl), 1, `${HOOK_PATH} defines ${decl}`);
    assert.equal(countIn(appWithoutMount(), decl), 0, `${APP_PATH} no longer declares ${decl}`);
  }
});

test('The hook composes — never reimplements — the vault/audit/redact primitives', () => {
  const importLines = hook.split('\n').filter((l) => /^\s*import\b/.test(l));
  const importsFrom = (specifierRe) => importLines.filter((l) => specifierRe.test(l)).join('\n');
  const vaultImports = importsFrom(/from '\.\.\/utils\/vault(\.js)?';/);
  for (const vaultFn of ['clearAuditHistory', 'saveSourceUrls']) {
    assert.match(vaultImports, new RegExp(`\\b${vaultFn}\\b`), `imports ${vaultFn} from ../utils/vault`);
  }
  const auditImports = importsFrom(/from '\.\.\/utils\/audit-record(\.js)?';/);
  assert.match(auditImports, /\bsummarizeAuditRecord\b/);
  assert.match(hook, /import \{ redactSensitiveText[^}]*\} from '\.\.\/utils\/redact(\.js)?';/, 'failures still route through the secret-scrubbing redactor');
  // Single consumption site: the summarizer usage is hook-side. (The App.jsx
  // import line itself stays byte-pinned by
  // tests/demo-simulation.contract.test.mjs, so only the call sites live in the hook.)
  assert.ok(!app.includes('historyRef.current.map(summarizeAuditRecord)'), 'App.jsx no longer drives the summarizer directly');
});

test('The hook takes the full cross-domain deps object and never deep-reaches into a context', () => {
  const paramList = (() => {
    const m = hook.match(/export function useVaultActions\(/);
    assert.ok(m, 'the hook entry exists');
    let i = m.index + 'export function useVaultActions'.length;
    while (/\s/.test(hook[i])) i += 1;
    const end = scanGroup(hook, i);
    return hook.slice(i + 1, end - 1);
  })();
  for (const dep of [
    'providers', 'setProviders', 'setProviderDraft', 'setProviderTest', 'setProviderModelErrors',
    'lockVault', 'protectVault', 'unprotectVault', 'invalidateProviderModelFetches',
    'vaultLocked', 'vaultLockedRef', 'vaultStateRef', 'setVaultLocked', 'setVaultPassphraseSet', 'setUnlockPromptOpen',
    'aiGenUrls', 'setAiGenUrls', 'aiGenAbortRef', 'aiRunCtxRef',
    'setHistory', 'historyRef',
    'setResults', 'clearConsoleLogs', 'setCurrentTestName', 'auditAbortRef',
    'resetBackupPassphrase',
    'setActiveTab', 'setExpandedCell', 'setExpandedDetailIds', 'setSelectedAudit',
    'addToast', 'askConfirm'
  ]) {
    assert.match(paramList, new RegExp(`\\b${dep}\\b`), `the deps object carries ${dep}`);
  }
  for (const contextHook of ['useUI(', 'useProviders(', 'useHistory(', 'useAudit(', 'useAIGen(', 'useSettings(', 'useTests(']) {
    assert.ok(!hook.includes(contextHook), `the hook body does not deep-reach ${contextHook}`);
  }
});

test('The hook returns the adopted surface; App adopts it and keeps the view wiring', () => {
  const returnBlock = hook.slice(hook.lastIndexOf('return {'));
  for (const name of ['vaultInput', 'setVaultInput', 'vaultValidationError', 'handleProtectVault', 'handleUnprotectVault', 'handleLockVault']) {
    assert.match(returnBlock, new RegExp(`\\b${name}\\b`), `the hook returns ${name}`);
  }
  const adoptIdx = app.indexOf('= useVaultActions({');
  assert.ok(adoptIdx >= 0, 'App.jsx adopts the hook through an explicit deps object');
  const destructure = app.slice(app.lastIndexOf('const {', adoptIdx), adoptIdx);
  for (const name of ['handleProtectVault', 'handleUnprotectVault', 'handleLockVault', 'vaultInput', 'setVaultInput']) {
    assert.match(destructure, new RegExp(`\\b${name}\\b`), `App destructures ${name} from the hook`);
  }
  const mountStart = app.indexOf('<SettingsView');
  const mountEnd = app.indexOf('/>', mountStart);
  const mount = mountStart >= 0 && mountEnd > mountStart ? app.slice(mountStart, mountEnd) : '';
  for (const wiring of [
    'handleProtectVault={handleProtectVault}',
    'handleUnprotectVault={handleUnprotectVault}',
    'handleLockVault={handleLockVault}',
    'vaultInput={vaultInput}',
    'vaultValidationError={vaultValidationError}',
    'setVaultInput={setVaultInput}'
  ]) {
    assert.ok(mount.includes(wiring), `the SettingsView mount still receives ${wiring}`);
  }
});

test('The lock arm keeps its exact behavioral literals (source re-persist, reminder write, reload tail)', () => {
  assert.match(hook, /await protectVault\(vaultInput\);/, 'protect passes the typed passphrase');
  assert.match(hook, /await saveSourceUrls\(aiGenUrls\);/, 'the source re-persist survives');
  assert.match(hook, /await unprotectVault\(\{ providers \}\);/, 'unprotect hands the live providers through');
  assert.match(hook, /const summaryHistory = historyRef\.current\.map\(summarizeAuditRecord\);/, 'summaries come from the shared summarizer');
  assert.match(hook, /setHistory\(summaryHistory\);\s*\n\s*historyRef\.current = summaryHistory;/, 'lock-path state flip order preserved (useState then ref)');
  assert.match(hook, /localStorage\.setItem\('atlas_vault_unprotected_reminder', '1'\);/, 'the reminder write survives');
  assert.match(hook, /window\.location\.reload\(\);/, 'the lock ends in the full reload');
});

// ---------------------------------------------------------------------------

let hookFnSource = null;
try {
  hookFnSource = extractHookFunctionSource(hook, 'useVaultActions');
} catch { /* behavioral tests fail with a clear message when the hook is missing */ }

const GATE_MSG = 'Use a passphrase of at least 12 characters.';
const PROTECT_OK_MSG = 'API keys are now encrypted at rest. You will be asked to unlock on each new session.';
const UNPROTECT_CONFIRM = 'Remove the passphrase? Your API keys will be stored in the browser vault WITHOUT encryption.';
const UNPROTECT_OK_MSG = 'Passphrase removed. Keys are now stored in plaintext within the vault.';

const DETAILED_RECORD = {
  id: 'audit-post-1',
  timestamp: '2026-08-31T00:00:00.000Z',
  completed: true,
  totalTests: 1,
  vulnerableCount: 1,
  details: [{
    uid: 'r-1',
    auditId: 'audit-post-1',
    testId: 't-x',
    status: 'VULNERABLE',
    reasoning: 'gave up the secret',
    systemPrompt: 'sys prompt text',
    userPrompt: 'user prompt text',
    response: 'response text'
  }]
};

const names = (calls) => calls.map((c) => c[0]);
const toastTexts = (calls) => calls.filter((c) => c[0] === 'addToast').map((c) => c[1]);

function makeRuntime({ askConfirmResult = true, protectVaultImpl, unprotectVaultImpl, auditAbortRef: auditAbortRefOverride, aiGenAbortRef: aiGenAbortRefOverride } = {}) {
  assert.ok(hookFnSource, 'the hook module must export useVaultActions for the behavioral contract');
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const recAsync = (name, impl) => async (...args) => {
    calls.push([name, ...args]);
    if (impl) return impl(...args);
  };
  const reloads = { count: 0 };
  const slots = [];
  let idx = 0;
  const useState = (init) => {
    const slot = idx++;
    if (!(slot in slots)) slots[slot] = typeof init === 'function' ? init() : init;
    return [slots[slot], (value) => {
      // Keep persistence-order assertions independent of presentation state.
      if (slot === 0) calls.push(['setVaultInput', value]);
      slots[slot] = typeof value === 'function' ? value(slots[slot]) : value;
    }];
  };
  const historyRef = { current: [structuredClone(DETAILED_RECORD)] };
  const deps = {
    providers: [{ id: 'provider-1', enabled: true }],
    setProviders: rec('setProviders'),
    setProviderDraft: rec('setProviderDraft'),
    setProviderTest: rec('setProviderTest'),
    setProviderModelErrors: rec('setProviderModelErrors'),
    lockVault: rec('lockVault'),
    protectVault: recAsync('protectVault', protectVaultImpl),
    unprotectVault: recAsync('unprotectVault', unprotectVaultImpl),
    invalidateProviderModelFetches: rec('invalidateProviderModelFetches'),
    vaultLocked: false,
    vaultLockedRef: { current: false },
    vaultStateRef: { current: { providers: [{ id: 'stale' }] } },
    setVaultLocked: rec('setVaultLocked'),
    setVaultPassphraseSet: rec('setVaultPassphraseSet'),
    setUnlockPromptOpen: rec('setUnlockPromptOpen'),
    aiGenUrls: ['https://relay.example/feed'],
    setAiGenUrls: rec('setAiGenUrls'),
    aiGenAbortRef: aiGenAbortRefOverride ?? { current: { abort: () => calls.push(['AI_GEN_ABORT']) } },
    aiRunCtxRef: { current: { some: 'ctx' } },
    setHistory: rec('setHistory'),
    historyRef,
    setResults: rec('setResults'),
    clearConsoleLogs: rec('clearConsoleLogs'),
    setCurrentTestName: rec('setCurrentTestName'),
    auditAbortRef: auditAbortRefOverride ?? { current: { abort: () => calls.push(['AUDIT_ABORT']) } },
    resetBackupPassphrase: rec('resetBackupPassphrase'),
    setActiveTab: rec('setActiveTab'),
    setExpandedCell: rec('setExpandedCell'),
    setExpandedDetailIds: rec('setExpandedDetailIds'),
    setSelectedAudit: rec('setSelectedAudit'),
    addToast: rec('addToast'),
    askConfirm: recAsync('askConfirm', async () => askConfirmResult),
    // hook-module imports, bound to the real pure implementations / recorders
    saveSourceUrls: recAsync('saveSourceUrls'),
    clearAuditHistory: recAsync('clearAuditHistory'),
    summarizeAuditRecord: auditRecordMod.summarizeAuditRecord,
    redactSensitiveText: redactMod.redactSensitiveText,
    useState,
    window: { location: { reload: () => { reloads.count += 1; calls.push(['WINDOW_RELOAD']); } } },
    localStorage: globalThis.localStorage
  };
  const paramNames = Object.keys(deps);
  const mountVaultActions = new Function(...paramNames, `"use strict"; return (${hookFnSource});`)
    (...paramNames.map((n) => deps[n]));
  const render = (initial) => {
    slots.length = 0;
    slots[0] = initial;
    idx = 0;
    return mountVaultActions(deps);
  };
  const rerender = () => {
    idx = 0;
    return mountVaultActions(deps);
  };
  return { render, rerender, calls, historyRef, deps, reloads };
}

const makeVaultInputRuntime = (opts = {}) => {
  const rt = makeRuntime(opts);
  rt.actions = rt.render(opts.vaultInput ?? '');
  return rt;
};

test('vault input resets across lock-state transitions but survives edits and same-state rerenders', async () => {
  const rt = makeRuntime();
  rt.deps.vaultLocked = true;
  let actions = rt.render('unlock-passphrase');
  assert.equal(rt.rerender().vaultInput, 'unlock-passphrase', 'failed unlocks leave the lock state and draft intact');

  for (const locked of [false, true, false]) {
    rt.deps.vaultLocked = locked;
    // React retries a render-phase state adjustment before committing children.
    rt.rerender();
    actions = rt.rerender();
    assert.equal(actions.vaultInput, '');
    assert.equal(actions.vaultValidationError, '');
    actions.setVaultInput('four');
    actions = rt.rerender();
    await actions.handleProtectVault();
    assert.equal(rt.rerender().vaultInput, 'four', 'ordinary rerenders preserve edits');
    assert.equal(rt.rerender().vaultValidationError, GATE_MSG, 'ordinary rerenders preserve validation');
  }
});

test('Protect: invalid passphrases set inline feedback and toast without persistence', async () => {
  for (const short of [null, undefined, '', 'four', '0123456789a']) {
    const rt = makeRuntime();
    const actions = rt.render(short);
    const { calls } = rt;
    await actions.handleProtectVault();
    assert.deepEqual(toastTexts(calls), [GATE_MSG], `gate toast for ${JSON.stringify(short)}`);
    assert.deepEqual(names(calls), ['addToast'], `no persistence for ${JSON.stringify(short)}`);
    assert.equal(rt.rerender().vaultValidationError, GATE_MSG);
  }
});

test('vault validation clears on editing, accepts the boundary retry, and stays clear on success', async () => {
  const rt = makeRuntime();
  let actions = rt.render('four');
  assert.equal(actions.vaultValidationError, '');
  await actions.handleProtectVault();
  await actions.handleProtectVault();
  actions = rt.rerender();
  assert.equal(actions.vaultValidationError, GATE_MSG);
  actions.setVaultInput('0123456789a');
  actions = rt.rerender();
  assert.equal(actions.vaultValidationError, '');
  await actions.handleProtectVault();
  actions = rt.rerender();
  assert.equal(actions.vaultValidationError, GATE_MSG);
  actions.setVaultInput(value => value + 'b');
  actions = rt.rerender();
  assert.equal(actions.vaultInput, '0123456789ab');
  assert.equal(actions.vaultValidationError, '');
  await actions.handleProtectVault();
  actions = rt.rerender();
  assert.equal(actions.vaultInput, '');
  assert.equal(actions.vaultValidationError, '');
  assert.equal(names(rt.calls).filter(name => name === 'protectVault').length, 1);
});

test('vault validation resets on removal and lock', async () => {
  for (const action of ['handleUnprotectVault', 'handleLockVault']) {
    const rt = makeRuntime();
    let actions = rt.render('four');
    await actions.handleProtectVault();
    actions = rt.rerender();
    assert.equal(actions.vaultValidationError, GATE_MSG);
    await actions[action]();
    assert.equal(rt.rerender().vaultValidationError, '');
  }
});

test('storage failures after correcting a passphrase do not mark the field invalid', async () => {
  const rt = makeRuntime({ protectVaultImpl: () => { throw new Error('storage unavailable'); } });
  let actions = rt.render('four');
  await actions.handleProtectVault();
  actions = rt.rerender();
  actions.setVaultInput('0123456789ab');
  actions = rt.rerender();
  await actions.handleProtectVault();
  assert.equal(rt.rerender().vaultValidationError, '');
  assert.equal(toastTexts(rt.calls).at(-1), 'Failed to protect keys: storage unavailable');
});

test('Protect: 12-char boundary passes, then the exact source re-persist + state transition sequence fires', async () => {
  const { actions, calls, deps } = makeVaultInputRuntime({ vaultInput: '0123456789ab' });
  await actions.handleProtectVault();
  assert.deepEqual(names(calls), [
    'protectVault', 'saveSourceUrls', 'setVaultPassphraseSet', 'setVaultLocked', 'setVaultInput', 'addToast'
  ], 'protectVault → source re-persist → passphraseSet → unlock flag → input clear → toast');
  assert.equal(calls[0][1], '0123456789ab', 'protectVault receives the typed passphrase verbatim');
  assert.strictEqual(calls[1][1], deps.aiGenUrls, 'saveSourceUrls re-persists the exact aiGenUrls array');
  assert.equal(calls[2][1], true, 'vaultPassphraseSet flips true');
  assert.equal(calls[3][1], false, 'vaultLocked flips false');
  assert.equal(calls[4][1], '', 'vaultInput resets to empty');
  assert.deepEqual(toastTexts(calls), [PROTECT_OK_MSG]);
});

test('Protect: failures clear the input and scrub the message through the real redactor', async () => {
  const { actions, calls } = makeVaultInputRuntime({
    vaultInput: '0123456789ab',
    protectVaultImpl: () => { throw new Error('protect failed for sk-test-123'); }
  });
  await actions.handleProtectVault();
  assert.deepEqual(names(calls), ['protectVault', 'setVaultInput', 'addToast'], 'no transition setters on failure');
  assert.equal(calls[1][1], '', 'vaultInput resets on failure');
  assert.deepEqual(toastTexts(calls), ['Failed to protect keys: protect failed for [REDACTED_KEY]'],
    'error toast is the redactSensitiveText-scrubbed message');
});

test('Unprotect: a declined confirm is a full no-op', async () => {
  localStorage.clear();
  const { actions, calls, historyRef } = makeVaultInputRuntime({ askConfirmResult: false });
  await actions.handleUnprotectVault();
  assert.equal(calls[0][1], UNPROTECT_CONFIRM, 'askConfirm receives the exact plaintext warning');
  assert.deepEqual(names(calls), ['askConfirm'], 'nothing else fires without confirmation');
  assert.equal(historyRef.current[0].details[0].reasoning, 'gave up the secret', 'history untouched');
  assert.equal(localStorage.getItem('atlas_vault_unprotected_reminder'), null, 'no reminder write');
});

test('Unprotect: confirmed flow re-persists plaintext sources, collapses history via the real summarizer, drops the reminder flag', async () => {
  localStorage.clear();
  const { actions, calls, historyRef, deps } = makeVaultInputRuntime();
  await actions.handleUnprotectVault();
  assert.deepEqual(names(calls), [
    'askConfirm', 'unprotectVault', 'clearAuditHistory', 'saveSourceUrls',
    'setHistory', 'setVaultPassphraseSet', 'addToast'
  ], 'confirm → unprotect → audit-history clear → plaintext re-persist → summary collapse → flag drop → toast');
  const unprotectArg = calls[1][1];
  assert.deepEqual(Object.keys(unprotectArg), ['providers'], 'unprotectVault receives exactly { providers }');
  assert.strictEqual(unprotectArg.providers, deps.providers, 'the live providers array is handed through');
  assert.strictEqual(calls[3][1], deps.aiGenUrls, 'saveSourceUrls re-persists aiGenUrls in plaintext');
  const summary = calls[4][1];
  assert.equal(Array.isArray(summary), true, 'setHistory receives the summary array');
  assert.strictEqual(historyRef.current, summary, 'the ref is pointed at the same summary array (in-place collapse)');
  assert.deepEqual(summary, historyRef.current.map(auditRecordMod.summarizeAuditRecord), 'summaries come from the real summarizeAuditRecord');
  assert.equal('reasoning' in summary[0].details[0], false, 'reasoning stripped');
  assert.equal('systemPrompt' in summary[0].details[0], false, 'systemPrompt stripped');
  assert.equal('userPrompt' in summary[0].details[0], false, 'userPrompt stripped');
  assert.equal('response' in summary[0].details[0], false, 'response stripped');
  assert.equal(summary[0].details[0].status, 'VULNERABLE', 'verdicts survive the summarization');
  assert.equal(calls[5][1], false, 'vaultPassphraseSet flips false');
  assert.equal(localStorage.getItem('atlas_vault_unprotected_reminder'), '1', 'reminder flag written');
  assert.deepEqual(toastTexts(calls), [UNPROTECT_OK_MSG]);
});

test('Unprotect: failures toast the scrubbed message, write no reminder and flip no flag', async () => {
  localStorage.clear();
  const { actions, calls } = makeVaultInputRuntime({
    unprotectVaultImpl: () => { throw new Error('remove failed for gsk_errorToken'); }
  });
  await actions.handleUnprotectVault();
  assert.deepEqual(names(calls), ['askConfirm', 'unprotectVault', 'addToast'], 'no persistence/collapse after the throw');
  assert.equal(localStorage.getItem('atlas_vault_unprotected_reminder'), null, 'no reminder on failure');
  assert.deepEqual(toastTexts(calls), ['Failed to remove passphrase: remove failed for [REDACTED_KEY]']);
});

test('Lock: the full cross-domain reset inventory fires in the exact order and ends in a reload', async () => {
  const { actions, calls, historyRef, deps, reloads } = makeVaultInputRuntime();
  const prevState = deps.vaultStateRef.current;
  await actions.handleLockVault();
  assert.deepEqual(names(calls), [
    'invalidateProviderModelFetches', 'lockVault',
    'setProviders', 'setAiGenUrls',
    'setProviderDraft', 'setProviderTest', 'setProviderModelErrors',
    'setVaultLocked', 'setVaultInput', 'setActiveTab',
    'resetBackupPassphrase',
    'setExpandedCell', 'setExpandedDetailIds', 'setSelectedAudit',
    'setHistory',
    'setResults', 'clearConsoleLogs', 'setCurrentTestName',
    'AUDIT_ABORT', 'AI_GEN_ABORT', 'setUnlockPromptOpen', 'WINDOW_RELOAD'
  ], 'the lock arm resets every cross-domain collaborator in the App.jsx order, reload last');
  assert.equal(reloads.count, 1, 'exactly one window.location.reload()');
  assert.deepEqual(calls[2][1], [], 'providers collapse to []');
  assert.deepEqual(calls[3][1], [], 'aiGenUrls collapse to []');
  assert.equal(calls[4][1], null, 'provider draft cleared');
  assert.deepEqual(calls[5][1], {}, 'provider test results cleared');
  assert.deepEqual(calls[6][1], {}, 'provider model errors cleared');
  assert.equal(calls[7][1], true, 'vaultLocked flips true');
  assert.equal(calls[8][1], '', 'vaultInput cleared');
  assert.equal(calls[9][1], 'dashboard', 'landing tab resets to dashboard');
  assert.equal(calls[10][0], 'resetBackupPassphrase', 'the backup passphrase reset runs in the inventory');
  assert.equal(calls[11][1], null, 'expanded cell cleared');
  const detailIds = calls[12][1];
  assert.ok(detailIds instanceof Set, 'expanded detail ids reset to a Set');
  assert.equal(detailIds.size, 0, 'expanded detail ids empty');
  assert.equal(calls[13][1], null, 'selected audit cleared');
  const summary = calls[14][1];
  assert.strictEqual(historyRef.current, summary, 'the ref points at the collapsed summary array');
  assert.deepEqual(summary, historyRef.current.map(auditRecordMod.summarizeAuditRecord), 'lock summarizes via the real summarizeAuditRecord');
  assert.equal('reasoning' in summary[0].details[0], false, 'reasoning stripped on lock');
  assert.deepEqual(calls[15][1], [], 'results cleared');
  assert.equal(calls[17][1], '', 'current test name cleared');
  assert.equal(deps.vaultLockedRef.current, true, 'the reentry-guard mirror flips true');
  assert.notStrictEqual(deps.vaultStateRef.current, prevState, 'the vault state mirror gets a fresh object');
  assert.deepEqual(deps.vaultStateRef.current, { providers: [] }, 'the vault state mirror collapses to { providers: [] }');
  assert.equal(deps.aiRunCtxRef.current, null, 'the AI run context is dropped');
  assert.deepEqual(toastTexts(calls), [], 'the lock path toasts nothing');
});

test('Lock: unset abort refs are tolerated and the reload still fires', async () => {
  const rt = makeRuntime({ auditAbortRef: { current: null }, aiGenAbortRef: { current: null } });
  const { calls, reloads } = rt;
  const actions = rt.render('');
  await actions.handleLockVault();
  assert.equal(reloads.count, 1, 'the lock path completes into the reload with no armed abort controllers');
  assert.ok(!names(calls).includes('AUDIT_ABORT'), 'no audit abort attempted');
  assert.ok(!names(calls).includes('AI_GEN_ABORT'), 'no AI abort attempted');
});
