import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { decodeCsvRows, looksLikeCsv } from '../src/utils/import-csv.js';
import { IMPORT_LIMITS, parseBulkTests } from '../src/utils/testImporter.js';

test('decodeCsvRows handles LF and CRLF records without schema knowledge', () => {
  assert.deepEqual(decodeCsvRows('name,prompt\nAlpha,attack'), [
    ['name', 'prompt'],
    ['Alpha', 'attack'],
  ]);
  assert.deepEqual(decodeCsvRows('name,prompt\r\nAlpha,attack\r\nBeta,defend'), [
    ['name', 'prompt'],
    ['Alpha', 'attack'],
    ['Beta', 'defend'],
  ]);
});

test('decodeCsvRows preserves quoted commas and decodes doubled quotes', () => {
  const rows = decodeCsvRows('name,prompt\n"Multi, word","some, quoted ""payload"" here"');

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['name', 'prompt']);
  assert.deepEqual(rows[1], ['Multi, word', 'some, quoted "payload" here']);
});

test('looksLikeCsv recognizes supported normalized headers only', () => {
  assert.equal(looksLikeCsv('Display Name,USER_PROMPT\nExample,payload'), true);
  assert.equal(looksLikeCsv('irrelevant,unknown\nExample,payload'), false);
  assert.equal(looksLikeCsv('prompt\nattack'), false);
  assert.equal(looksLikeCsv('"title","query"\r\nExample,payload'), true);
  assert.equal(looksLikeCsv(''), false, 'empty import text has no first line and is not CSV');
  assert.equal(looksLikeCsv('\nname,prompt'), false, 'a leading blank line means the first line is empty, not a header');
});

test('testImporter composes the CSV boundary and retains schema normalization', () => {
  const source = fs.readFileSync(new URL('../src/utils/testImporter.js', import.meta.url), 'utf8');
  const result = parseBulkTests([
    'title,attack_prompt,system_prompt,fail_keywords,refusal_keywords',
    'Alias case,payload,system,leak|secret,cannot|sorry',
  ].join('\n'));

  assert.match(source, /from ['"]\.\/import-csv\.js['"]/);
  assert.doesNotMatch(source, /const parseCSVLine\s*=/);
  assert.equal(result.format, 'csv');
  assert.equal(result.formatLabel, 'CSV');
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].name, 'Alias case');
  assert.equal(result.tests[0].userPrompt, 'payload');
  assert.equal(result.tests[0].systemPrompt, 'system');
  assert.deepEqual(result.tests[0].failKeywords, ['leak', 'secret']);
  assert.deepEqual(result.tests[0].refusalKeywords, ['cannot', 'sorry']);
  assert.match(result.tests[0].id, /^import_/);
  assert.equal(result.tests[0].origin, 'Bulk-imported (CSV)');
});

test('testImporter retains CSV limits and aggregate rejection behavior', () => {
  assert.throws(() => parseBulkTests('name,prompt'), /header row and at least one data row/);
  assert.throws(() => parseBulkTests('name,prompt\nOnly name,'), /No runnable test cases could be extracted/);

  const rows = Array.from({ length: IMPORT_LIMITS.maxTests + 1 }, (_, index) => `Test ${index},attack-${index}`);
  assert.throws(
    () => parseBulkTests(['name,prompt', ...rows].join('\n')),
    new RegExp(`${IMPORT_LIMITS.maxTests}-test limit`),
  );
});
