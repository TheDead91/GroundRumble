import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThreatProfile } from '../src/utils/threat-profile.js';

test('normalizes profile scalars and filters malformed or disallowed vectors', () => {
  const parsed = {
    sourceKey: ' source-1 ',
    sourceTitle: ' Source title ',
    vulnerabilityClass: ' Prompt injection ',
    vectors: [
      null,
      'invalid',
      {},
      {
        description: ' concrete description ',
        payloadShape: ' ',
        techniqueId: ' AML.T1 ',
        techniqueName: ' Technique one ',
        evidence: ' quoted evidence '
      },
      {
        name: 'Blocked',
        description: 'blocked by allowlist',
        payloadShape: 'payload',
        techniqueId: 'AML.BAD'
      }
    ],
    weight: '2'
  };
  const original = structuredClone(parsed);

  assert.deepEqual(normalizeThreatProfile(parsed, new Set(['AML.T1'])), {
    sourceKey: 'source-1',
    sourceTitle: 'Source title',
    vulnerabilityClass: 'Prompt injection',
    vectors: [{
      name: 'Attack vector',
      description: 'concrete description',
      payloadShape: '',
      techniqueId: 'AML.T1',
      techniqueName: 'Technique one',
      evidence: 'quoted evidence'
    }],
    weight: 2
  });
  assert.deepEqual(parsed, original);
});

test('retains normalized vectors when no technique allowlist is supplied', () => {
  const profile = normalizeThreatProfile({
    vectors: [{ description: '', payloadShape: ' literal payload ', techniqueId: ' AML.UNKNOWN ' }]
  });

  assert.equal(profile.vectors.length, 1);
  assert.equal(profile.vectors[0].payloadShape, 'literal payload');
  assert.equal(profile.vectors[0].techniqueId, 'AML.UNKNOWN');
});

test('supplies canonical defaults for missing model values', () => {
  assert.deepEqual(normalizeThreatProfile({}), {
    sourceKey: '',
    sourceTitle: '',
    vulnerabilityClass: '',
    vectors: [],
    weight: 1
  });
});

test('clamps low, high, and malformed model-produced weights', () => {
  assert.equal(normalizeThreatProfile({ weight: -20 }).weight, 1);
  assert.equal(normalizeThreatProfile({ weight: 20 }).weight, 3);
  assert.equal(normalizeThreatProfile({ weight: 0 }).weight, 1);
  assert.equal(normalizeThreatProfile({ weight: 'not-a-number' }).weight, 1);
});

test('ai-analyzer consumes the extracted normalizer', () => {
  const analyzerSource = readFileSync(new URL('../src/utils/ai-analyzer.js', import.meta.url), 'utf8');

  assert.match(analyzerSource, /import\s*\{[^}]*\bnormalizeThreatProfile\b[^}]*\}\s*from\s*['"]\.\/threat-profile\.js['"]/);
  assert.doesNotMatch(analyzerSource, /\b(?:const|let|var|function)\s+normalizeThreatProfile\b/);
});
