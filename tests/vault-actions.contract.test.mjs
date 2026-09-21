// Structural contract for the Key-Vault session actions: the vaultInput state
// and the protect/unprotect/lock handler trio live in
// src/hooks/useVaultActions.js, and App.jsx keeps only the hook
// adoption plus the bare-identifier wiring into the SettingsView mount.
//
// The companion behavioral suite (tests/vault-actions.unit.test.mjs) covers
// the same guarantees as the hook's runtime contract.
//
// Behavioral scenarios drive the REAL handler bodies, read from the
// hook module source (brace-aware, comment/string-safe — repo convention:
// the sibling bundled-entry suites) and evaluated with their collaborators
// injected — Node cannot import the JSX-adjacent hook graph under bare
// node:test. The secret-scrubbing redactor and the audit-record summarizer
// are the REAL src/utils modules; storage runs on the tests/helpers/dom.mjs
// shim. Standalone under bare node (node --test <file>): no dev server, no
// browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';
import { redactSensitiveText } from '../src/utils/redact.js';
import { summarizeAuditRecord } from '../src/utils/audit-record.js';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useVaultActions.js';
const APP_PATH = 'src/App.jsx';
const hook = readFileSync(join(root, HOOK_PATH), 'utf8').replace(/\r\n/g, '\n');
const app = readFileSync(join(root, APP_PATH), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// Extraction machinery (brace-aware, comment/string/template safe — same
// approach as the sibling bundled-entry suites)
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

function extractHandlerRhs(src, decl) {
  const prologue = `const ${decl} = `;
  const m = src.indexOf(prologue);
  assert.ok(m >= 0, `${HOOK_PATH} must declare ${decl}`);
  const rhsStart = m + prologue.length;
  const bodyStart = src.indexOf('{', rhsStart);
  const bodyEnd = scanGroup(src, bodyStart);
  return src.slice(rhsStart, bodyEnd);
}

const DEPS = [
  'vaultInput',
  'addToast', 'askConfirm', 'setActiveTab',
  'protectVault', 'unprotectVault', 'lockVault',
  'providers', 'setProviders', 'setProviderDraft', 'setProviderTest', 'setProviderModelErrors',
  'invalidateProviderModelFetches', 'vaultLockedRef', 'vaultStateRef',
  'setVaultLocked', 'setVaultPassphraseSet', 'setUnlockPromptOpen',
  'aiGenUrls', 'setAiGenUrls', 'aiGenAbortRef', 'aiRunCtxRef',
  'setHistory', 'historyRef',
  'setResults', 'clearConsoleLogs', 'setCurrentTestName', 'auditAbortRef',
  'resetBackupPassphrase',
  'setExpandedCell', 'setExpandedDetailIds', 'setSelectedAudit',
  'saveSourceUrls', 'clearAuditHistory', 'summarizeAuditRecord', 'redactSensitiveText',
  'setVaultInput', 'setVaultValidationError'
];

const makeVaultActions = new Function('$', `const { ${DEPS.join(', ')} } = $;
return {
  handleProtectVault: ${extractHandlerRhs(hook, 'handleProtectVault')},
  handleUnprotectVault: ${extractHandlerRhs(hook, 'handleUnprotectVault')},
  handleLockVault: ${extractHandlerRhs(hook, 'handleLockVault')}
};`);

// ---------------------------------------------------------------------------
// Collaborator harness
// ---------------------------------------------------------------------------

const GATE_MSG = 'Use a passphrase of at least 12 characters.';
const PROTECT_OK_MSG = 'API keys are now encrypted at rest. You will be asked to unlock on each new session.';
const UNPROTECT_CONFIRM = 'Remove the passphrase? Your API keys will be stored in the browser vault WITHOUT encryption.';
const UNPROTECT_OK_MSG = 'Passphrase removed. Keys are now stored in plaintext within the vault.';

const DETAILED_RECORD = {
  id: 'audit-pre-1',
  timestamp: '2026-08-31T00:00:00.000Z',
  completed: true,
  totalTests: 1,
  vulnerableCount: 1,
  details: [{
    uid: 'r-1',
    auditId: 'audit-pre-1',
    testId: 't-x',
    status: 'VULNERABLE',
    reasoning: 'gave up the secret',
    systemPrompt: 'sys prompt text',
    userPrompt: 'user prompt text',
    response: 'response text'
  }]
};

function makeDeps(overrides = {}) {
  const calls = [];
  const validationErrors = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const recAsync = (name, impl) => async (...args) => {
    calls.push([name, ...args]);
    if (impl) return impl(...args);
  };
  const { askConfirmResult = true, protectVaultImpl, unprotectVaultImpl, ...rest } = overrides;
  const historyRef = { current: [structuredClone(DETAILED_RECORD)] };
  const deps = {
    vaultInput: '',
    addToast: rec('addToast'),
    askConfirm: recAsync('askConfirm', async () => askConfirmResult),
    setActiveTab: rec('setActiveTab'),
    protectVault: recAsync('protectVault', protectVaultImpl),
    unprotectVault: recAsync('unprotectVault', unprotectVaultImpl),
    lockVault: rec('lockVault'),
    providers: [{ id: 'provider-1', enabled: true }],
    setProviders: rec('setProviders'),
    setProviderDraft: rec('setProviderDraft'),
    setProviderTest: rec('setProviderTest'),
    setProviderModelErrors: rec('setProviderModelErrors'),
    invalidateProviderModelFetches: rec('invalidateProviderModelFetches'),
    vaultLockedRef: { current: false },
    vaultStateRef: { current: { providers: [{ id: 'stale' }] } },
    setVaultLocked: rec('setVaultLocked'),
    setVaultPassphraseSet: rec('setVaultPassphraseSet'),
    setUnlockPromptOpen: rec('setUnlockPromptOpen'),
    aiGenUrls: ['https://relay.example/feed'],
    setAiGenUrls: rec('setAiGenUrls'),
    aiGenAbortRef: { current: { abort: () => calls.push(['AI_GEN_ABORT']) } },
    aiRunCtxRef: { current: { some: 'ctx' } },
    setHistory: rec('setHistory'),
    historyRef,
    setResults: rec('setResults'),
    clearConsoleLogs: rec('clearConsoleLogs'),
    setCurrentTestName: rec('setCurrentTestName'),
    auditAbortRef: { current: { abort: () => calls.push(['AUDIT_ABORT']) } },
    resetBackupPassphrase: rec('resetBackupPassphrase'),
    setExpandedCell: rec('setExpandedCell'),
    setExpandedDetailIds: rec('setExpandedDetailIds'),
    setSelectedAudit: rec('setSelectedAudit'),
    saveSourceUrls: rec('saveSourceUrls'),
    clearAuditHistory: rec('clearAuditHistory'),
    summarizeAuditRecord,
    redactSensitiveText,
    setVaultInput: rec('setVaultInput'),
    setVaultValidationError: value => validationErrors.push(value)
  };
  Object.assign(deps, rest);
  return { deps, calls, historyRef, validationErrors };
}

const names = (calls) => calls.map((c) => c[0]);
const toastTexts = (calls) => calls.filter((c) => c[0] === 'addToast').map((c) => c[1]);

test('The hook owns the vaultInput state + the trio; App sheds them and keeps only the adoption', () => {
  const count = (src, needle) => src.split(needle).length - 1;
  // Hook-side ownership: one definition site for the state and the trio.
  assert.equal(count(hook, 'export function useVaultActions({'), 1, 'the hook module exports useVaultActions exactly once');
  assert.equal(count(hook, "const [vaultInput, setVaultInput] = useState('');"), 1, 'vaultInput is hook state, declared exactly once');
  assert.equal(count(hook, 'const handleProtectVault = '), 1, 'handleProtectVault declared exactly once in the hook');
  assert.equal(count(hook, 'const handleUnprotectVault = '), 1, 'handleUnprotectVault declared exactly once in the hook');
  assert.equal(count(hook, 'const handleLockVault = '), 1, 'handleLockVault declared exactly once in the hook');
  assert.match(hook, /setVaultInput: setVaultInputAndClearError/, 'input edits clear inline validation');
  assert.match(hook.slice(hook.lastIndexOf('return {')), /vaultValidationError/, 'the hook exposes inline validation');
  // App-side shedding: zero inline definitions remain.
  assert.equal(count(app, 'const handleProtectVault = '), 0, 'App no longer declares handleProtectVault');
  assert.equal(count(app, 'const handleUnprotectVault = '), 0, 'App no longer declares handleUnprotectVault');
  assert.equal(count(app, 'const handleLockVault = '), 0, 'App no longer declares handleLockVault');
  assert.equal(count(app, "const [vaultInput, setVaultInput] = useState('');"), 0, 'vaultInput is no longer App state');
  // Adoption: the import, the single hook call and the callback-bound backup reset.
  assert.equal(count(app, "import { useVaultActions } from './hooks/useVaultActions';"), 1, 'the hook import appears exactly once');
  assert.equal(count(app, '} = useVaultActions({'), 1, 'App adopts the hook exactly once');
  assert.equal(count(app, "resetBackupPassphrase: () => setBackupPassphrase(''),"), 1,
    'the backup-passphrase reset is bound as a callback (useBackupFlow sits later in the body)');
  // Mount wiring: the SettingsView mount receives the bare-identifier surface.
  const mountStart = app.indexOf('<SettingsView');
  const mountEnd = app.indexOf('/>', mountStart);
  const mount = mountStart >= 0 && mountEnd > mountStart ? app.slice(mountStart, mountEnd) : '';
  for (const wiring of [
    'handleProtectVault={handleProtectVault}',
    'handleUnprotectVault={handleUnprotectVault}',
    'handleLockVault={handleLockVault}',
    'vaultInput={vaultInput}',
    'setVaultInput={setVaultInput}'
  ]) {
    assert.ok(mount.includes(wiring), `the SettingsView mount receives ${wiring}`);
  }
});

test('Protect: sub-12-char passphrases hit the gate toast and never reach protectVault', async () => {
  for (const short of [null, undefined, '', 'four', '0123456789a']) {
    const { deps, calls, validationErrors } = makeDeps({ vaultInput: short });
    const actions = makeVaultActions(deps);
    await actions.handleProtectVault();
    assert.deepEqual(toastTexts(calls), [GATE_MSG], `gate toast for ${JSON.stringify(short)}`);
    assert.deepEqual(names(calls), ['addToast'], `no persistence for ${JSON.stringify(short)}`);
    assert.deepEqual(validationErrors, [GATE_MSG]);
  }
});

test('Protect: 12-char boundary passes, then the exact source re-persist + state transition sequence fires', async () => {
  const { deps, calls } = makeDeps({ vaultInput: '0123456789ab' });
  const actions = makeVaultActions(deps);
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
  const { deps, calls } = makeDeps({
    vaultInput: '0123456789ab',
    protectVaultImpl: () => { throw new Error('protect failed for sk-test-123'); }
  });
  const actions = makeVaultActions(deps);
  await actions.handleProtectVault();
  assert.deepEqual(names(calls), ['protectVault', 'setVaultInput', 'addToast'], 'no transition setters on failure');
  assert.equal(calls[1][1], '', 'vaultInput resets on failure');
  assert.deepEqual(toastTexts(calls), ['Failed to protect keys: protect failed for [REDACTED_KEY]'],
    'error toast is the redactSensitiveText-scrubbed message');
});

test('Unprotect: a declined confirm is a full no-op', async () => {
  localStorage.clear();
  const { deps, calls, historyRef } = makeDeps({ askConfirmResult: false });
  const actions = makeVaultActions(deps);
  await actions.handleUnprotectVault();
  assert.equal(calls[0][1], UNPROTECT_CONFIRM, 'askConfirm receives the exact plaintext warning');
  assert.deepEqual(names(calls), ['askConfirm'], 'nothing else fires without confirmation');
  assert.equal(historyRef.current[0].details[0].reasoning, 'gave up the secret', 'history untouched');
  assert.equal(localStorage.getItem('atlas_vault_unprotected_reminder'), null, 'no reminder write');
});

test('Unprotect: confirmed flow re-persists plaintext sources, collapses history via the real summarizer, drops the reminder flag', async () => {
  const { deps, calls, historyRef } = makeDeps();
  const actions = makeVaultActions(deps);
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
  assert.deepEqual(summary, historyRef.current.map(summarizeAuditRecord), 'summaries come from the real summarizeAuditRecord');
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
  const { deps, calls } = makeDeps({
    unprotectVaultImpl: () => { throw new Error('remove failed for gsk_errorToken'); }
  });
  const actions = makeVaultActions(deps);
  await actions.handleUnprotectVault();
  assert.deepEqual(names(calls), ['askConfirm', 'unprotectVault', 'addToast'], 'no persistence/collapse after the throw');
  assert.equal(localStorage.getItem('atlas_vault_unprotected_reminder'), null, 'no reminder on failure');
  assert.deepEqual(toastTexts(calls), ['Failed to remove passphrase: remove failed for [REDACTED_KEY]']);
});

test('Lock: the full cross-domain reset inventory fires in the exact order and ends in a reload', async () => {
  const { deps, calls, historyRef } = makeDeps();
  const prevState = deps.vaultStateRef.current;
  const actions = makeVaultActions(deps);
  let reloads = 0;
  const windowOrig = globalThis.window;
  globalThis.window = { location: { reload: () => { reloads += 1; calls.push(['WINDOW_RELOAD']); } } };
  try {
    await actions.handleLockVault();
  } finally {
    if (windowOrig === undefined) delete globalThis.window; else globalThis.window = windowOrig;
  }
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
  ], 'the lock arm resets every cross-domain collaborator in the hook order, reload last');
  assert.equal(reloads, 1, 'exactly one window.location.reload()');
  assert.deepEqual(calls[2][1], [], 'providers collapse to []');
  assert.deepEqual(calls[3][1], [], 'aiGenUrls collapse to []');
  assert.equal(calls[4][1], null, 'provider draft cleared');
  assert.deepEqual(calls[5][1], {}, 'provider test results cleared');
  assert.deepEqual(calls[6][1], {}, 'provider model errors cleared');
  assert.equal(calls[7][1], true, 'vaultLocked flips true');
  assert.equal(calls[8][1], '', 'vaultInput cleared');
  assert.equal(calls[9][1], 'dashboard', 'landing tab resets to dashboard');
  assert.equal(names(calls)[10], 'resetBackupPassphrase', 'the backup passphrase resets via the injected callback');
  assert.equal(calls[10].length, 1, 'the reset callback is invoked with no args (App binds setBackupPassphrase(\'\'))');
  assert.equal(calls[11][1], null, 'expanded cell cleared');
  const detailIds = calls[12][1];
  assert.ok(detailIds instanceof Set, 'expanded detail ids reset to a Set');
  assert.equal(detailIds.size, 0, 'expanded detail ids empty');
  assert.equal(calls[13][1], null, 'selected audit cleared');
  const summary = calls[14][1];
  assert.strictEqual(historyRef.current, summary, 'the ref points at the collapsed summary array');
  assert.deepEqual(summary, historyRef.current.map(summarizeAuditRecord), 'lock summarizes via the real summarizeAuditRecord');
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
  const { deps, calls } = makeDeps({
    auditAbortRef: { current: null },
    aiGenAbortRef: { current: null }
  });
  const actions = makeVaultActions(deps);
  let reloads = 0;
  const windowOrig = globalThis.window;
  globalThis.window = { location: { reload: () => { reloads += 1; } } };
  try {
    await actions.handleLockVault();
  } finally {
    if (windowOrig === undefined) delete globalThis.window; else globalThis.window = windowOrig;
  }
  assert.equal(reloads, 1, 'the lock path completes into the reload with no armed abort controllers');
  assert.ok(!names(calls).includes('AUDIT_ABORT'), 'no audit abort attempted');
  assert.ok(!names(calls).includes('AI_GEN_ABORT'), 'no AI abort attempted');
});
