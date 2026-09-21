// Unit coverage for the JSON-repair module:
//   src/utils/json-repair.js → normalizeContent / extractLastJsonBlock /
//   extractJsonBlocks / truncateText / stripFencesCandidates / parseJSONObject /
//   repairTruncatedJson.
// The pile lives in this module; src/utils/api/judge-client.js keeps every
// externally visible name as a stateless pass-through re-export so the
// existing import sites (utils/api index, ai-* modules, judge-client-gaps'
// direct imports) keep compiling unchanged (tests/judge-client.unit.test.mjs
// and tests/api-core.integration.test.mjs stay untouched and green).
//
// Behavioral cases run the REAL module and must hold the exact battery:
//   - every pile name is DEFINED in json-repair.js and not defined in
//     judge-client.js (a leftover local clone would break the identity pins);
//   - judge-client.js re-exports all seven names from '../json-repair.js'
//     while keeping its own query surface;
//   - the re-export chain is identity-equal through judge-client.js,
//     src/utils/api/index.js and src/utils/api.js — the pass-through is
//     stateless (same function objects everywhere), so no specifier churn
//     and no re-wrapping anywhere;
//   - the move is strictly net-smaller for judge-client.js.
// The 413-aware shrink ladder of queryOpenAIJudge — the only judge-client
// caller of truncateText — is pinned here exactly (transport retry
// fingerprint included) so the halving arithmetic is preserved.
//
// Nothing here needs a server, a browser or the network (fetch is stubbed
// locally for the ladder cases only). Standalone under bare `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeContent,
  extractLastJsonBlock,
  extractJsonBlocks,
  truncateText,
  stripFencesCandidates,
  parseJSONObject,
  repairTruncatedJson,
} from '../src/utils/json-repair.js';
import * as jsonRepairNs from '../src/utils/json-repair.js';
import * as judgeClientNs from '../src/utils/api/judge-client.js';
import * as apiIndexNs from '../src/utils/api/index.js';
import * as apiNs from '../src/utils/api.js';
import { queryOpenAIJudge } from '../src/utils/api/judge-client.js';
import { jsonRes, stubFetch, withFastTimers } from './helpers/httpx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const countMatches = (source, regex) => source.match(regex)?.length ?? 0;

const MODULE_PATH = 'src/utils/json-repair.js';
const JUDGE_PATH = 'src/utils/api/judge-client.js';
const PILE_NAMES = [
  'normalizeContent', 'extractLastJsonBlock', 'extractJsonBlocks', 'truncateText',
  'stripFencesCandidates', 'parseJSONObject', 'repairTruncatedJson',
];

const moduleSource = readSource(MODULE_PATH);
const judgeSource = readSource(JUDGE_PATH);

// ── facade: the pile is defined once, and the chain is identity-equal ──────

test('the pile is defined in json-repair.js and no longer in judge-client.js', () => {
  for (const name of PILE_NAMES) {
    assert.equal(
      countMatches(moduleSource, new RegExp(`^export const ${name} =`, 'gm')), 1,
      `${name} must be declared exactly once as an export of json-repair.js`
    );
    assert.equal(
      countMatches(judgeSource, new RegExp(`^\\s*(export )?const ${name} =`, 'gm')), 0,
      `${name} must have NO leftover definition in judge-client.js`
    );
  }
  // The query surface that stays behind stays defined in judge-client.js.
  for (const name of ['queryOpenAIJudge', 'queryRawJudge', 'queryAI', 'reasoningEndpoints']) {
    assert.equal(
      countMatches(judgeSource, new RegExp(`^export const ${name} =`, 'gm')), 1,
      `${name} must remain a judge-client.js export`
    );
    assert.equal(
      countMatches(moduleSource, new RegExp(`^export const ${name} =`, 'gm')), 0,
      `${name} must NOT leak into json-repair.js`
    );
  }
});

test('judge-client.js re-exports all seven pile names from ../json-repair.js and imports what it uses', () => {
  const reExport = judgeSource.match(/export \{[^}]*\} from '\.\.\/json-repair\.js';/);
  assert.ok(reExport, "judge-client.js must carry an `export { … } from '../json-repair.js';` facade");
  for (const name of PILE_NAMES) {
    assert.ok(reExport[0].includes(name), `the facade re-export names ${name}`);
  }
  assert.ok(
    /import \{[^}]*normalizeContent[^}]*\} from '\.\.\/json-repair\.js';/.test(judgeSource),
    "judge-client.js imports its runtime needs (normalizeContent, extractLastJsonBlock, truncateText) from '../json-repair.js'"
  );
});

test('the re-export chain is identity-equal: json-repair → judge-client → api index → api.js', () => {
  for (const name of PILE_NAMES) {
    assert.ok(jsonRepairNs[name], `${name} must be exported by json-repair.js`);
    assert.equal(judgeClientNs[name], jsonRepairNs[name],
      `${name}: the judge-client facade is a stateless pass-through (same function object)`);
    assert.equal(apiIndexNs[name], jsonRepairNs[name],
      `${name}: the api index re-export stays identity-equal (no re-wrapping)`);
    assert.equal(apiNs[name], jsonRepairNs[name],
      `${name}: the api.js re-export stays identity-equal (no re-wrapping)`);
  }
  // The judge-client-owned surface is its own (not leaked from the module).
  assert.notEqual(judgeClientNs.queryOpenAIJudge, undefined);
  assert.equal(jsonRepairNs.queryOpenAIJudge, undefined);
});

// ── behavioral battery ─────────────────────────────────────────────────────

test('normalizeContent: string passthrough and non-string coercions', () => {
  assert.equal(normalizeContent('verbatim text'), 'verbatim text');
  assert.equal(normalizeContent(null), '');
  assert.equal(normalizeContent(undefined), '');
  assert.equal(normalizeContent(42), '');
  assert.equal(normalizeContent({ text: 'payload' }), 'payload');
  assert.equal(normalizeContent({}), '');
  assert.equal(normalizeContent({ text: '' }), '');
  assert.equal(normalizeContent({ noText: 'ignored' }), '');
});

test('normalizeContent: arrays join the string/text parts with a single space', () => {
  assert.equal(normalizeContent(['alpha', 'beta', 'gamma']), 'alpha beta gamma');
  assert.equal(
    normalizeContent(['plain', { text: 'from object' }, null, undefined, { other: 1 }, 7]),
    'plain from object',
    'falsy parts and text-less parts are dropped, strings and {text} parts survive'
  );
  assert.equal(normalizeContent([]), '');
  assert.equal(normalizeContent(['', '']), '');
  // A numeric 0 text part is falsy and must not leak '0' into the join.
  assert.equal(normalizeContent([{ text: 0 }, 'real']), 'real');
});

test('extractJsonBlocks: returns the RAW source substring of each balanced block, in order', () => {
  assert.deepEqual(extractJsonBlocks('x {"a":{"b":1}} y ["z"]'), ['{"a":{"b":1}}', '["z"]']);
  assert.deepEqual(extractJsonBlocks('{"a":1}{"b":2}'), ['{"a":1}', '{"b":2}'], 'adjacent sibling blocks are both captured');
  assert.deepEqual(extractJsonBlocks('no structure at all'), []);
  assert.deepEqual(extractJsonBlocks(''), []);
});

test('extractJsonBlocks: braces and brackets inside strings never affect balance', () => {
  assert.deepEqual(
    extractJsonBlocks('{"a":"}not a close]","b":"[unclosed"}'),
    ['{"a":"}not a close]","b":"[unclosed"}']
  );
  assert.deepEqual(
    extractJsonBlocks('{"a":"escaped \\" quote and { brace"}'),
    ['{"a":"escaped \\" quote and { brace"}'],
    'escaped quotes inside strings are honored'
  );
});

test('extractJsonBlocks: a block that never re-closes is dropped', () => {
  assert.deepEqual(extractJsonBlocks('{"a":1} {"b":2'), ['{"a":1}']);
});

test('extractLastJsonBlock: the LAST balanced block wins; none → null', () => {
  assert.equal(extractLastJsonBlock('{"a":1} tail {"b":2} end'), '{"b":2}');
  assert.equal(extractLastJsonBlock('x ["p"] mid {"q":0}'), '{"q":0}');
  assert.equal(extractLastJsonBlock('no json here'), null);
  assert.equal(extractLastJsonBlock('{"unbalanced'), null);
  assert.equal(extractLastJsonBlock(''), null);
});

test('truncateText: passthrough when empty, null or within budget', () => {
  assert.equal(truncateText('short', 100), 'short');
  assert.equal(truncateText('', 10), '');
  assert.equal(truncateText(null, 10), null);
  assert.equal(truncateText('12345', 5), '12345', 'exact budget is a passthrough, no marker');
});

test('truncateText: cuts at a sentence terminator inside the final 40% window', () => {
  const text = 'x'.repeat(60) + '.' + 'y'.repeat(35); // 96 chars, budget 90, minCut 54
  assert.equal(
    truncateText(text, 90),
    'x'.repeat(60) + '.' + '… (truncated)',
    'the cut lands right after the terminator at index 60'
  );
});

test('truncateText: a terminator before the 60% floor is ignored — hard cut at the budget', () => {
  const text = 'x'.repeat(50) + '.' + 'y'.repeat(45); // terminator at index 50 < minCut 54
  assert.equal(truncateText(text, 90), 'x'.repeat(50) + '.' + 'y'.repeat(39) + '… (truncated)');
  assert.equal(truncateText('z'.repeat(120), 100), 'z'.repeat(100) + '… (truncated)');
});

test('truncateText: the truncation mark is exactly "… (truncated)" (U+2026)', () => {
  const out = truncateText('q'.repeat(50), 20);
  assert.ok(out.startsWith('q'.repeat(20)), 'hard cut at the budget');
  assert.ok(out.endsWith('… (truncated)'));
  assert.equal(out.length, 20 + '… (truncated)'.length);
});

test('stripFencesCandidates: each closed fence yields its interior, fences excluded', () => {
  assert.deepEqual(stripFencesCandidates('```json\n{"a":1}\n```'), ['{"a":1}']);
  assert.deepEqual(
    stripFencesCandidates('prose\n```\nline one\n  spaced  \n```\ntail\n```json\n{"b":2}\n```'),
    ['line one\n  spaced  ', '{"b":2}'],
    'candidates keep the raw interior lines, in fence order'
  );
});

test('stripFencesCandidates: an unterminated fence yields nothing', () => {
  assert.deepEqual(stripFencesCandidates('```json\n{"a":1}'), []);
  assert.deepEqual(stripFencesCandidates('```'), []);
});

test('stripFencesCandidates: no fences or empty text → empty candidate list', () => {
  assert.deepEqual(stripFencesCandidates('plain prose {"a":1}'), []);
  assert.deepEqual(stripFencesCandidates(''), []);
});

test('parseJSONObject: pure JSON parses directly, any JSON value type', () => {
  assert.deepEqual(parseJSONObject('{"status":"high"}'), { status: 'high' });
  assert.deepEqual(parseJSONObject('[1,2]'), [1, 2]);
  assert.equal(parseJSONObject('"lit"'), 'lit', 'the direct JSON.parse path returns scalars as-is');
  assert.equal(parseJSONObject('null'), null);
});

test('parseJSONObject: recovers the first parseable object block embedded in prose or fences', () => {
  assert.deepEqual(parseJSONObject('prefix {"status":"high"} suffix'), { status: 'high' });
  assert.deepEqual(parseJSONObject('```json\n{"a":1,"b":2}\n```'), { a: 1, b: 2 });
  assert.deepEqual(
    parseJSONObject('{"broken":} {"good":1}'),
    { good: 1 },
    'a broken first block is skipped; the first parseable OBJECT wins'
  );
  assert.deepEqual(
    parseJSONObject('"string block" {"k":1}'),
    { k: 1 },
    'a block parsing to a non-object is skipped (object gate)'
  );
  assert.deepEqual(parseJSONObject('{"a":1} trailing garbage'), { a: 1 });
});

test('parseJSONObject: truncated JSON falls through to the repairer', () => {
  assert.deepEqual(parseJSONObject('{"a": [1,2'), { a: [1, 2] });
  assert.deepEqual(parseJSONObject('{"a": "unterminated'), { a: 'unterminated' });
});

test('parseJSONObject: returns null (never throws) for unparseable input', () => {
  assert.equal(parseJSONObject(''), null);
  assert.equal(parseJSONObject('garbage'), null);
  assert.equal(parseJSONObject('{{{'), null);
  assert.equal(parseJSONObject('{"a": [}'), null);
  assert.equal(parseJSONObject(undefined), null);
});

test('repairTruncatedJson: complete or trimmable JSON passes through parsed', () => {
  assert.deepEqual(repairTruncatedJson('{"a":1}'), { a: 1 });
  assert.deepEqual(repairTruncatedJson('[1,2]'), [1, 2]);
  assert.deepEqual(repairTruncatedJson('  {"a":1}  '), { a: 1 });
});

test('repairTruncatedJson: closes an unterminated string before appending closers', () => {
  assert.deepEqual(repairTruncatedJson('{"a": "unterminated'), { a: 'unterminated' });
  assert.deepEqual(repairTruncatedJson('{"a":"x,'), { a: 'x,' }, 'the comma inside the string survives the closing quote');
  assert.deepEqual(repairTruncatedJson('{"a":"[not]"'), { a: '[not]' }, 'brackets inside the string never enter the closer stack');
});

test('repairTruncatedJson: drops a trailing comma at top level', () => {
  assert.deepEqual(repairTruncatedJson('{"a":1,'), { a: 1 });
  assert.deepEqual(repairTruncatedJson('[1,2,'), [1, 2]);
});

test('repairTruncatedJson: appends closers for open brackets in stack order', () => {
  assert.deepEqual(repairTruncatedJson('{"a":{"b":[1'), { a: { b: [1] } });
  assert.deepEqual(repairTruncatedJson('{"a":[1,{"b":2'), { a: [1, { b: 2 }] });
  assert.deepEqual(repairTruncatedJson('[1,2'), [1, 2]);
});

test('repairTruncatedJson: backslash escapes inside strings never close the string early', () => {
  // The scan must honor \" and \\ while deciding whether the string is still
  // open; otherwise a truncated string containing an escaped quote would be
  // "closed" at the wrong spot and fail to repair.
  assert.deepEqual(
    repairTruncatedJson('{"a": "say \\"hi\\"'),
    { a: 'say "hi"' },
    'escaped quotes inside an unterminated string survive and the repairer appends the real closer'
  );
  assert.deepEqual(
    repairTruncatedJson('{"path":"C:\\\\'),
    { path: 'C:\\' },
    'a trailing escaped backslash is not treated as escaping the appended closer'
  );
});

test('repairTruncatedJson: mismatched closers and broken bodies map to null', () => {
  assert.equal(repairTruncatedJson('{"a":1]'), null);
  assert.equal(repairTruncatedJson('[1,2}'), null);
  assert.equal(repairTruncatedJson('{a:b}'), null, 'an unquoted key is beyond simple truncation');
  assert.equal(repairTruncatedJson('{"a": [}'), null);
});

test('repairTruncatedJson: input not starting with { or [ is rejected', () => {
  assert.equal(repairTruncatedJson('hello {"a":1}'), null);
  assert.equal(repairTruncatedJson(''), null);
  assert.equal(repairTruncatedJson('"just a string"'), null);
  assert.equal(repairTruncatedJson(null), null);
  assert.equal(repairTruncatedJson(undefined), null);
});

// ── the 413-aware shrink ladder of queryOpenAIJudge (judge-client keeps it) ─

test('413 shrink ladder: one 413 halves BOTH prompts through truncateText, then the retry succeeds', async () => {
  const big = 'x'.repeat(30000);
  const seen = [];
  // Attempt 0 ships retries=2, so the transport itself re-tries the 413
  // twice before the ladder ever sees it: fetch calls 1-3 get 413, the
  // first SHRUNK round-trip (call 4, retries=0) finally succeeds.
  stubFetch([[(_pred) => true, (_req) => {
    seen.push(_req);
    return seen.length <= 3 ? jsonRes({}, 413) : jsonRes({ choices: [{ message: { content: '{"shrunk":true}' } }] });
  }]]);
  const judge = { provider: 'mock', model: 'm', endpoint: 'https://judge.example/v1/chat/completions', apiKey: 'k' };
  const out = await withFastTimers(() => queryOpenAIJudge(judge, big, big));
  assert.equal(out, '{"shrunk":true}');
  assert.equal(seen.length, 4, '3 transport retries of the unshrunk attempt + one shrunken round-trip');
  for (const early of seen.slice(0, 3)) {
    assert.deepEqual(early.body.messages, [
      { role: 'system', content: big }, { role: 'user', content: big }
    ], 'the first attempt ships the prompts unshrunk (transport-internal retries included)');
  }
  // shrinkHalve(big) === truncateText(big, 15000) === 15000 x's + the truncation mark.
  const half = 'x'.repeat(15000) + '… (truncated)';
  assert.deepEqual(seen[3].body.messages, [
    { role: 'system', content: half }, { role: 'user', content: half }
  ], 'the 413 halves both prompts via truncateText before the retry');
  assert.ok(seen[3].body.messages[0].content.length < seen[0].body.messages[0].content.length, 'the retry payload is strictly smaller');
});

test('413 shrink ladder: consecutive 413s keep halving (unshrunk retries stay internal) before the give-up throw', async () => {
  const big = 'x'.repeat(30000);
  const seen = [];
  stubFetch([[(_pred) => true, (_req) => { seen.push(_req); return jsonRes({}, 413); }]]);
  const judge = { provider: 'mock', model: 'm', endpoint: 'https://judge.example/v1/chat/completions', apiKey: 'k' };
  await withFastTimers(() => assert.rejects(
    queryOpenAIJudge(judge, big, big),
    { message: 'Payload too large for the judge endpoint: HTTP 413: {}' }
  ));
  // Transport fingerprint: attempt 0 carries retries=2 (3 fetches, all with the
  // original prompts); the two shrink attempts carry retries=0 — one fetch each.
  assert.equal(seen.length, 5, '3 transport retries + 2 single-shot shrink attempts');
  for (const early of seen.slice(0, 3)) {
    assert.deepEqual(early.body.messages, [
      { role: 'system', content: big }, { role: 'user', content: big }
    ]);
  }
  assert.deepEqual(seen[3].body.messages, [
    { role: 'system', content: 'x'.repeat(15000) + '… (truncated)' },
    { role: 'user', content: 'x'.repeat(15000) + '… (truncated)' }
  ], 'the first shrink attempt halves the original prompt (30000 → 15013 chars)');
  const secondHalf = 'x'.repeat(7506) + '… (truncated)';
  assert.deepEqual(seen[4].body.messages, [
    { role: 'system', content: secondHalf }, { role: 'user', content: secondHalf }
  ], 'the second shrink halves the already-truncated prompt (15013 → 7519 chars)');
  assert.ok(seen[4].body.messages[0].content.length < seen[3].body.messages[0].content.length);
});

// ── no specifier churn: the untouched wiring must stay byte-stable ─────────

test('the ai-* consumers keep their byte-stable import sites through the api index', () => {
  assert.equal(
    countMatches(readSource('src/utils/ai-analyzer.js'), /^import \{ queryAI, truncateText, parseJSONObject \} from '\.\/api\/index\.js';$/m), 1
  );
  assert.equal(
    countMatches(readSource('src/utils/ai-judge.js'), /^import \{ queryAI, extractJsonBlocks, stripFencesCandidates \} from '\.\/api\/index\.js';$/m), 1
  );
  assert.equal(
    countMatches(
      readSource('src/utils/ai-generator.js'),
      /^import \{ queryAI, truncateText, repairTruncatedJson, extractJsonBlocks, stripFencesCandidates \} from '\.\/api\/index\.js';$/m
    ), 1
  );
});

test('the api re-export chain still funnels through judge-client.js — untouched', () => {
  const indexSource = readSource('src/utils/api/index.js');
  assert.ok(
    /export \{[^}]*queryOpenAIJudge[\s\S]*?from '\.\/judge-client\.js';/.test(indexSource),
    'src/utils/api/index.js re-exports the judge surface from ./judge-client.js'
  );
  for (const name of PILE_NAMES) {
    assert.ok(indexSource.includes(name), `the api index re-export block names ${name}`);
  }
  const apiSource = readSource('src/utils/api.js');
  assert.ok(
    /export \{[^}]*queryOpenAIJudge[\s\S]*?from '\.\/api\/judge-client\.js';/.test(apiSource),
    'src/utils/api.js re-exports the judge surface from ./api/judge-client.js'
  );
});

// ── the move is strictly net-smaller for judge-client.js ───────────────────

test('judge-client.js is strictly net-smaller; json-repair.js carries the pile', () => {
  const judgeLines = judgeSource.split('\n').length;
  const moduleLines = moduleSource.split('\n').length;
  assert.ok(judgeLines < 318, `judge-client.js must shrink below its 318-line baseline (got ${judgeLines})`);
  assert.ok(judgeLines >= 120, `judge-client.js must keep its query surface (got ${judgeLines} lines)`);
  assert.ok(moduleLines >= 140, `json-repair.js must carry the pile bodies (got ${moduleLines} lines)`);
  assert.ok(moduleLines <= 260, `json-repair.js must stay a pure pile module (got ${moduleLines} lines)`);
});
