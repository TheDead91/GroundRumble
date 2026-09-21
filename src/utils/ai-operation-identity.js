// Immutable operation-identity snapshots for later-applicable AI review
// candidates (prompt rewrites and Judge prompt improvements). A candidate is
// bound to the exact semantic operation that produced it so a stale or
// differently-configured result can never gain persistence/control authority
// under a review that does not correspond to the operation that produced it.
//
// Deterministic, semantic-only equality. No secrets, no whole-app state, no
// hashing-as-authentication. A structured frozen snapshot is the identity.
//
// Fields:
//   type      — operation class ('prompt-rewrite' | 'judge-merge').
//   key       — the persisted prompt key the candidate targets.
//   base      — the prompt text the rewrite started from (the merge's "current").
//   companion — for judge_user rewrites, the judge_system text its canaries ran
//               against (null elsewhere).
//   provider  — the AI provider id that produced the candidate.
//   model     — the AI model id that produced the candidate.

export const PROMPT_REWRITE_TYPE = 'prompt-rewrite';
export const JUDGE_MERGE_TYPE = 'judge-merge';

export const snapshotOperationIdentity = ({ type, key, base, companion = null, provider = '', model = '' }) =>
  Object.freeze({
    type,
    key,
    base: String(base ?? ''),
    companion: companion == null ? null : String(companion),
    provider: String(provider ?? ''),
    model: String(model ?? ''),
  });

// Effective base prompt for the Judge merge flow, mirroring getPrompt('judge_system'):
// a non-blank string override wins, otherwise the shipped default.
export const judgeBasePrompt = (overrides, defaultJudgeSystem) => {
  const override = overrides && overrides.judge_system;
  return (typeof override === 'string' && override.trim()) ? override : defaultJudgeSystem;
};

// Identity snapshot for a Judge prompt merge/improvement candidate.
export const judgeMergeIdentity = (base, judge) =>
  snapshotOperationIdentity({
    type: JUDGE_MERGE_TYPE,
    key: 'judge_system',
    base,
    companion: null,
    provider: judge ? judge.provider : '',
    model: judge ? judge.model : '',
  });

export const sameOperationIdentity = (a, b) =>
  a != null &&
  b != null &&
  a.type === b.type &&
  a.key === b.key &&
  a.base === b.base &&
  a.companion === b.companion &&
  a.provider === b.provider &&
  a.model === b.model;

// Human-readable reason(s) a candidate snapshot is no longer current, or an
// empty string when the snapshot still matches live state. Used for toasts.
export const identityStaleness = (candidate, current) => {
  if (!candidate || !current) return 'its review operation is unavailable';
  const reasons = [];
  if (candidate.key !== current.key) reasons.push('the target prompt changed');
  if (candidate.base !== current.base) reasons.push('the prompt was modified after the rewrite started');
  if (candidate.companion !== current.companion) reasons.push('the companion Judge prompt changed');
  if (candidate.provider !== current.provider || candidate.model !== current.model) reasons.push('the AI provider/model changed');
  return reasons.join('; ');
};
