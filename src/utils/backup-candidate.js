// Backup restore candidate — immutable snapshot with exact security-sensitive diff.
//
// Establishes candidate identity: the reviewed artifact exactly identifies all
// prompt values, deletions, default restorations, and test verdict criteria that
// become active. Review and Apply operate on the same immutable candidate, not
// independently reparsed state.

import { DEFAULT_PROMPTS } from './prompt-catalog.js';

/**
 * Build an immutable restore candidate from a validated opened backup bundle.
 * Returns { normalizedBackup, promptDiff, testCriteriaDiff, identity }.
 *
 * - normalizedBackup: the backup to pass to applyBackup (same structure)
 * - promptDiff: { changed: [{key, label, before, after, transition}], unchanged: [keys] }
 * - testCriteriaDiff: { tests: [{name, id, criteria: [{field, current, restored}]}] }
 * - identity: stable unique ID for this candidate
 */
export const buildRestoreCandidate = (openedBackup, currentPromptOverrides = {}) => {
  const identity = `candidate_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  // Freeze the normalized backup to prevent mutation
  const normalizedBackup = Object.freeze({
    ...openedBackup,
    data: Object.freeze({ ...openedBackup.data })
  });

  // Build prompt diff
  const promptDiff = buildPromptDiff(
    openedBackup.data?.atlas_ai_prompts,
    currentPromptOverrides
  );

  // Build test verdict-criteria diff
  const testCriteriaDiff = buildTestCriteriaDiff(
    openedBackup.data?.atlas_custom_tests
  );

  return Object.freeze({
    normalizedBackup,
    promptDiff,
    testCriteriaDiff,
    identity
  });
};

/**
 * Build exact prompt diff showing all transitions:
 * - unchanged (present in both, identical)
 * - default → custom (not in current, present in restore)
 * - custom → custom (in both, different values)
 * - custom → default (in current, absent/blank in restore)
 * - default → default (neither current nor restore; not shown)
 */
const buildPromptDiff = (restoredPromptsJson, currentOverrides) => {
  const PROMPT_LABELS = {
    judge_system: 'AI Judge System',
    judge_user: 'AI Judge User',
    generator_system: 'Test Generator System',
    analyzer_system: 'Source Analyzer System',
    critic_system: 'Test Critique System',
    critic_user: 'Test Critique User',
    refinement_system: 'Prompt Refinement System'
  };

  const KNOWN_KEYS = Object.keys(DEFAULT_PROMPTS);
  
  let restoredPrompts = {};
  if (restoredPromptsJson) {
    try {
      const parsed = JSON.parse(restoredPromptsJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        restoredPrompts = parsed;
      }
    } catch {
      restoredPrompts = {};
    }
  }

  const changed = [];
  const unchanged = [];

  for (const key of KNOWN_KEYS) {
    const currentValue = (currentOverrides[key] || '').trim();
    const restoredValue = (restoredPrompts[key] || '').trim();
    const defaultValue = DEFAULT_PROMPTS[key] || '';

    const currentHasOverride = currentValue !== '' && currentValue !== defaultValue;
    const restoredHasOverride = restoredValue !== '' && restoredValue !== defaultValue;

    let transition = '';
    let before = '';
    let after = '';

    if (currentValue === restoredValue && currentValue !== '') {
      // Unchanged (both have same non-empty value)
      unchanged.push(key);
      continue;
    }

    if (!currentHasOverride && !restoredHasOverride) {
      // Both at default, no change
      unchanged.push(key);
      continue;
    }

    if (!currentHasOverride && restoredHasOverride) {
      // default → custom
      transition = 'default → custom';
      before = '(built-in default)';
      after = restoredValue;
    } else if (currentHasOverride && !restoredHasOverride) {
      // custom → default
      transition = 'custom → default';
      before = currentValue;
      after = '(built-in default)';
    } else {
      // custom → custom
      transition = 'custom → custom';
      before = currentValue;
      after = restoredValue;
    }

    changed.push({
      key,
      label: PROMPT_LABELS[key] || key,
      before,
      after,
      transition
    });
  }

  return Object.freeze({
    changed: Object.freeze(changed),
    unchanged: Object.freeze(unchanged)
  });
};

/**
 * Extract verdict criteria from a single test object.
 * Returns array of { field, value } objects for verdict-relevant fields.
 *
 * Authoritative verdict fields (from evaluateWithKeywords):
 * - failKeywords
 * - refusalKeywords
 * - targetKeyword (for system_prompt_leak test id)
 * - systemPrompt (secret-token heuristic source)
 */
export const extractTestCriteria = (test) => {
  if (!test || typeof test !== 'object') {
    return [];
  }

  const criteria = [];

  // failKeywords
  if (Array.isArray(test.failKeywords) && test.failKeywords.length > 0) {
    criteria.push({
      field: 'failKeywords',
      value: test.failKeywords
    });
  }

  // refusalKeywords
  if (Array.isArray(test.refusalKeywords) && test.refusalKeywords.length > 0) {
    criteria.push({
      field: 'refusalKeywords',
      value: test.refusalKeywords
    });
  }

  // targetKeyword (for system_prompt_leak)
  if (test.id === 'system_prompt_leak' && test.targetKeyword) {
    criteria.push({
      field: 'targetKeyword',
      value: test.targetKeyword
    });
  }

  // systemPrompt (secret-token heuristic frame)
  const hasSecretPattern = /(?:secret|token|passcode|password|key|credential|gate)\s*(?:is|:|=)\s*['"`]([^'"`\s]{4,})['"`]/i.test(test.systemPrompt || '');
  if (hasSecretPattern) {
    criteria.push({
      field: 'systemPrompt (secret-token frame)',
      value: '(contains secret pattern)'
    });
  }

  return criteria;
};

/**
 * Extract verdict criteria from restored tests.
 * Returns { tests: [{name, id, criteria: [{field, current, restored}]}] }
 *
 * Authoritative verdict fields (from evaluateWithKeywords):
 * - failKeywords
 * - refusalKeywords
 * - targetKeyword (for system_prompt_leak test id)
 * - systemPrompt (secret-token heuristic source)
 */
const buildTestCriteriaDiff = (restoredTestsJson) => {
  const tests = [];

  if (!restoredTestsJson) {
    return Object.freeze({ tests: Object.freeze([]) });
  }

  let restoredTests = [];
  try {
    const parsed = JSON.parse(restoredTestsJson);
    if (Array.isArray(parsed)) {
      restoredTests = parsed;
    }
  } catch {
    return Object.freeze({ tests: Object.freeze([]) });
  }

  for (const test of restoredTests) {
    if (!test || typeof test !== 'object') continue;

    const criteria = [];

    // failKeywords
    if (Array.isArray(test.failKeywords) && test.failKeywords.length > 0) {
      criteria.push({
        field: 'failKeywords',
        current: '(new test)',
        restored: test.failKeywords
      });
    }

    // refusalKeywords
    if (Array.isArray(test.refusalKeywords) && test.refusalKeywords.length > 0) {
      criteria.push({
        field: 'refusalKeywords',
        current: '(new test)',
        restored: test.refusalKeywords
      });
    }

    // targetKeyword (for system_prompt_leak)
    if (test.id === 'system_prompt_leak' && test.targetKeyword) {
      criteria.push({
        field: 'targetKeyword',
        current: '(new test)',
        restored: test.targetKeyword
      });
    }

    // systemPrompt (secret-token heuristic frame)
    const hasSecretPattern = /(?:secret|token|passcode|password|key|credential|gate)\s*(?:is|:|=)\s*['"`]([^'"`\s]{4,})['"`]/i.test(test.systemPrompt || '');
    if (hasSecretPattern) {
      criteria.push({
        field: 'systemPrompt (secret-token frame)',
        current: '(new test)',
        restored: '(contains secret pattern)'
      });
    }

    if (criteria.length > 0) {
      tests.push(Object.freeze({
        name: test.name || '(unnamed)',
        id: test.id || '(no id)',
        criteria: Object.freeze(criteria)
      }));
    }
  }

  return Object.freeze({
    tests: Object.freeze(tests)
  });
};
