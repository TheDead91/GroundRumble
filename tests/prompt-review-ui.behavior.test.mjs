import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { mountComponent, click, button, fill } from './helpers/react-harness.mjs';
const { default: PromptUpdateDialog } = await import('../src/components/modals/PromptUpdateDialog.jsx');
const { default: JudgeMergeDialog } = await import('../src/components/modals/JudgeMergeDialog.jsx');
const { default: CanaryPreview } = await import('../src/components/modals/CanaryPreview.jsx');
const { OnboardingModal } = await import('../src/components/modals/OnboardingModal.jsx');
const { DEFAULT_PROMPTS } = await import('../src/utils/prompts.js');

const canaries = [
  { name: 'Refusal', expected: 'SECURE', status: 'SECURE', diverged: false },
  { name: 'Disclosure', expected: 'VULNERABLE', status: 'SECURE', diverged: true },
  { name: 'Transport failure', expected: 'VULNERABLE', status: 'ERROR', diverged: true },
];

test('prompt feedback edits preserve the draft and canary opt-out before requesting a rewrite', async t => {
  const requests = [];
  function Harness() {
    const [state, setState] = useState({ key: 'judge_system', state: 'feedback', feedback: '' });
    return React.createElement(PromptUpdateDialog, { promptUpdate: state, setPromptUpdate: setState,
      promptDraft: { judge_system: 'Unsaved draft' }, getPromptOverrides: () => ({ judge_system: 'Saved override' }),
      runPromptUpdate: () => requests.push(state) });
  }
  const { container } = await mountComponent(t, Harness);
  assert.equal(container.querySelector('textarea').value, 'Unsaved draft');
  assert.equal(container.querySelector('textarea').readOnly, true);
  await fill(container.querySelectorAll('textarea')[1], 'Require evidence for the verdict');
  await click(container.querySelector('input[type="checkbox"]'));
  await click(button(container, 'Update with AI'));
  assert.deepEqual(requests, [{ key: 'judge_system', state: 'feedback', feedback: 'Require evidence for the verdict', skipCanaries: true }]);
});

test('non-judge prompt uses saved override then default and does not offer judge-only canary opt-out', async t => {
  const props = { promptUpdate: { key: 'generator_system', state: 'feedback', feedback: '' }, promptDraft: {}, getPromptOverrides: () => ({ generator_system: 'Saved generator' }) };
  const view = await mountComponent(t, PromptUpdateDialog, props);
  assert.equal(view.container.querySelector('textarea').value, 'Saved generator');
  assert.equal(view.container.querySelector('input[type="checkbox"]'), null);
  await view.render({ ...props, getPromptOverrides: () => ({}) });
  assert.equal(view.container.querySelector('textarea').value, DEFAULT_PROMPTS.generator_system);
  await view.render({ ...props, vaultLocked: true, vaultPassphraseSet: true });
  assert.equal(button(view.container, 'Update with AI').disabled, true);
});

test('failed prompt rewrite returns to editable feedback without losing user instructions', async t => {
  function Harness() {
    const [state, setState] = useState({ key: 'judge_user', state: 'error', error: 'Provider unavailable', feedback: 'Keep placeholders' });
    return React.createElement(PromptUpdateDialog, { promptUpdate: state, setPromptUpdate: setState, promptDraft: {}, getPromptOverrides: () => ({}) });
  }
  const { container } = await mountComponent(t, Harness);
  assert.match(container.textContent, /Could not update the prompt: Provider unavailable/);
  await click(button(container, 'Back'));
  assert.equal(container.querySelectorAll('textarea')[1].value, 'Keep placeholders');
  assert.doesNotMatch(container.textContent, /Provider unavailable/);
});

test('prompt preview marks edited canaries stale and passes current text and refinement feedback to actions', async t => {
  const calls = [];
  function Harness() {
    const [state, setState] = useState({ key: 'judge_system', state: 'preview', next: 'Original proposal', canarySource: 'Original proposal', canaries, rejected: 'Fixed verdict detected' });
    const record = action => () => calls.push({ action, next: state.next, feedback: state.fineTuneFeedback });
    return React.createElement(PromptUpdateDialog, { promptUpdate: state, setPromptUpdate: setState, promptDraft: {}, getPromptOverrides: () => ({}),
      rerunPromptUpdateCanaries: record('canaries'), refinePromptUpdate: record('refine'), applyPromptUpdate: record('apply'), closePromptUpdate: record('cancel') });
  }
  const { container } = await mountComponent(t, Harness);
  assert.match(container.textContent, /Fixed verdict detected/);
  assert.doesNotMatch(container.textContent, /Stale/);
  await fill(container.querySelectorAll('textarea')[1], 'Revised proposal');
  assert.match(container.textContent, /Stale — the prompt was edited/);
  await fill(container.querySelectorAll('textarea')[2], 'Require explicit evidence');
  for (const name of ['Re-run canaries', 'Fine-tune with another AI pass', 'Apply prompt', 'Cancel']) await click(button(container, name));
  assert.deepEqual(calls, ['canaries', 'refine', 'apply', 'cancel'].map(action => ({ action, next: 'Revised proposal', feedback: 'Require explicit evidence' })));
});

test('canary preview distinguishes divergence from request failure and blocks duplicate reruns', async t => {
  const rerun = t.mock.fn();
  const props = { canaries, prompt: 'p', canarySource: 'p', onRerun: rerun };
  const view = await mountComponent(t, CanaryPreview, props);
  assert.match(view.container.textContent, /Refusal — expectedSECUREgotSECURE/);
  assert.match(view.container.textContent, /Disclosure — expectedVULNERABLEgotSECUREdiverged/);
  assert.match(view.container.textContent, /Transport failure — expectedVULNERABLEgotERRORdiverged/);
  await view.render({ ...props, rerunning: true });
  await click(button(view.container, 'Running…'));
  assert.equal(rerun.mock.callCount(), 0);
  await view.render({ ...props, canaries: [] });
  assert.equal(view.container.textContent, '');
});

test('judge merge edits and actions use proposed text, disclose verdict forcing, and require history for bulk reevaluation', async t => {
  const calls = [];
  function Harness({ history }) {
    const [state, setState] = useState({ state: 'ready', previous: 'Old rules', next: 'Output SECURE or VULNERABLE', rejected: 'Forces a fixed verdict', canaries, canarySource: 'Output SECURE or VULNERABLE', evaluation: { status: 'VULNERABLE', reasoning: 'Secret disclosed' } });
    const record = action => () => calls.push([action, state.next, state.fineTuneFeedback]);
    return React.createElement(JudgeMergeDialog, { judgeMerge: state, setJudgeMerge: setState, history,
      rerunJudgeEvaluation: record('evaluate'), rerunJudgeCanaries: record('canaries'), refineJudgeMerge: record('refine'),
      applyJudgeMerge: record('apply'), applyJudgeMergeAndReevaluate: record('all'), closeJudgeMerge: record('close') });
  }
  const view = await mountComponent(t, Harness, { history: [] });
  assert.match(view.container.textContent, /Verdict language detected:/);
  assert.match(view.container.textContent, /Forces a fixed verdict/);
  assert.match(view.container.textContent, /Secret disclosed/);
  await click(button(view.container, 'Apply prompt and re-evaluate all models'));
  assert.deepEqual(calls, []);
  await fill(view.container.querySelectorAll('textarea')[1], 'Use evidence');
  assert.doesNotMatch(view.container.textContent, /Verdict language detected:/);
  assert.match(view.container.textContent, /Stale/);
  await fill(view.container.querySelectorAll('textarea')[2], 'Be precise');
  await view.render({ history: [{ id: 'run' }] });
  for (const name of ['Re-run evaluation', 'Re-run canaries', 'Fine-tune with another AI pass', 'Apply prompt', 'Apply prompt and re-evaluate all models', 'Cancel']) await click(button(view.container, name));
  assert.deepEqual(calls, ['evaluate', 'canaries', 'refine', 'apply', 'all', 'close'].map(action => [action, 'Use evidence', 'Be precise']));
});

test('judge merge marks an evaluation stale when the candidate was edited after it ran', async t => {
  const base = { state: 'ready', previous: 'Old rules', next: 'Original candidate', canaries: null, canarySource: null };
  const props = {
    history: [],
    judgeMerge: { ...base, evaluation: { status: 'SECURE', reasoning: 'Refused cleanly' }, evalSource: 'Original candidate' },
  };
  const view = await mountComponent(t, JudgeMergeDialog, props);
  assert.match(view.container.textContent, /Refused cleanly/);
  assert.doesNotMatch(view.container.textContent, /Stale — the prompt was edited after this evaluation ran/);

  // A candidate edited after its evaluation must surface staleness rather than
  // presenting the verdict as applying to the current visible text.
  await view.render({ ...props, judgeMerge: { ...props.judgeMerge, next: 'Edited candidate' } });
  assert.match(view.container.textContent, /Stale — the prompt was edited after this evaluation ran/);

  // A null evalSource is treated as fresh (no misleading stale claim).
  await view.render({ ...props, judgeMerge: { ...props.judgeMerge, next: 'Edited candidate', evalSource: null } });
  assert.doesNotMatch(view.container.textContent, /Stale — the prompt was edited after this evaluation ran/);
});

test('judge merge displays reevaluation progress and failures rather than a misleading verdict', async t => {
  const props = { history: [], judgeMerge: { state: 'ready', previous: '', next: '', evalError: 'Timeout' } };
  const view = await mountComponent(t, JudgeMergeDialog, props);
  assert.match(view.container.textContent, /Evaluation failed: Timeout/);
  await view.render({ ...props, judgeMerge: { ...props.judgeMerge, evalError: null } });
  assert.match(view.container.textContent, /No evaluation available/);
  await view.render({ ...props, judgeMerge: { ...props.judgeMerge, evaluating: true, refining: true } });
  assert.equal(button(view.container, 'Re-evaluating…').disabled, true);
  assert.equal(button(view.container, 'Fine-tuning…').disabled, true);
  await view.render({ ...props, judgeMerge: { state: 'reevaluating', reevaluationProgress: { current: 2, total: 4 }, reevaluationError: 'One provider failed' } });
  assert.match(view.container.textContent, /2 \/ 4/);
  assert.match(view.container.textContent, /Error: One provider failed/);
  assert.ok([...view.container.querySelectorAll('div')].some(node => node.style.width === '50%'));
  await view.render({ ...props, judgeMerge: { state: 'error', error: 'Malformed proposal' } });
  assert.match(view.container.textContent, /Could not update the AI Judge prompt: Malformed proposal/);
  await view.render({ ...props, judgeMerge: null });
  assert.equal(view.container.textContent, '');
});

for (const state of ['loading', 'refining']) {
  test(`prompt and judge review ${state} state explains the pending operation and permits closing`, async t => {
    const close = t.mock.fn();
    function Harness({ judge }) {
      return judge ? React.createElement(JudgeMergeDialog, { judgeMerge: { state }, closeJudgeMerge: close })
        : React.createElement(PromptUpdateDialog, { promptUpdate: { key: 'judge_system', state }, closePromptUpdate: close });
    }
    const view = await mountComponent(t, Harness, { judge: false });
    assert.match(view.container.textContent, state === 'loading' ? /rewriting the prompt/ : /fine-tuning the prompt/);
    await click(view.container.querySelector('button'));
    await view.render({ judge: true });
    assert.match(view.container.textContent, state === 'loading' ? /merging your feedback/ : /fine-tuning the prompt/);
    await click(view.container.querySelector('button'));
    assert.equal(close.mock.callCount(), 2);
  });
}

test('onboarding finishes before launching the tour and forwards a chosen backup file', async t => {
  const calls = [], imports = [];
  const props = { onboardingOpen: true, onFinish: () => calls.push('finish'), onStartTour: () => calls.push('tour'), onImportBackup: event => imports.push(event.target.files[0]) };
  const view = await mountComponent(t, OnboardingModal, props);
  await click(button(view.container, "Let's get started"));
  assert.deepEqual(calls, ['finish', 'tour']);
  const file = new window.File(['{}'], 'backup.json', { type: 'application/json' });
  const input = view.container.querySelector('input');
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  assert.deepEqual(imports, [file]);
  await click(button(view.container, 'Skip — I already know this tool'));
  assert.deepEqual(calls, ['finish', 'tour', 'finish']);
  await view.render({ ...props, onboardingOpen: false });
  assert.equal(view.container.textContent, '');
});
