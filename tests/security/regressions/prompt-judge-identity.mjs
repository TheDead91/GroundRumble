// Prompt/Judge rewrite review candidates must never gain persistence/control
// authority outside the exact semantic operation that produced and reviewed
// them.
//
// Proves, deterministically with in-process
// stubs and NO external traffic (global fetch is never defined/never called):
//   1. a late in-flight result cannot replace a newer operation (opId);
//   2. a candidate whose base prompt changed is rejected as stale at Apply;
//   3. a candidate whose provider/model changed is rejected as stale at Apply;
//   4. a result for a different target key is rejected as stale at Apply;
//   5. persistence failure never reports success and keeps the dialog open;
//   6. apply-and-reevaluate never re-evaluates with a prompt that was not saved;
//   7. canaries cannot be re-run (or authorized) under a changed AI config;
//   8. an unchanged valid candidate still persists (no unnecessary invalidation);
//   9. the identity snapshot is semantic, frozen, and free of secrets/whole-app state.
//
// The hook bodies are compiled from the real production source (same mechanics
// as the durable unit suites) so the races above exercise production control
// flow, not a re-implementation. Harmless sentinels only; reserved example hosts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROMPT_REWRITE_TYPE,
  JUDGE_MERGE_TYPE,
  snapshotOperationIdentity,
  sameOperationIdentity,
  judgeBasePrompt,
  judgeMergeIdentity,
} from '../../../src/utils/ai-operation-identity.js';
import { judgeRewriteApplyGate } from '../../../src/utils/ai-judge.js';
import { setPrompt, resetPrompt } from '../../../src/utils/prompts.js';

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PROMPT_HOOK = readSrc('../../../src/hooks/usePromptUpdate.js');
const MERGE_HOOK = readSrc('../../../src/hooks/useJudgeMerge.js');

// --- compile harness (same mechanics as the durable unit suites) ------------
function extractMember(source, name) {
  const declRe = new RegExp(`^  const ${name} = `, 'm');
  const m = declRe.exec(source);
  assert.ok(m, `member ${name} not found`);
  const lines = source.slice(m.index).split('\n');
  const first = lines[0];
  if (/;\s*$/.test(first)) return first;
  const buf = [first];
  const nextDecl = /^  (const \w+ = |useEffect\(|function )/;
  for (let i = 1; i < lines.length; i++) {
    if (i > 1 && nextDecl.test(lines[i])) assert.fail(`member ${name} never closed`);
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

const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

const JUDGE = { provider: 'p1', model: 'm1', apiKey: 'sk-sentinel', endpoint: 'https://judge.example/v1', rpm: 0 };

const CANARY_OK = [{ name: 'Secure refusal', expected: 'SECURE', status: 'SECURE', reasoning: 'refused', diverged: false }];
const CANARY_DIVERGED = [{ name: 'Secure refusal', expected: 'SECURE', status: 'VULNERABLE', reasoning: 'leaked', diverged: true }];

const basePromptEnv = (over = {}) => {
  const calls = [];
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const env = {};
  let update = over.initialPromptUpdate ?? null;
  Object.defineProperty(env, 'promptUpdate', { enumerable: true, get: () => update });
  env.setPromptUpdate = (v) => { update = typeof v === 'function' ? v(update) : v; calls.push(['setPromptUpdate', update === null ? null : structuredClone(update)]); };
  env.__calls = calls;
  env.__getPrompt = over.__getPrompt ?? ((key) => `PROMPT:${key}`);
  const collab = {
    addToast: record('addToast'),
    setPrompt: (k, v) => { record('setPrompt')(k, v); return over.__setPromptResult ?? true; },
    setPromptDraft: () => {},
    getPrompt: (key) => { record('getPrompt')(key); return env.__getPrompt(key); },
    getPromptOverrides: () => (over.__getPromptOverrides ? over.__getPromptOverrides() : {}),
    buildJudge: over.__buildJudge ?? (() => JUDGE),
    judgeConfig: { provider: 'p1', model: 'm1' },
    providers: [{ id: 'p1', enabled: true }],
    mergePromptWithAI: over.__mergePromptWithAI ?? (async () => ({ prompt: 'REWRITTEN', rejected: null })),
    runJudgeCanaries: over.__runJudgeCanaries ?? (async () => CANARY_OK),
    confirmJudgeRewriteApply: over.__confirmJudgeRewriteApply ?? (async () => true),
    redactSensitiveText: (s) => String(s ?? ''),
    snapshotOperationIdentity,
    sameOperationIdentity,
    PROMPT_REWRITE_TYPE,
    opSeq: { current: 0 },
  };
  Object.assign(env, collab, over);
  return env;
};

const baseMergeEnv = (over = {}) => {
  const calls = [];
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const env = {};
  let merge = over.initialMerge ?? null;
  Object.defineProperty(env, 'judgeMerge', { enumerable: true, get: () => merge });
  env.setJudgeMerge = (v) => { merge = typeof v === 'function' ? v(merge) : v; calls.push(['setJudgeMerge', structuredClone(merge)]); };
  env.__calls = calls;
  const collab = {
    addToast: record('addToast'),
    askConfirm: async () => true,
    confirmJudgeRewriteApply: async () => true,
    getPromptOverrides: () => (over.__getPromptOverrides ? over.__getPromptOverrides() : {}),
    replaceAuditHistory: async () => true,
    allTestsById: {},
    historyRef: { current: [] },
    buildJudge: over.__buildJudge ?? (() => JUDGE),
    judgeConfig: { provider: 'p1', model: 'm1' },
    providers: [{ id: 'p1', enabled: true }],
    mergeJudgeFeedback: over.__mergeJudgeFeedback ?? (async () => ({ prompt: 'REWRITTEN', rejected: null })),
    evaluateWithAIJudgePrompt: async () => ({ status: 'SECURE', reasoning: 'evaluated' }),
    runJudgeCanaries: over.__runJudgeCanaries ?? (async () => CANARY_OK),
    setPrompt: (k, v) => { record('setPrompt')(k, v); return over.__setPromptResult ?? true; },
    judgeRewriteApplyGate,
    redactSensitiveText: (s) => String(s ?? ''),
    judgeMergeIdentity,
    judgeBasePrompt,
    sameOperationIdentity,
    opSeq: { current: 0 },
    DEFAULT_PROMPTS: { judge_system: 'DEFAULT_JUDGE_SYSTEM' },
  };
  Object.assign(env, collab, over);
  return env;
};

const named = (rec, name) => rec.filter(([n]) => n === name).map(([, ...a]) => a);

// --- 1: pure identity semantics --------------------------------------------

test('an identity snapshot is frozen, semantic, and secret-free', () => {
  const snap = snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'BASE', companion: null, provider: 'p1', model: 'm1' });
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(JSON.stringify(snap).includes('apiKey'), false);
  assert.equal(snap.base, 'BASE');
  assert.equal(sameOperationIdentity(snap, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'BASE', companion: null, provider: 'p1', model: 'm1' })), true);
  assert.equal(sameOperationIdentity(snap, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'BASE2', companion: null, provider: 'p1', model: 'm1' })), false);
  assert.equal(sameOperationIdentity(snap, snapshotOperationIdentity({ type: JUDGE_MERGE_TYPE, key: 'judge_system', base: 'BASE', companion: null, provider: 'p1', model: 'm1' })), false, 'operation type is part of identity');
});

// --- 2: in-flight supersession (prompt hook) --------------------------------

test('a late in-flight prompt rewrite cannot replace a newer operation', async () => {
  const dA = deferred();
  const dB = deferred();
  const queue = [dA, dB];
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'feedback', feedback: 'A', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' },
    __mergePromptWithAI: async () => (queue.shift() || deferred()).promise,
  });
  const runOp = compileMember(PROMPT_HOOK, 'runPromptUpdate', env);

  const pa = runOp();
  env.setPromptUpdate({ key: 'generator_system', state: 'feedback', feedback: 'B', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' });
  const pb = runOp();

  dB.resolve({ prompt: 'B_RESULT', rejected: null });
  await pb;
  dA.resolve({ prompt: 'A_RESULT', rejected: null });
  await pa;

  assert.equal(env.promptUpdate.key, 'generator_system');
  assert.equal(env.promptUpdate.next, 'B_RESULT', 'A must not replace B');
});

test('a late in-flight Judge merge cannot replace a newer merge', async () => {
  const dA = deferred();
  const dB = deferred();
  const queue = [dA, dB];
  const env = baseMergeEnv({ __mergeJudgeFeedback: async () => (queue.shift() || deferred()).promise });
  const open = compileMember(MERGE_HOOK, 'openMergeWithFeedback', env);

  const pa = open({ testId: 'a', testName: 'A', techniqueName: 'T', techniqueId: 'I', systemPrompt: '', userPrompt: '', response: 'resp-a' }, 'feedback-a');
  const pb = open({ testId: 'b', testName: 'B', techniqueName: 'T', techniqueId: 'I', systemPrompt: '', userPrompt: '', response: 'resp-b' }, 'feedback-b');

  dB.resolve({ prompt: 'B_RESULT', rejected: null });
  await pb;
  dA.resolve({ prompt: 'A_RESULT', rejected: null });
  await pa;

  assert.equal(env.judgeMerge.next, 'B_RESULT', 'A must not replace B');
  assert.equal(env.judgeMerge.feedback, 'feedback-b');
});

// --- 3: post-result staleness + apply-time enforcement ----------------------

test('a base-prompt change stales the candidate and blocks Apply', async () => {
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'PROMPT:judge_system', companion: null, provider: 'p1', model: 'm1' }) },
    __getPrompt: () => 'CHANGED BASE',
  });
  await compileMember(PROMPT_HOOK, 'applyPromptUpdate', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), []);
  assert.deepEqual(named(env.__calls, 'addToast'), [['This update is stale — the prompt or AI configuration changed after it was generated. Re-run the update to review fresh results.', 'error']]);
});

test('a provider/model change stales the candidate and blocks Apply', async () => {
  const env = baseMergeEnv({
    initialMerge: { next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: judgeMergeIdentity('DEFAULT_JUDGE_SYSTEM', JUDGE) },
    __buildJudge: () => ({ provider: 'p2', model: 'm2', apiKey: 'sk-sentinel', endpoint: 'https://judge.example/v1', rpm: 0 }),
  });
  await compileMember(MERGE_HOOK, 'applyJudgeMerge', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), []);
  assert.equal(named(env.__calls, 'addToast').length, 1);
});

test('a result for a different target key is rejected as stale', async () => {
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'generator_system', base: 'PROMPT:judge_system', companion: null, provider: 'p1', model: 'm1' }) },
  });
  await compileMember(PROMPT_HOOK, 'applyPromptUpdate', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), []);
});

// --- 4: persistence failure --------------------------------------------------

test('persistence failure never reports success and keeps the dialog open', async () => {
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'PROMPT:judge_system', companion: null, provider: 'p1', model: 'm1' }) },
    __setPromptResult: false,
  });
  await compileMember(PROMPT_HOOK, 'applyPromptUpdate', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']]);
  assert.deepEqual(named(env.__calls, 'addToast'), [['The prompt could not be saved.', 'error']]);
});

test('apply-and-reevaluate aborts when the prompt was not persisted', async () => {
  const env = baseMergeEnv({
    historyRef: { current: [{ id: 'aud', details: [{ testId: 't1', status: 'VULNERABLE', reasoning: 'old', response: 'resp' }] }] },
    initialMerge: { next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: judgeMergeIdentity('DEFAULT_JUDGE_SYSTEM', JUDGE) },
    __setPromptResult: false,
  });
  await compileMember(MERGE_HOOK, 'applyJudgeMergeAndReevaluate', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']]);
  assert.deepEqual(named(env.__calls, 'addToast'), [['The prompt could not be saved.', 'error']]);
});

test('setPrompt itself reports a storage failure', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
    clear: () => {},
  };
  assert.equal(setPrompt('judge_system', 'X'), false, 'a swallowed storage failure must surface as false');
  resetPrompt('judge_system');
});

// --- 5: canary identity + no unnecessary invalidation -----------------------

test('canaries cannot be re-run under a changed AI config', async () => {
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'preview', next: 'text', snapshot: snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'PROMPT:judge_system', companion: null, provider: 'p1', model: 'm1' }) },
    __buildJudge: () => ({ provider: 'p2', model: 'm2', apiKey: 'sk-sentinel', endpoint: 'https://judge.example/v1', rpm: 0 }),
  });
  await compileMember(PROMPT_HOOK, 'rerunPromptUpdateCanaries', env)();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), []);
  assert.deepEqual(named(env.__calls, 'addToast'), [['The AI configuration changed — re-run the update to review fresh results.', 'error']]);
});

test('an unchanged valid candidate still persists (no unnecessary invalidation)', async () => {
  const env = basePromptEnv({
    initialPromptUpdate: { key: 'judge_system', state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'PROMPT:judge_system', companion: null, provider: 'p1', model: 'm1' }) },
  });
  await compileMember(PROMPT_HOOK, 'applyPromptUpdate', env)();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']]);
});

test('the canary gate still requires confirmation for stale/diverged text', () => {
  assert.deepEqual(judgeRewriteApplyGate('edited', CANARY_DIVERGED, 'original').needsConfirm, true);
  assert.deepEqual(judgeRewriteApplyGate('same', CANARY_OK, 'same'), { needsConfirm: false, problems: [] });
});
