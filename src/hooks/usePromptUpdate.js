// usePromptUpdate — the "Update with AI" prompt flow.
// The hook owns the promptUpdate dialog state machine (feedback/
// loading/preview/refining/error) plus the four ops: apply (apply gate +
// draft sync), canary rerun (stale-canary bookkeeping), the merge pass
// (judge_system/judge_user canary injection, skipCanaries branch) and the
// fine-tune pipeline. Providers come from context; deps ride the parameter bag.
//
// Every later-applicable candidate is bound to an immutable operation snapshot
// (target key, base text, companion Judge prompt, provider and model) plus a
// monotonic in-flight operation id. Late results cannot replace a newer
// candidate, a candidate whose identity-relevant state changed is rejected at
// the persistence boundary, and persistence failure is never reported as
// success.
import { useRef, useState } from 'react';
import { useProviders } from '../context/ProvidersContext';
import { mergePromptWithAI } from '../utils/prompts';
import { runJudgeCanaries } from '../utils/judge-canaries';
import { redactSensitiveText } from '../utils/redact';
import { PROMPT_REWRITE_TYPE, snapshotOperationIdentity, sameOperationIdentity } from '../utils/ai-operation-identity';

export function usePromptUpdate({ buildJudge, judgeConfig, getPrompt, setPrompt, setPromptDraft, confirmJudgeRewriteApply, addToast }) {
  const { providers } = useProviders();

  // "Update with AI" dialog for any AI prompt: feed feedback, have the
  // configured model rewrite the prompt, then review + apply.
  // state: 'feedback' | 'loading' | 'preview' | 'refining' | 'error'.
  const [promptUpdate, setPromptUpdate] = useState(null);
  // Monotonic in-flight operation id: a late async result may only commit when
  // it is still the operation the dialog is reviewing.
  const opSeq = useRef(0);

  const closePromptUpdate = () => setPromptUpdate(null);
  const applyPromptUpdate = async () => {
    if (!promptUpdate) return;
    const next = (promptUpdate.next || '').trim();
    if (!next) { addToast('The prompt cannot be empty.'); return; }
    // Apply-time identity enforcement: the persisted prompt may only be written
    // when the candidate still belongs to the live operation (same key/base/
    // companion/provider/model). A changed target or AI configuration stales
    // the candidate and blocks the write independent of any button state.
    const judge = buildJudge(judgeConfig, providers);
    const current = snapshotOperationIdentity({
      type: PROMPT_REWRITE_TYPE,
      key: promptUpdate.key,
      base: getPrompt(promptUpdate.key),
      companion: promptUpdate.key === 'judge_user' ? getPrompt('judge_system') : null,
      provider: judge ? judge.provider : '',
      model: judge ? judge.model : '',
    });
    if (!sameOperationIdentity(promptUpdate.snapshot, current)) {
      addToast('This update is stale — the prompt or AI configuration changed after it was generated. Re-run the update to review fresh results.', 'error');
      return;
    }
    // Require an explicit confirmation when the canary
    // preview diverged or went stale, so a judge rewrite cannot skew verdict
    // semantics silently.
    if (!(await confirmJudgeRewriteApply(next, promptUpdate.canaries, promptUpdate.canarySource))) return;
    if (!setPrompt(promptUpdate.key, next)) {
      addToast('The prompt could not be saved.', 'error');
      return;
    }
    setPromptDraft(prev => ({ ...prev, [promptUpdate.key]: next }));
    setPromptUpdate(null);
    addToast('Prompt updated with your feedback.', 'success');
  };
  // Re-run the canary preview against the (possibly edited) prompt text.
  const rerunPromptUpdateCanaries = async () => {
    if (!promptUpdate || promptUpdate.rerunning) return;
    const judge = buildJudge(judgeConfig, providers);
    if (!judge) { addToast('No AI Judge configured.'); return; }
    if (promptUpdate.snapshot && !(promptUpdate.snapshot.provider === judge.provider && promptUpdate.snapshot.model === judge.model)) {
      addToast('The AI configuration changed — re-run the update to review fresh results.', 'error');
      return;
    }
    setPromptUpdate(prev => prev ? { ...prev, rerunning: true } : prev);
    const canaries = promptUpdate.key === 'judge_user'
      ? await runJudgeCanaries(judge, getPrompt('judge_system'), promptUpdate.next)
      : await runJudgeCanaries(judge, promptUpdate.next);
    setPromptUpdate(prev => prev ? { ...prev, rerunning: false, canaries, canarySource: promptUpdate.next } : prev);
  };
  const runPromptUpdate = async () => {
    if (!promptUpdate || promptUpdate.state === 'loading') return;
    const judge = buildJudge(judgeConfig, providers);
    if (!judge) { addToast('No AI model configured — set the AI Judge (or Test Generator) in Settings first.'); return; }
    const feedback = (promptUpdate.feedback || '').trim();
    if (!feedback) { addToast('Write some feedback first.'); return; }
    const key = promptUpdate.key;
    const skipCanaries = promptUpdate.skipCanaries === true;
    opSeq.current += 1;
    const opId = opSeq.current;
    const snapshot = snapshotOperationIdentity({
      type: PROMPT_REWRITE_TYPE,
      key,
      base: getPrompt(key),
      companion: key === 'judge_user' ? getPrompt('judge_system') : null,
      provider: judge.provider,
      model: judge.model,
    });
    setPromptUpdate(prev => prev ? { ...prev, state: 'loading', opId, snapshot } : prev);
    try {
      const result = await mergePromptWithAI(judge, key, feedback);
      // Run the adversarial canaries for BOTH user-owned judge keys
      // (judge_system and judge_user) — a verdict-forcing or subtly biased
      // rewrite diverges visibly instead of silently skewing every verdict.
      // For judge_user the candidate is injected as the user template (with the
      // current judge_system as the system prompt) so it is exercised in the
      // position it will actually occupy. The user may opt out of the preview
      // via the "Skip canary preview" checkbox; without results there is no apply-time check.
      let canaries = null;
      if (!skipCanaries) {
        if (key === 'judge_system') {
          canaries = await runJudgeCanaries(judge, result.prompt);
        } else if (key === 'judge_user') {
          canaries = await runJudgeCanaries(judge, getPrompt('judge_system'), result.prompt);
        }
      }
      setPromptUpdate(prev => (prev && prev.opId === opId) ? { ...prev, state: 'preview', next: result.prompt, rejected: result.rejected || null, canaries, canarySource: result.prompt } : prev);
    } catch (err) {
      setPromptUpdate(prev => (prev && prev.opId === opId) ? { ...prev, state: 'error', error: redactSensitiveText(err?.message || '') } : prev);
    }
  };
  // Fine-tune the current preview with another AI pass based on additional
  // feedback, mirroring the Test Generator wizard's refine step. Runs the same
  // merge/validation pipeline as the first pass; canaries are refreshed unless
  // the user chose to skip them. The refined candidate (with its canaries) is
  // only revealed once the full pass completes, so Apply is never offered for
  // an unvalidated candidate mid-flight.
  const refinePromptUpdate = async () => {
    if (!promptUpdate || promptUpdate.refining) return;
    const judge = buildJudge(judgeConfig, providers);
    if (!judge) { addToast('No AI model configured.'); return; }
    const fineTune = (promptUpdate.fineTuneFeedback || '').trim();
    if (!fineTune) { addToast('Enter fine-tuning instructions.'); return; }
    const key = promptUpdate.key;
    const feedback = promptUpdate.feedback || '';
    const skipCanaries = promptUpdate.skipCanaries === true;
    opSeq.current += 1;
    const opId = opSeq.current;
    const snapshot = snapshotOperationIdentity({
      type: PROMPT_REWRITE_TYPE,
      key,
      base: getPrompt(key),
      companion: key === 'judge_user' ? getPrompt('judge_system') : null,
      provider: judge.provider,
      model: judge.model,
    });
    setPromptUpdate(prev => prev ? { ...prev, state: 'refining', refining: true, opId, snapshot } : prev);
    try {
      const combinedFeedback = `${feedback}\n\nAdditional fine-tuning: ${fineTune}`;
      const result = await mergePromptWithAI(judge, key, combinedFeedback);
      let canaries = null;
      let canarySource = null;
      if (!skipCanaries && (key === 'judge_system' || key === 'judge_user')) {
        if (key === 'judge_user') {
          canaries = await runJudgeCanaries(judge, getPrompt('judge_system'), result.prompt);
        } else {
          canaries = await runJudgeCanaries(judge, result.prompt);
        }
        canarySource = result.prompt;
      }
      setPromptUpdate(prev => (prev && prev.opId === opId) ? {
        ...prev,
        state: 'preview',
        refining: false,
        next: result.prompt,
        rejected: result.rejected || null,
        canaries,
        canarySource,
        fineTuneFeedback: ''
      } : prev);
    } catch (err) {
      setPromptUpdate(prev => (prev && prev.opId === opId) ? { ...prev, state: 'preview', refining: false, error: redactSensitiveText(err?.message || '') } : prev);
    }
  };

  return { promptUpdate, setPromptUpdate, closePromptUpdate, applyPromptUpdate, rerunPromptUpdateCanaries, runPromptUpdate, refinePromptUpdate };
}
