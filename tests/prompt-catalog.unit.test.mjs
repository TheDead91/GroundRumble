import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PROMPTS,
  PROMPT_DESCRIPTIONS,
  PROMPT_LABELS,
  PROMPT_PURPOSES,
  REQUIRED_PLACEHOLDERS,
} from '../src/utils/prompt-catalog.js';
import * as facade from '../src/utils/prompts.js';

const catalogSource = readFileSync(new URL('../src/utils/prompt-catalog.js', import.meta.url), 'utf8');
const facadeSource = readFileSync(new URL('../src/utils/prompts.js', import.meta.url), 'utf8');
const names = [
  'DEFAULT_PROMPTS',
  'PROMPT_DESCRIPTIONS',
  'PROMPT_LABELS',
  'PROMPT_PURPOSES',
  'REQUIRED_PLACEHOLDERS',
];

const snapshot = JSON.stringify({
  REQUIRED_PLACEHOLDERS,
  DEFAULT_PROMPTS,
  PROMPT_LABELS,
  PROMPT_DESCRIPTIONS,
  PROMPT_PURPOSES,
});

test('The data-only catalog owns the complete byte-stable prompt data', () => {
  assert.equal(
    createHash('sha256').update(snapshot).digest('hex'),
    'b2903acc21b471f49aca75e1851f69ddf9da0a2bc014e2ee04160f9c2a9b8266',
    'prompt text, labels, descriptions, purposes, and placeholders stay byte-exact',
  );
  assert.deepEqual(Object.keys(DEFAULT_PROMPTS), [
    'judge_system',
    'judge_user',
    'analyzer_system',
    'assess_system',
    'propose_system',
    'generator_system',
    'critic_system',
  ]);
  assert.deepEqual(REQUIRED_PLACEHOLDERS, {
    judge_user: ['techniqueName', 'techniqueId', 'systemPrompt', 'userPrompt', 'modelResponse', 'evaluatorPrompt'],
    generator_system: ['techniqueCatalog'],
    critic_system: ['count'],
  });
});

test('Prompt-catalog.js is dependency-free static data', () => {
  assert.doesNotMatch(catalogSource, /^\s*import\b/m, 'the catalog has no imports');
  assert.doesNotMatch(catalogSource, /\b(?:function|class|localStorage|queryAI|fetch)\b/, 'the catalog has no behavior or I/O');
  for (const name of names) {
    assert.equal((catalogSource.match(new RegExp(`export const ${name}\\b`, 'g')) || []).length, 1, `${name} has one catalog definition`);
  }
});

test('Prompts.js is the compatibility facade and no longer defines catalog data', () => {
  assert.match(facadeSource, /from ['"]\.\/prompt-catalog\.js['"]/, 'the facade consumes the catalog module');
  for (const name of names) {
    assert.doesNotMatch(facadeSource, new RegExp(`export const ${name}\\b`), `${name} moved out of the facade`);
    assert.equal(facade[name], { DEFAULT_PROMPTS, PROMPT_DESCRIPTIONS, PROMPT_LABELS, PROMPT_PURPOSES, REQUIRED_PLACEHOLDERS }[name], `${name} is re-exported by identity`);
  }
  for (const owner of ['STORE_KEY', 'getPrompt', 'getPromptOverrides', 'setPrompt', 'resetPrompt', 'renderPrompt', 'validatePromptRewrite', 'mergePromptWithAI']) {
    assert.match(facadeSource, new RegExp(`\\b${owner}\\b`), `${owner} remains owned by prompts.js`);
  }
});

test('Catalog metadata is complete for every unchanged public prompt key', () => {
  for (const key of Object.keys(DEFAULT_PROMPTS)) {
    assert.ok(DEFAULT_PROMPTS[key].length > 20, `${key} default prompt`);
    assert.ok(PROMPT_LABELS[key], `${key} label`);
    assert.ok(PROMPT_DESCRIPTIONS[key], `${key} description`);
    assert.ok(PROMPT_PURPOSES[key], `${key} purpose`);
  }
});
