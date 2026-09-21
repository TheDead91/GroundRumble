import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMPT_REWRITE_TYPE,
  JUDGE_MERGE_TYPE,
  snapshotOperationIdentity,
  sameOperationIdentity,
  identityStaleness,
  judgeBasePrompt,
  judgeMergeIdentity,
} from '../src/utils/ai-operation-identity.js';

test('snapshotOperationIdentity freezes and normalizes its fields (no secrets, no whole-app state)', () => {
  const snap = snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_user', base: ' base ', companion: 'system', provider: 'p1', model: 'm1' });
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(snap.base, ' base ', 'base is preserved verbatim (identity, not normalization)');
  assert.equal(snap.companion, 'system');
  assert.equal(snap.provider, 'p1');
  assert.equal(snap.model, 'm1');
  // Nullish normalization: undefined/null collapse to '' / null without throwing.
  assert.equal(snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'k' }).base, '');
  assert.equal(snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'k', companion: null }).companion, null);
  assert.equal(snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'k', provider: null }).provider, '');
  assert.equal(snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'k', model: null }).model, '');
  assert.equal(snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'k', model: undefined }).model, '');
});

test('sameOperationIdentity is strict field equality across every identity-relevant dimension', () => {
  const a = snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p1', model: 'm1' });
  assert.equal(sameOperationIdentity(a, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p1', model: 'm1' })), true);
  for (const delta of [
    { type: JUDGE_MERGE_TYPE },
    { key: 'judge_user' },
    { base: 'B2' },
    { companion: 'x' },
    { provider: 'p2' },
    { model: 'm2' },
  ]) {
    assert.equal(sameOperationIdentity(a, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p1', model: 'm1', ...delta })), false, `a ${Object.keys(delta)[0]} change must invalidate the snapshot`);
  }
  assert.equal(sameOperationIdentity(a, null), false);
  assert.equal(sameOperationIdentity(null, a), false);
});

test('identityStaleness names the concrete identity dimension(s) that diverged', () => {
  const cand = snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p1', model: 'm1' });
  assert.equal(identityStaleness(cand, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p1', model: 'm1' })), '');
  assert.equal(identityStaleness(null, cand), 'its review operation is unavailable');
  assert.equal(identityStaleness(cand, null), 'its review operation is unavailable');
  assert.match(identityStaleness(cand, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_user', base: 'B', companion: null, provider: 'p1', model: 'm1' })), /target prompt changed/);
  assert.match(identityStaleness(cand, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B2', companion: null, provider: 'p1', model: 'm1' })), /modified after the rewrite started/);
  assert.match(identityStaleness(cand, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: 'X', provider: 'p1', model: 'm1' })), /companion Judge prompt changed/);
  assert.match(identityStaleness(cand, snapshotOperationIdentity({ type: PROMPT_REWRITE_TYPE, key: 'judge_system', base: 'B', companion: null, provider: 'p2', model: 'm2' })), /AI provider\/model changed/);
});

test('judgeBasePrompt mirrors getPrompt semantics: a non-blank string override wins, else the default', () => {
  assert.equal(judgeBasePrompt({ judge_system: 'OVERRIDE' }, 'DEFAULT'), 'OVERRIDE');
  assert.equal(judgeBasePrompt({ judge_system: '   ' }, 'DEFAULT'), 'DEFAULT', 'a blank override falls back to the default');
  assert.equal(judgeBasePrompt({ judge_system: 123 }, 'DEFAULT'), 'DEFAULT', 'a non-string override falls back to the default');
  assert.equal(judgeBasePrompt({}, 'DEFAULT'), 'DEFAULT');
  assert.equal(judgeBasePrompt(undefined, 'DEFAULT'), 'DEFAULT');
  assert.equal(judgeBasePrompt(null, 'DEFAULT'), 'DEFAULT');
});

test('judgeMergeIdentity targets judge_system with a null companion and the judge identity', () => {
  const snap = judgeMergeIdentity('BASE', { provider: 'p1', model: 'm1' });
  assert.deepEqual(snap, snapshotOperationIdentity({ type: JUDGE_MERGE_TYPE, key: 'judge_system', base: 'BASE', companion: null, provider: 'p1', model: 'm1' }));
  assert.deepEqual(judgeMergeIdentity('BASE', null), snapshotOperationIdentity({ type: JUDGE_MERGE_TYPE, key: 'judge_system', base: 'BASE', companion: null, provider: '', model: '' }));
});
