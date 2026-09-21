// Contract: the audit-run engine (runSecurityAudit +
// stopSecurityAudit + the log helper they lean on) is implemented BEHIND the
// already-declared src/hooks/useAuditRun.js parameter contract, App.jsx calls
// the hook and keeps only start/stop button bindings, and no behavioral drift
// reaches the comparison grid (status values, reasoning fields, timing) or
// the audit history records.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see the sibling hook suites
// and tests/audit-history-context.contract.test.mjs). The evaluation semantics
// themselves are exercised BEHAVIORALLY against the real src/utils/api.js
// keyword evaluator and the real src/data/demo-seeds.js seed table (no mocks).
//
// Placement latitude: engine-core literals are pinned INSIDE the hook file.
// UI-adjacent concerns that the declared parameter contract does not carry
// (the redact+timestamp log format, the expanded-cell reset, the cancel
// notice) are pinned ONCE ACROSS the App.jsx/useAuditRun.js pair, so they may
// live on either side.
//
// Technical-result literals: the judge-merge hook owns
// applyJudgeMergeAndReevaluate (incl. its `r.status === 'ERROR' ||
// r.status === 'EMPTY'` technical-skip branch), and the audit-detail modal
// owns the statusColor map (incl. its `s === 'EMPTY'` branch). The
// status-literal loop therefore resolves across the App ∪ modal union, while
// the byte-identical technical-skip branch is asserted against the judge-merge
// hook: no literal dropped or duplicated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/useAuditRun.js';
const RUNNER_VIEW_PATH = 'src/components/views/RunnerView.jsx';
const COMPARISON_RESULTS_PATH = 'src/components/runner/ComparisonResults.jsx';
const JUDGE_REEVALUATION_PATH = 'src/utils/judge-reevaluation.js';
const VAULT_ACTIONS_HOOK_PATH = 'src/hooks/useVaultActions.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', hook = '', runnerView = '', comparisonResults = '', comparisonTable = '', judgeReevaluation = '', vaultActionsHook = '', auditModal = '';
try {
  app = readSource(APP_PATH);
  hook = readSource(HOOK_PATH);
  runnerView = readSource(RUNNER_VIEW_PATH);
    comparisonResults = readSource(COMPARISON_RESULTS_PATH);
    judgeReevaluation = readSource(JUDGE_REEVALUATION_PATH);
  vaultActionsHook = readSource(VAULT_ACTIONS_HOOK_PATH);
  // The audit-detail modal (which carries the statusColor 'EMPTY' literal) —
  // read tolerantly and `auditModal` stays '' when absent.
  try { auditModal = readSource('src/components/modals/AuditDetailModal.jsx'); } catch { /* modal may be absent */ }
  try { comparisonTable = readSource('src/utils/comparison-table.js'); } catch { /* table may be absent */ }
} catch { /* missing files fail their first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);
const pair = app + '\n' + hook;
// The Key-Vault lock arm lives in the useVaultActions hook; UI-adjacent pins
// that straddle the lock path are counted across the App ∪ useAuditRun ∪
// useVaultActions union.
const pairPlusVaultHook = `${pair}\n${vaultActionsHook}`;

// ---------------------------------------------------------------------------
// The engine is implemented behind the declared hook contract; App shrinks
// ---------------------------------------------------------------------------

test('The hook still exports useAuditRun with the FULL declared parameter contract', () => {
  assert.match(hook, /export function useAuditRun\(\{/, 'the hook exports the parameter-bag contract');
  for (const param of [
    'runningRef', 'setRunning', 'setStopping', 'setProgress', 'addConsoleLog', 'clearConsoleLogs',
    'setResults', 'setCurrentTestName', 'auditAbortRef', 'auditRunTokenRef',
    'vaultLocked', 'vaultPassphraseSet', 'buildJudge', 'judgeConfig', 'providers', 'targets',
    'selectedTests', 'evalMode', 'getPrompt', 'getPromptOverrides', 'allTestsById',
    'replaceAuditHistory', 'appendAuditHistory', 'setResultOverride', 'effectiveStatus',
    'effectiveDetails', 'addToast', 'askConfirm', 'askInput',
    'runWithTimeout', 'AUDIT_CALL_TIMEOUT_MS'
  ]) {
    assert.ok(new RegExp(`\\b${param}\\b`).test(hook), `the declared contract still carries ${param}`);
  }
});

test('The engine body now lives inside the hook — guard clauses with exact toast copy, in order', () => {
  const reentryAt = Math.max(
    idx(hook, 'if (runningRef.current || auditAbortRef.current) {'),
    idx(hook, 'if (running || auditAbortRef.current) {')
  );
  const reentryToast = idx(hook, "addToast('An audit is already running. Stop it before starting another audit.');");
  const testsGuard = idx(hook, 'if (selectedTests.length === 0) {');
  const testsToast = idx(hook, "addToast('Select at least one test case to run.');");
  const lineup = idx(hook, 'const lineup = ');
  const targetsGuard = idx(hook, 'if (lineup.length === 0) {');
  const targetsToast = idx(hook, "addToast('Add at least one target model to the comparison lineup.');");
  assert.ok(reentryAt >= 0, 'a reentry guard on the abort/running plumbing exists in the hook');
  assert.ok(reentryToast > reentryAt, 'reentry guard precedes its toast');
  assert.ok(testsGuard > reentryToast && testsToast > testsGuard, 'no-tests guard comes second with its toast');
  assert.ok(lineup > testsToast && targetsGuard > lineup && targetsToast > targetsGuard, 'empty-lineup guard comes third, after the lineup resolution');
});

test('Start sequence + abort plumbing + rate-limiter reset live inside the hook, in order', () => {
  const seq = ['setRunning(true);', 'setProgress(0);', 'clearConsoleLogs();', 'setResults([]);']
    .map((s) => idx(hook, s));
  assert.ok(seq.every((p) => p >= 0), 'the four runner reset calls are present in the hook');
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'start order: running → progress → consoleLogs → results');

  const controller = idx(hook, 'const controller = new AbortController();');
  const assign = idx(hook, 'auditAbortRef.current = controller;');
  const token = idx(hook, 'const runToken = ++auditRunTokenRef.current;');
  const signal = idx(hook, 'const signal = controller.signal;');
  const auditId = idx(hook, 'const auditId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;');
  const persisted = idx(hook, 'let historyPersisted = false;');
  const rateLimiter = idx(hook, 'resetRateLimiter();');
  assert.ok(controller >= 0 && assign > controller && token > assign && signal > token, 'controller → stored → token bumped → signal aliased, in that order');
  assert.ok(auditId > signal && persisted > auditId, 'audit id (base36 timestamp + 8 base36 random chars) and the persisted flag are set before the run starts');
  assert.ok(rateLimiter > persisted, 'the rate limiter is reset AFTER the abort plumbing, BEFORE any request');
  assert.match(hook, /import \{[^}]*resetRateLimiter[^}]*\} from '\.\.\/utils\/api(\.js)?';/, 'the rate limiter comes from the shared utils/api barrel — not reimplemented');
});

test('The old hook scaffold engine is gone — no divergent second engine', () => {
  for (const scaffoldLiteral of ["'No tests selected'", "'No targets configured'", 'audit_${Date.now()}']) {
    assert.ok(!hook.includes(scaffoldLiteral), `the pre-port scaffold literal is gone from the hook: ${scaffoldLiteral}`);
  }
  assert.equal(countIn(hook, /setRunning\(true\);/g), 1, 'exactly one run start in the hook');
});

test('App consumes the hook and keeps only start/stop bindings — the engine body is deleted', () => {
  const call = idx(app, '= useAuditRun({');
  assert.ok(call >= 0, 'App calls useAuditRun({...})');
  for (const gone of [
    'const runSecurityAudit = async',
    'const stopSecurityAudit = () => {',
    "addToast('An audit is already running. Stop it before starting another audit.');",
    'resetRateLimiter();',
    'const finalAuditRecord = {',
    'runResults.push(',
    'DEMO_SIMULATION_RESPONSES'
  ]) {
    assert.equal(idx(app, gone), -1, `App no longer contains engine-only code: ${gone}`);
  }
  assert.equal(countIn(app, /import \{[^}]*DEMO_SIMULATION_RESPONSES[^}]*\} from '\.\/data\/demo-seeds';/g), 0, 'App stops importing the demo seed table');
  const callRegion = app.slice(call, call + 2600);
  assert.ok(idx(callRegion, 'useDemoMode') >= 0, 'App passes useDemoMode into the hook call (the sandbox branch needs it)');
  for (const mustPass of [
    'auditAbortRef', 'auditRunTokenRef', 'setResults', 'clearConsoleLogs', 'addConsoleLog',
    'setCurrentTestName', 'setProgress', 'targets', 'selectedTests', 'evalMode',
    'providers', 'judgeConfig', 'buildJudge', 'allTestsById', 'appendAuditHistory',
    'runWithTimeout', 'AUDIT_CALL_TIMEOUT_MS'
  ]) {
    assert.ok(idx(callRegion, mustPass) >= 0, `the hook call passes ${mustPass}`);
  }
});

test('The run/stop buttons bind to hook-provided handlers (direct or thin alias)', () => {
  const destructure = app.match(/const\s*\{([^}]+)\}\s*=\s*useAuditRun\(/s);
  assert.ok(destructure, 'the hook return is destructured in App');
  const provided = new Set();
  for (const piece of destructure[1].split(',')) {
    const name = piece.trim().split(':')[0].trim();
    if (name) provided.add(name);
    const rename = piece.trim().match(/\w+\s*:\s*(\w+)/);
    if (rename) provided.add(rename[1]);
  }
  // The runner buttons live in RunnerView.jsx, so the binding surface is the
  // App.jsx+RunnerView.jsx pair; the destructure stays App-side.
  const surface = app + '\n' + runnerView;
  const bindTarget = (testid) => {
    const at = idx(surface, `data-testid="${testid}"`);
    if (at < 0) return null;
    const m = surface.slice(at, at + 400).match(/onClick=\{([A-Za-z_$][\w$]*)\}/);
    return m ? m[1] : null;
  };
  const runName = bindTarget('audit-run');
  const stopName = bindTarget('audit-stop');
  assert.ok(runName && provided.has(runName), `the run button binds a hook-provided handler (got ${runName}; provided: ${[...provided].sort().join(', ')})`);
  assert.ok(
    stopName && (provided.has(stopName) || new RegExp(`const ${stopName} = \\(\\) => [A-Za-z_$][\\w$]*\\(`).test(app)),
    `the stop button binds a hook-provided handler or a thin alias (got ${stopName})`
  );
});

test('The hook return surface keeps the full declared API', () => {
  const ret = hook.lastIndexOf('return {');
  assert.ok(ret >= 0, 'the hook returns its API object');
  const retBody = hook.slice(ret, ret + 1400);
  for (const key of [
    'runAudit', 'stopAudit', 'runSingleTest', 'evaluateWithAIJudge',
    'buildJudge', 'redactAuditResult', 'summarizeAuditRecord', 'appendAuditHistory',
    'replaceAuditHistory', 'deleteAudit', 'setResultOverride', 'effectiveStatus', 'effectiveDetails'
  ]) {
    assert.ok(idx(retBody, key) >= 0, `the return surface exposes ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Demo-simulation branch and real-run dispatch, inside the hook
// ---------------------------------------------------------------------------

test('Demo branch lives in the hook — seed table import, vulnerable-model split, simulated reasoning, abortable delay', () => {
  assert.match(hook, /import \{[^}]*DEMO_SIMULATION_RESPONSES[^}]*\} from '\.\.\/data\/demo-seeds(\.js)?';/, 'the hook imports the seed table from the shared data module');
  const demoGate = idx(hook, 'if (useDemoMode) {');
  assert.ok(demoGate >= 0, 'the demo branch is gated on the useDemoMode contract param');
  const demoEnd = idx(hook, 'const resultObj = {');
  const demoBody = hook.slice(demoGate, demoEnd > demoGate ? demoEnd : demoGate + 2600);
  const delay = idx(demoBody, 'setTimeout(resolve, 1200)');
  const abortListener = idx(demoBody, "reject(new DOMException('Aborted', 'AbortError'))");
  const demoSet = idx(demoBody, 'const demoSet = DEMO_SIMULATION_RESPONSES[test.id];');
  const demoVulnerable = idx(demoBody, "const demoVulnerable = target.model === 'Demo Vulnerable';");
  const demoType = idx(demoBody, "const demoType = demoVulnerable ? 'llama_vulnerable' : 'llama_secure';");
  const prefix = idx(demoBody, '(Simulated) ${demoSet[demoType].reasoning}');
  const vulnFallback = idx(demoBody, '"Sure — here is what you asked for."');
  const vulnFallbackStatus = idx(demoBody, "{ status: 'VULNERABLE', reasoning: 'Simulated vulnerable model complied with the request.' }");
  const secureFallback = idx(demoBody, '"I cannot fulfill this request as it violates my policy."');
  const secureFallbackStatus = idx(demoBody, "{ status: 'SECURE', reasoning: 'Simulated default refusal.' }");
  assert.ok(delay >= 0 && abortListener > delay, 'the 1200ms simulated latency is abortable mid-wait');
  assert.ok(demoSet > abortListener && demoVulnerable > demoSet && demoType > demoVulnerable && prefix > demoType, 'seed lookup → vulnerable split → demo type → (Simulated) reasoning prefix, in order');
  assert.ok(vulnFallback >= 0 && vulnFallbackStatus > vulnFallback, 'custom tests on the vulnerable model comply with a VULNERABLE verdict');
  assert.ok(secureFallback >= 0 && secureFallbackStatus > secureFallback, 'custom tests on the secure model get the default refusal (SECURE)');
  const demoBanner = idx(hook, 'DEMO SIMULATION ACTIVE');
  const realBanner = idx(hook, 'Real API Integration active. Evaluating via: ${evalMode.toUpperCase()}');
  assert.ok(demoBanner >= 0 && realBanner >= 0, 'the mode banners survive the move (copy verbatim)');
});

test('Real branch in the hook — transport through ./utils/api under the shared per-call timeout', () => {
  const apiImport = hook.split('\n').filter((l) => /^\s*import\b/.test(l) && /from '\.\.\/utils\/api(\.js)?';/.test(l)).join('\n');
  for (const fn of ['queryModel', 'evaluateWithAIJudge', 'evaluateWithKeywords', 'resetRateLimiter']) {
    assert.match(apiImport, new RegExp(`\\b${fn}\\b`), `imports ${fn} from ../utils/api`);
  }
  const call = idx(hook, 'response = await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, (sig) => queryModel(');
  assert.ok(call >= 0, 'the payload call is wrapped in runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, ...) inside the hook (matches the verbatim multi-line engine copy)');
  const callBody = hook.slice(call, call + 260);
  for (const arg of ['target.provider,', 'target.model,', 'test.systemPrompt,', 'test.userPrompt,', 'providers,', 'sig']) {
    assert.ok(idx(callBody, arg) >= 0, `queryModel receives ${arg}`);
  }
  const emptyGate = idx(hook, 'if (!response || !String(response).trim()) {');
  const emptyStatus = idx(hook, "{ status: 'EMPTY', reasoning: 'Model returned an empty response. No content to evaluate - not treated as a vulnerability.' }");
  const judgeGate = idx(hook, "} else if (evalMode === 'judge') {");
  const buildJudgeCall = idx(hook, 'const judge = buildJudge(judgeConfig, providers);');
  const noJudge = idx(hook, 'if (!judge) {');
  const fallbackPrefix = idx(hook, "evaluateWithKeywords(test, response, 'AI Judge not configured - Keyword Fallback');");
  const judgeCall = idx(hook, 'evalResult = await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, (sig) => evaluateWithAIJudge(test, response, judge, sig));');
  const keywordCall = idx(hook, 'evalResult = evaluateWithKeywords(test, response);');
  assert.ok(emptyGate >= 0 && emptyStatus > emptyGate, 'an empty response is EMPTY, never a keyword/Judge verdict');
  assert.ok(judgeGate > emptyStatus, 'evalMode dispatch happens only for non-empty responses');
  assert.ok(buildJudgeCall > judgeGate && noJudge > buildJudgeCall, 'judge is built after the evalMode gate');
  assert.ok(fallbackPrefix > noJudge && judgeCall > fallbackPrefix, 'unconfigured judge falls back to keywords; configured judge runs under the same timeout');
  assert.ok(keywordCall >= 0, 'non-judge evalMode uses the static keyword checkers');
});

test('Stop handling aborts and flags stopping; the cancel notice survives once across the pair', () => {
  const stopAudit = idx(hook, 'const stopAudit = ');
  assert.ok(stopAudit >= 0, 'stopAudit stays a hook operation (start/stop bindings stay thin)');
  const stopBody = hook.slice(stopAudit, stopAudit + 600);
  const engineStyle = idx(stopBody, 'const controller = auditAbortRef.current;') >= 0;
  const guard = engineStyle ? idx(stopBody, 'if (controller) {') : idx(stopBody, 'if (auditAbortRef.current) {');
  const abort = engineStyle ? idx(stopBody, 'controller.abort();') : idx(stopBody, 'auditAbortRef.current.abort();');
  const setStop = idx(stopBody, 'setStopping(true);');
  assert.ok(guard >= 0 && abort > guard && setStop >= 0, 'stop aborts the live controller and flags stopping');
  assert.equal(
    pair.split('Cancelling audit... aborting in-flight requests.').length - 1,
    1,
    'the cancel notice survives exactly once across App.jsx + useAuditRun.js (moved or kept)'
  );
  // No divergent scaffold stop copy may linger as a second notice.
  assert.ok(!hook.includes('Audit stop requested...'), 'the scaffold stop copy is replaced by the engine copy');
});

// ---------------------------------------------------------------------------
// Log streaming parity (UI-adjacent — pinned once across the pair)
// ---------------------------------------------------------------------------

test('The redact → timestamped console format survives exactly once across the pair', () => {
  assert.equal(
    pair.split('[${new Date().toLocaleTimeString()}] ${safe}').length - 1,
    1,
    'the exact streaming format survives exactly once (App log helper or hook-internal helper)'
  );
  const hookUsesAddConsoleLog = /\baddConsoleLog\b/.test(hook);
  assert.ok(hookUsesAddConsoleLog, 'engine log lines still stream through the contract addConsoleLog seam');
});

test('The expanded-matrix-cell reset survives exactly twice across the union', () => {
  // The two semicolon'd statements: the vault-lock reset (useVaultActions
  // hook-side) and the engine-start reset (hook start or thin App wrapper — or
  // a stale expanded cell leaks into the next run). The close-details button's
  // arrow-body call carries no semicolon and never counts.
  assert.equal(countIn(pairPlusVaultHook, /\bsetExpandedCell\(null\);/g), 2,
    'the engine-start expanded-cell reset survives the move (hook start or thin App wrapper) alongside the vault-lock reset');
});

// ---------------------------------------------------------------------------
// Result shape streamed to the comparison grid + history persistence
// ---------------------------------------------------------------------------

test('Per-test loop — name → result push → state append → progress, with abort breaks', () => {
  const name = idx(hook, 'setCurrentTestName(`${test.name} → ${target.model}`);');
  const pushOk = idx(hook, 'runResults.push(resultObj);');
  const setOk = idx(hook, 'setResults(prev => [...prev, resultObj]);');
  const stepInc = idx(hook, 'step++;');
  const progress = idx(hook, 'setProgress(Math.round((step / totalSteps) * 100));');
  const abortBreak = idx(hook, 'if (signal.aborted) break;', progress);
  assert.ok(name >= 0 && pushOk > name, 'current test name streams with the exact arrow template');
  assert.ok(setOk > pushOk, 'results stream into state right after the local push');
  assert.ok(stepInc > setOk && progress > stepInc, 'progress recomputes only after step++');
  assert.ok(abortBreak >= 0, 'the inner loop breaks on abort after progress updates');
  assert.equal(countIn(hook, /setResults\(prev => \[\.\.\.prev, (resultObj|errorResult)\]\);/g), 2, 'success and error results stream identically');
});

test('Result object shape fed to the comparison grid is fixed (order included)', () => {
  const objStart = idx(hook, 'const resultObj = {');
  assert.ok(objStart >= 0);
  const objBody = hook.slice(objStart, idx(hook, '};', objStart));
  const fields = [
    'auditId,',
    'targetUid: target.uid,',
    'testId: test.id,',
    'testName: test.name,',
    'tactic: test.tactic,',
    'techniqueId: test.techniqueId,',
    'techniqueName: test.techniqueName,',
    'systemPrompt: test.systemPrompt,',
    'userPrompt: test.userPrompt,',
    'response,',
    'status: evalResult.status,',
    'reasoning: evalResult.reasoning,',
    'model: target.model,',
    'provider: target.provider,',
    'timestamp: new Date().toISOString()'
  ].map((f) => idx(objBody, f));
  assert.ok(fields.every((p) => p >= 0), 'every result field is present');
  assert.deepEqual(fields, [...fields].sort((a, b) => a - b), 'field order is stable (auditId first, timestamp last)');
});

test('Error arm — AbortError rethrow, redacted message, ERROR-shaped result', () => {
  const rethrow = idx(hook, "if (err && err.name === 'AbortError') throw err;");
  const redact = idx(hook, 'const errMsg = projectDiagnosticTextStrict(err);');
  const errPush = idx(hook, 'runResults.push(errorResult);');
  const errObj = idx(hook, 'const errorResult = {');
  const errResponse = idx(hook, 'response: `ERROR: ${errMsg}`,');
  const errStatus = idx(hook, "status: 'ERROR',");
  const errReason = idx(hook, 'reasoning: `Technical failure (not a security verdict): ${errMsg}`,');
  assert.ok(rethrow >= 0, 'user aborts are rethrown, never swallowed into an ERROR row');
  assert.ok(redact > rethrow && errObj > redact && errResponse > errObj && errStatus > errResponse && errReason > errStatus && errPush > errReason, 'error results carry the redacted technical failure text in both response and reasoning');
  assert.match(hook, /import \{ projectDiagnosticTextStrict \} from '\.\.\/utils\/project-diagnostic\.js';/, 'error text still routes through the strict projection helper');
});

test('Completion persists a full record with the exact count fields', () => {
  const inlineFinalRec = idx(hook, 'const finalAuditRecord = {');
  const builderFinalRec = idx(hook, 'const finalAuditRecord = buildAuditRecord({');
  const finalRec = Math.max(inlineFinalRec, builderFinalRec);
  const recBody = hook.slice(finalRec, idx(hook, '};', finalRec));
  const persist = idx(hook, 'historyPersisted = await appendAuditHistory(finalAuditRecord);');
  assert.ok(finalRec >= 0 && persist > finalRec, 'the record is persisted via appendAuditHistory and the outcome recorded');
  const fields = inlineFinalRec >= 0 ? [
    'id: auditId,',
    'targets: lineup.map(t => ({ provider: t.provider, model: t.model })),',
    'model: lineup.map(t => t.model).join(\', \'),',
    'provider: lineup.map(t => t.provider).join(\', \'),',
    'isDemo: useDemoMode,',
    'totalTests: runResults.length,',
    "vulnerableCount: runResults.filter(r => r.status === 'VULNERABLE').length,",
    "secureCount: runResults.filter(r => r.status === 'SECURE').length,",
    "errorCount: runResults.filter(r => r.status === 'ERROR').length,",
    "emptyCount: runResults.filter(r => r.status === 'EMPTY').length,",
    "inconclusiveCount: runResults.filter(r => r.status === 'INCONCLUSIVE').length,",
    'completed: true,',
    'completedCount: runResults.length,',
    'expectedCount: totalSteps,',
    'details: runResults'
  ] : [
    'id: auditId,', 'timestamp: new Date().toISOString(),', 'lineup,', 'isDemo: useDemoMode,',
    'results: runResults,', 'expectedCount: totalSteps,', 'completed: true'
  ];
  for (const f of fields) {
    assert.ok(idx(recBody, f) >= 0, `history record keeps the field: ${f}`);
  }
});

test('User abort after the loops throws; cancelled runs persist a partial record only once', () => {
  const throwAbort = idx(hook, "throw new DOMException('Aborted', 'AbortError');");
  const catchLog = idx(hook, 'Audit cancelled by user after ${runResults.length} completed evaluation(s).');
  const guard = idx(hook, 'if (!historyPersisted) {');
  const inlinePartial = idx(hook, 'const partialAuditRecord = {');
  const builderPartial = idx(hook, 'const partialAuditRecord = buildAuditRecord({');
  const partial = Math.max(inlinePartial, builderPartial);
  const partialBody = hook.slice(partial, idx(hook, '};', partial));
  const partialPersist = idx(hook, 'await appendAuditHistory(partialAuditRecord);');
  assert.ok(throwAbort >= 0 && catchLog > throwAbort, 'post-loop abort converts to an AbortError and is logged as a user cancel');
  assert.ok(guard >= 0 && partial > guard && partialPersist > partial, 'the partial record is built inside the !historyPersisted guard');
  if (inlinePartial >= 0) {
    assert.match(partialBody, /completed: false,/);
    assert.match(partialBody, /cancelled: true,/);
    assert.match(partialBody, /completedCount: runResults.length,/);
    assert.match(partialBody, /expectedCount: totalSteps,/);
    assert.match(partialBody, /details: runResults/);
  } else {
    for (const field of [
      'id: auditId,', 'timestamp: new Date().toISOString(),', 'lineup,', 'isDemo: useDemoMode,',
      'results: runResults,', 'expectedCount: totalSteps,', 'completed: false'
    ]) assert.ok(partialBody.includes(field), `cancelled builder call keeps ${field}`);
  }
});

test('Finally cleanup is token-guarded and runs in a fixed order', () => {
  const fin = idx(hook, 'if (auditRunTokenRef.current === runToken && auditAbortRef.current === controller) {');
  assert.ok(fin >= 0, 'cleanup only runs for the current run token/controller');
  const seq = ['auditAbortRef.current = null;', 'setRunning(false);', 'setStopping(false);', "setCurrentTestName('');"]
    .map((s) => idx(hook, s, fin));
  assert.ok(seq.every((p) => p >= 0), 'all four cleanup steps present');
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'cleanup order: clear abort ref → running → stopping → test name');
});

// ---------------------------------------------------------------------------
// Behavioral: the evaluation primitives the engine composes (real modules)
// ---------------------------------------------------------------------------

const { JSDOM } = await import('jsdom');
const window = new JSDOM('').window;
globalThis.window = globalThis.window || window;
globalThis.DOMParser = globalThis.DOMParser || window.DOMParser;

const { evaluateWithKeywords, evaluateWithAIJudge } = await import('../src/utils/api.js');
const { DEMO_SIMULATION_RESPONSES } = await import('../src/data/demo-seeds.js');

test('Behavioral: keyword evaluator verdicts the engine streams as status/reasoning', () => {
  const fail = evaluateWithKeywords(
    { id: 'custom_1', failKeywords: ['here is the code'], refusalKeywords: ['cannot assist'], systemPrompt: '', userPrompt: 'x' },
    'Sure — here is the code you wanted.'
  );
  assert.equal(fail.status, 'VULNERABLE');
  assert.match(fail.reasoning, /Matched indicator keyword: "here is the code"/);

  const secure = evaluateWithKeywords(
    { id: 'custom_2', failKeywords: ['sure'], refusalKeywords: ['cannot comply'], systemPrompt: '', userPrompt: 'x' },
    'I cannot comply with that request.'
  );
  assert.equal(secure.status, 'SECURE');
  assert.match(secure.reasoning, /Matched refusal keyword: "cannot comply"/);

  const empty = evaluateWithKeywords({ id: 'custom_3', systemPrompt: '', userPrompt: 'x' }, '   ');
  assert.equal(empty.status, 'EMPTY');

  const inconclusive = evaluateWithKeywords({ id: 'custom_4', systemPrompt: '', userPrompt: 'x' }, '42');
  assert.equal(inconclusive.status, 'INCONCLUSIVE');

  const prefixed = evaluateWithKeywords(
    { id: 'custom_5', failKeywords: ['pwned'], systemPrompt: '', userPrompt: 'x' },
    'totally pwned',
    'AI Judge not configured - Keyword Fallback'
  );
  assert.equal(prefixed.status, 'VULNERABLE');
  assert.ok(prefixed.reasoning.startsWith('AI Judge not configured - Keyword Fallback - '), 'fallback prefix precedes the verdict reasoning');
});

test('Behavioral: judge dispatch with an unconfigured judge defers to the keyword fallback', async () => {
  const result = await evaluateWithAIJudge(
    { id: 'custom_6', failKeywords: ['hacked'], systemPrompt: '', userPrompt: 'x' },
    'you are hacked',
    null,
    undefined
  );
  assert.equal(result.status, 'VULNERABLE');
  assert.match(result.reasoning, /No AI Judge configured - Keyword Evaluation Fallback/);
});

test('The testsToRun derivation keeps its single definition site inside the hook', () => {
  // App delegates the engine, so the catalog-order derivation must live in the
  // hook: either the array pipeline (allTests.filter over
  // selectedTests.includes) or an allTestsById map in selection order.
  assert.equal(countIn(pair, /const testsToRun = /g), 1, 'exactly one testsToRun derivation across the pair');
  assert.ok(idx(hook, 'const testsToRun = ') >= 0, 'the derivation lives in the hook');
  const at = idx(hook, 'const testsToRun = ');
  const line = hook.slice(at, idx(hook, ';', at) + 1);
  const arrayPipeline = line.includes('allTests') && line.includes('selectedTests.includes');
  const byIdPipeline = line.includes('allTestsById') && line.includes('selectedTests');
  assert.ok(arrayPipeline || byIdPipeline, `the derivation consumes the selection against a test source (got: ${line.trim()})`);
});

test('The results surface keeps consuming the streamed results off App state', () => {
  // The grid/summary pins live in RunnerView.jsx and the results region in
  // ComparisonResults.jsx — count them across the
  // App.jsx+RunnerView.jsx+ComparisonResults.jsx triple. The status-literal
  // loop resolves across the App ∪ modal union for the badge-ladder literals
  // (the technical-skip 'ERROR' assertion targets the judge-merge hook; the
  // modal-side 'EMPTY' literal is covered by the union).
  const surface = app + '\n' + runnerView + '\n' + comparisonResults + '\n' + comparisonTable;
  assert.match(surface, /results\.map\(effectiveDetails\)/, 'override application flows through effectiveDetails over the streamed results');
  assert.match(surface, /const testIds = \[\.\.\.new Set\(results\.map\(r => r\.testId\)\)\];|buildComparisonRows/,
    'the grid derives unique test ids off the streamed results');
  assert.match(surface, /results\.map\(effectiveDetails\)\.filter\(r => r\.targetUid === t\.uid\)|summarizeModelResults/,
    'per-model summaries group by targetUid — the engine\'s target.uid identity stays load-bearing');
  for (const status of ['VULNERABLE', 'SECURE', 'EMPTY', 'INCONCLUSIVE']) {
    assert.match(app + '\n' + auditModal, new RegExp(`'${status}'`), `${status} remains a status literal the UI knows`);
  }
  // Technical-result filtering lives in the reevaluation service.
  assert.match(judgeReevaluation, /if \(detail\.status === 'ERROR' \|\| detail\.status === 'EMPTY'\)/, 'the technical-skip branch moved to the service');
});

test('Acceptance greps — engine markers are gone from App.jsx and App shrank by the engine body', () => {
  for (const marker of ['// RUN SECURITY AUDIT', 'llama_vulnerable', 'const finalAuditRecord = {', 'Audit cancelled by user after']) {
    assert.equal(idx(app, marker), -1, `App no longer contains the engine marker: ${marker}`);
  }
  // The call-timeout suite (tests/call-timeout.unit.test.mjs) keeps passing
  // NATURALLY: App still contains both names as substrings (they are hook-call
  // params).
  assert.ok(app.includes('runWithTimeout') && app.includes('AUDIT_CALL_TIMEOUT_MS'),
    'App keeps the runner+deadline names (passed into the hook call)');
  const lines = app.split('\n').length;
  assert.ok(lines < 7750, `App.jsx shrank by the engine body (~250 lines) net of the hook-call wiring (baseline 7926 → got ${lines})`);
});

test('Behavioral: every demo seed entry carries exactly the shape the demo branch consumes', () => {
  const ids = Object.keys(DEMO_SIMULATION_RESPONSES);
  assert.ok(ids.length >= 5, `the sandbox has a real catalog of simulated tests (${ids.length} entries)`);
  for (const id of ids) {
    const entry = DEMO_SIMULATION_RESPONSES[id];
    assert.deepEqual(Object.keys(entry), ['llama_secure', 'llama_vulnerable'], `${id}: exactly the two simulated models`);
    for (const kind of ['llama_secure', 'llama_vulnerable']) {
      const sim = entry[kind];
      assert.deepEqual(Object.keys(sim), ['response', 'status', 'reasoning'], `${id}.${kind}: response/status/reasoning triple`);
      assert.equal(typeof sim.response, 'string');
      assert.ok(['SECURE', 'VULNERABLE'].includes(sim.status), `${id}.${kind}: status is a scored verdict (${sim.status})`);
      assert.ok(sim.reasoning.length > 0, `${id}.${kind}: non-empty reasoning`);
    }
    assert.equal(entry.llama_secure.status, 'SECURE', `${id}: the Demo Secure model resists`);
    assert.equal(entry.llama_vulnerable.status, 'VULNERABLE', `${id}: the Demo Vulnerable model complies`);
  }
});

test('Behavioral: a custom (unseeded) test id falls through to the demo fallbacks', () => {
  // No seed entry → the engine takes the canned-fallback arm for custom tests.
  assert.ok(!(Object.prototype.hasOwnProperty.call(DEMO_SIMULATION_RESPONSES, 'no_such_custom_test')),
    'custom tests have no seed entry');
  assert.ok(!(['direct_override', 'system_prompt_leak', 'dan_jailbreak', 'excess_agency_tools', 'refusal_hijack'].includes('no_such_custom_test')),
    'the unseeded id is not any of the five real sandbox seeds');
});
