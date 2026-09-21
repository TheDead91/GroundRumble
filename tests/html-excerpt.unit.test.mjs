// Unit coverage for the HTML→excerpt pipeline:
//   src/utils/html-excerpt.js → extractMainContent / decodeHtmlEntities /
//   stripHtml / smartExcerpt / extractArticle / capChars / MAX_README_CHARS /
//   MAX_SOURCE_READ_BYTES / readBoundedText.
// src/utils/api/atlas-sync.js imports back the six names its remaining network
// flow consumes while keeping every byte of network behavior (the pointer/v6/
// legacy fetch order, timeouts, redirect policy, GitHub flows) — and
// src/utils/api.js + the api index keep re-exporting fetchSourceExcerpt from
// atlas-sync, so the behavioral suites (article-excerpt, article-extraction,
// atlas-sync) pass unmodified.
//
// Behavioral cases cover the full pipeline. The facade pins go further: the
// nine names have their single home in html-excerpt.js, atlas-sync has zero
// leftover definitions and imports back exactly the names it uses, the
// re-export chain is identity-equal, and atlas-sync is strictly net-smaller.
//
// Nothing here needs a server, a browser or the network (fetch is stubbed
// locally; DOMParser comes from the local jsdom dev dependency for the
// Readability-path cases only). Standalone under bare `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  extractMainContent,
  decodeHtmlEntities,
  stripHtml,
  smartExcerpt,
  extractArticle,
  capChars,
  MAX_README_CHARS,
  MAX_SOURCE_READ_BYTES,
  readBoundedText,
} from '../src/utils/html-excerpt.js';
import * as htmlExcerptNs from '../src/utils/html-excerpt.js';
import * as atlasSyncNs from '../src/utils/api/atlas-sync.js';
import * as apiIndexNs from '../src/utils/api/index.js';
import * as apiNs from '../src/utils/api.js';
import { fetchSourceExcerpt } from '../src/utils/api/atlas-sync.js';
import { setProxyConfig } from '../src/utils/api/proxy.js';
import { stubFetch, textRes } from './helpers/httpx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const countMatches = (source, regex) => source.match(regex)?.length ?? 0;

const MODULE_PATH = 'src/utils/html-excerpt.js';
const SYNC_PATH = 'src/utils/api/atlas-sync.js';
const PIPELINE_NAMES = [
  'extractMainContent', 'decodeHtmlEntities', 'stripHtml', 'smartExcerpt', 'extractArticle',
  'MAX_README_CHARS', 'capChars', 'MAX_SOURCE_READ_BYTES', 'readBoundedText',
];
const CONSUMER_NAMES = ['MAX_README_CHARS', 'capChars', 'readBoundedText', 'extractArticle', 'smartExcerpt', 'stripHtml'];

const moduleSource = readSource(MODULE_PATH);
const syncSource = readSource(SYNC_PATH);
const moduleLines = moduleSource.split('\n').length;
const syncLines = syncSource.split('\n').length;

const SEPARATOR = '\n… (truncated)…\n';

// ── the module carries the pipeline — single home, pure, byte-exact ─────────

test('The module exports exactly the nine pipeline names, each defined once', () => {
  for (const name of PIPELINE_NAMES) {
    assert.equal(countMatches(moduleSource, new RegExp(`^export const ${name} =`, 'gm')), 1,
      `${name} must be declared exactly once as an export of html-excerpt.js`);
    assert.ok(htmlExcerptNs[name] !== undefined, `${name} must resolve from the module namespace`);
  }
  const exports = Object.keys(htmlExcerptNs).sort();
  assert.deepEqual(exports, [...PIPELINE_NAMES].sort(), 'no extra exports beyond the nine pipeline names');
  assert.doesNotMatch(moduleSource, /export default/, 'no default export');
});

test('The module is pure — no fetch, no require, no browser globals', () => {
  assert.doesNotMatch(moduleSource, /\bfetch\(/, 'no fetch — pure per playbook (network stays in atlas-sync.js)');
  assert.doesNotMatch(moduleSource, /\brequire\(/, 'no require calls');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'globalThis.']) {
    assert.equal(countMatches(moduleSource, forbidden), 0, `the pure module never touches ${forbidden}`);
  }
  assert.match(moduleSource, /^import \{ Readability \} from '@mozilla\/readability';$/m, 'the Readability import moved with extractArticle');
  assert.match(moduleSource, /if \(typeof DOMParser === 'undefined'\) return null;/, 'the DOMParser use stays behind the typeof guard');
  assert.equal(countMatches(moduleSource, /MAX_README_CHARS/g), 6, 'the 12000 cap: definition + capChars + reader default + reader budget floor… carried verbatim');
});

test('The moved bodies carry their exact machinery (needles)', () => {
  const region = moduleSource.split('\n').map((l) => l.trim()).filter((l) => l.length).join('\n');
  for (const needle of [
    'const extractMainContent = (html) => {',
    'region(/<article[\\s\\S]*?<\\/article>/gi);',
    'region(/<main[\\s\\S]*?<\\/main>/gi);',
    'if (candidates.length === 0) return src;',
    'if (len > best.len) best = { c, len };',
    'return best.len > 0 ? best.c : src;',
    "if ((cp >= 0xE000 && cp <= 0xF8FF) || cp > 0xFFFF) return '';",
    "const sep = '\\n… (truncated)…\\n';",
    'const head = Math.floor(maxChars * 0.6);',
    'const midStart = Math.floor((str.length - mid) / 2);',
    'new Readability(doc, { charThreshold: 200 }).parse();',
    'if (text.length >= 300) return { text, title: article.title };',
    'const MAX_README_CHARS = 12000;',
    'const capChars = (maxChars) => Math.max(1, Math.min(Number(maxChars) || MAX_README_CHARS, MAX_README_CHARS));',
    'const MAX_SOURCE_READ_BYTES = 1024 * 1024;',
    'const budget = Math.max(64 * 1024, Math.min(4 * chars, MAX_SOURCE_READ_BYTES));',
    "if (!body || typeof body.getReader !== 'function') {",
    'return text.length > budget ? text.slice(0, budget) : text;',
    'if (total > budget) {',
    'try { await reader.cancel(); } catch { /* ignore cancel failures */ }',
    'return new TextDecoder().decode(all);',
    '// Prefer the main article content over site chrome.',
  ]) {
    assert.ok(region.includes(needle), `the moved pipeline keeps …${needle.slice(0, 64)}…`);
  }
});

// ── the adoption — zero leftovers, exact import-back, intact shell ──────────

test('Atlas-sync has zero pipeline leftovers and imports back exactly what it uses', () => {
  for (const name of PIPELINE_NAMES) {
    assert.equal(countMatches(syncSource, new RegExp(`^\\s*(export )?const ${name} =`, 'gm')), 0,
      `${name} must have NO leftover definition in atlas-sync.js`);
  }
  const importBack = syncSource.match(new RegExp(`import \\{ ${CONSUMER_NAMES.join(', ')} \\} from '\\.\\./html-excerpt\\.js';`));
  assert.ok(importBack, "atlas-sync imports its six consumers from '../html-excerpt.js' in the packaged order");
  assert.equal(countMatches(syncSource, /@mozilla\/readability/g), 0, 'the Readability import left atlas-sync with extractArticle');
  // The six names keep a single home across the whole utils tree: html-excerpt.js.
  for (const name of PIPELINE_NAMES) {
    assert.equal(countMatches(moduleSource, new RegExp(`^export const ${name} =`, 'gm')), 1);
  }
  assert.equal(countMatches(moduleSource, /MAX_README_CHARS/g) + countMatches(syncSource, /MAX_README_CHARS/g), 15,
    'the 12000 cap keeps its fifteen references across the module ∪ atlas-sync union (6 module-side + 9 sync-side)');
});

test('The ATLAS network shell stays byte-carried in atlas-sync (untouched half)', () => {
  const body = syncSource.split('\n').map((l) => l.trim()).filter((l) => l.length).join('\n');
  for (const needle of [
    "const ATLAS_POINTER_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-latest.yaml';",
    "const ATLAS_LEGACY_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml';",
    'const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);',
    "redirect: 'manual' };",
    'const built = buildAtlasMatrix(atlas);',
    "pointerVersion = ptrText.replace(/\\.ya?ml$/i, '');",
    'return { matrix: built.matrix, version: pointerVersion || built.version };',
  ]) {
    assert.ok(body.includes(needle), `the network shell keeps …${needle.slice(0, 60)}…`);
  }
  assert.equal(countMatches(syncSource, /throw new Error\('Invalid ATLAS YAML: no tactics found'\);/g), 2, 'both no-tactics guards stay');
  assert.equal(countMatches(syncSource, /await loadAtlasYaml\(/g), 2, 'both fetch paths parse through the imported loader');
  assert.match(syncSource, /import \{ loadAtlasYaml, buildAtlasMatrix \} from '\.\.\/atlas-parse\.js';/, 'the T15 parse import is untouched');
  assert.match(syncSource, /export \{ loadAtlasYaml, uniqBySource, buildAtlasMatrix \} from '\.\.\/atlas-parse\.js';/, 'the T15 facade re-export is untouched');
});

test('The utils/api re-export chain is identity-equal — no re-wrapping, no specifier churn', () => {
  assert.ok(atlasSyncNs.fetchSourceExcerpt, 'atlas-sync still exports fetchSourceExcerpt');
  assert.equal(atlasSyncNs.fetchSourceExcerpt, apiIndexNs.fetchSourceExcerpt,
    'the api index re-export is a stateless pass-through (same function object)');
  assert.equal(atlasSyncNs.fetchSourceExcerpt, apiNs.fetchSourceExcerpt,
    'the api.js re-export is a stateless pass-through (same function object)');
  for (const name of CONSUMER_NAMES) {
    assert.ok(htmlExcerptNs[name], `${name} resolves from html-excerpt.js`);
  }
  const indexSource = readSource('src/utils/api/index.js');
  const apiSource = readSource('src/utils/api.js');
  assert.ok(/export \{[^}]*fetchSourceExcerpt[\s\S]*?from '\.\/atlas-sync\.js';/.test(indexSource), 'index.js still re-exports from ./atlas-sync.js');
  assert.ok(/export \{[^}]*fetchSourceExcerpt[\s\S]*?from '\.\/api\/atlas-sync\.js';/.test(apiSource), 'api.js still re-exports from ./api/atlas-sync.js');
});

// ── behavioral battery against the module ──────────────────────────────────

test('capChars: caller caps pass through; falsy/absurd values clamp to the 1..12000 window', () => {
  assert.equal(MAX_README_CHARS, 12000, 'the README ceiling is exactly 12000 chars');
  assert.equal(MAX_SOURCE_READ_BYTES, 1024 * 1024, 'the byte budget ceiling is exactly 1 MiB');
  assert.equal(capChars(500), 500);
  assert.equal(capChars('300'), 300, 'string caps are coerced through Number');
  assert.equal(capChars(0), 12000, 'a falsy cap falls back to the hard ceiling');
  assert.equal(capChars(undefined), 12000);
  assert.equal(capChars(NaN), 12000);
  assert.equal(capChars(-5), 1, 'caps never drop below 1');
  assert.equal(capChars(200000), 12000, 'caps never exceed the hard ceiling');
  assert.equal(capChars(1), 1);
});

test('decodeHtmlEntities: numeric and hex entities decode, named entities map to their characters', () => {
  assert.equal(decodeHtmlEntities('&#65;'), 'A');
  assert.equal(decodeHtmlEntities('&#x41;'), 'A');
  assert.equal(decodeHtmlEntities('&#x7a;'), 'z');
  assert.equal(decodeHtmlEntities('&nbsp;'), ' ');
  assert.equal(decodeHtmlEntities('&amp;'), '&');
  assert.equal(decodeHtmlEntities('&lt;'), '<');
  assert.equal(decodeHtmlEntities('&gt;'), '>');
  assert.equal(decodeHtmlEntities('&quot;'), '"');
  assert.equal(decodeHtmlEntities('&#39;'), "'");
  assert.equal(decodeHtmlEntities('&apos;'), "'");
  assert.equal(decodeHtmlEntities('&#0;'), '\u0000', 'code point 0 decodes too');
  assert.equal(decodeHtmlEntities(null), '', 'nullish input yields an empty string');
});

test('decodeHtmlEntities: private-use and astral code points are DROPPED, not mangled', () => {
  assert.equal(decodeHtmlEntities('&#xE000;'), '', 'the private-use lower bound drops');
  assert.equal(decodeHtmlEntities('&#xe000;'), '', 'lowercase hex drops too');
  assert.equal(decodeHtmlEntities('&#xF8FF;'), '', 'the private-use upper bound drops');
  assert.equal(decodeHtmlEntities('&#x1F600;'), '', 'astral (emoji) code points drop');
  assert.equal(decodeHtmlEntities('&#128512;'), '', 'decimal astral code points drop');
  assert.equal(decodeHtmlEntities('&#x10FFFF;'), '', 'beyond the astral range drops');
  assert.equal(decodeHtmlEntities('&#xF8FE;'), '', 'just inside the private-use upper bound drops');
  assert.equal(decodeHtmlEntities('&#xF7FF;'), '', 'just below the private-use upper bound still drops');
  assert.equal(decodeHtmlEntities('Hi &#xe000; there &#x1F600; &amp; &lt;done&gt; &nbsp; &quot;q&quot; &#39;apos&#39;'),
    'Hi  there  & <done>   "q" \'apos\'',
    'mixed page text: glyphs vanish, spacing they occupied remains');
});

test('decodeHtmlEntities: single pass — an escaped entity is not re-decoded', () => {
  assert.equal(decodeHtmlEntities('&amp;#65;'), '&#65;', '&amp; becomes & first; the numeric pass already ran, so no double decode');
});

test('extractMainContent: no article/main regions → the source passes through untouched', () => {
  assert.equal(extractMainContent('<div>plain</div>'), '<div>plain</div>');
  assert.equal(extractMainContent(''), '', 'empty input stays empty');
  assert.equal(extractMainContent(undefined), '');
});

test('extractMainContent: the region with the most visible text wins, returned RAW (tags included)', () => {
  const html = '<html><body><article><p>tiny teaser</p></article><main><p>the real main content is the longest text present on this page</p></main></body></html>';
  assert.equal(extractMainContent(html), '<main><p>the real main content is the longest text present on this page</p></main>');
  const flipped = '<html><body><main><p>tiny</p></main><article><p>the real main content is the longest text present on this page</p></article></body></html>';
  assert.equal(extractMainContent(flipped), '<article><p>the real main content is the longest text present on this page</p></article>',
    'the pick is by text length, not by tag kind');
});

test('extractMainContent: script/style content is invisible to the scoring, not to the returned region', () => {
  const html = '<article><script>var huge = "x".repeat(99999);</script><p>real words here</p></article>';
  assert.equal(extractMainContent(html), html, 'the lone candidate wins and is returned verbatim, script and all');
  const noisy = '<article><p>side words</p></article><main><script>var junk = 1;</script><style>.x{}</style><p>the actual content lives here</p></main>';
  assert.equal(extractMainContent(noisy), '<main><script>var junk = 1;</script><style>.x{}</style><p>the actual content lives here</p></main>',
    'script/style text does not inflate a region’s score');
});

test('extractMainContent: a textless region loses to the untouched source', () => {
  assert.equal(extractMainContent('<article></article><p>outside text</p>'),
    '<article></article><p>outside text</p>',
    'best.len === 0 is not > 0, so the full source is returned');
});

test('smartExcerpt: short, blank and nullish text pass through (trimmed) or empty', () => {
  assert.equal(smartExcerpt('  short text  ', 100), 'short text', 'the passthrough trims');
  assert.equal(smartExcerpt('', 100), '');
  assert.equal(smartExcerpt('   ', 100), '', 'whitespace-only text is empty');
  assert.equal(smartExcerpt(null, 100), '');
  assert.equal(smartExcerpt(undefined), '');
  assert.equal(smartExcerpt('b'.repeat(140), 200), 'b'.repeat(140), 'exact-fit length is a passthrough');
});

test('smartExcerpt: the truncation is lede + separator + centered middle slice (exact arithmetic)', () => {
  assert.equal(smartExcerpt('b'.repeat(140), 100),
    'b'.repeat(60) + SEPARATOR + 'b'.repeat(24),
    'head = floor(100*0.6) = 60; mid = 100-60-16 = 24; midStart = floor((140-24)/2) = 58');
  const marked = 'a'.repeat(30) + 'MIDDLE-MARKER' + 'z'.repeat(100); // 143 chars
  const out = smartExcerpt(marked, 100);
  assert.equal(out, 'a'.repeat(30) + 'MIDDLE-MARKER' + 'z'.repeat(17) + SEPARATOR + 'z'.repeat(24),
    'the lede spans the first 60 chars; the middle slice is chars 59..82 (all z)');
  assert.equal(out.length, 60 + SEPARATOR.length + 24, 'lede + separator + mid adds up to maxChars');
});

test('smartExcerpt: tiny caps can EXCEED maxChars — the separator is not squeezed out', () => {
  const out = smartExcerpt('012345678901234567890123456789', 20);
  assert.equal(out, '012345678901' + SEPARATOR, 'head=12, mid=20-12-16=-8 → the middle slice is empty but the separator survives');
  assert.equal(out.length, 28, 'the result overshoots the requested cap (characterized baseline quirk)');
});

test('smartExcerpt: the separator is exactly "\\n… (truncated)…\\n" (16 chars, U+2026 ellipses)', () => {
  assert.equal(SEPARATOR.length, 16);
  assert.ok(SEPARATOR.startsWith('\n… (') && SEPARATOR.endsWith(')…\n'));
});

test('stripHtml: tags, scripts, styles, comments and noscript all vanish; whitespace collapses', () => {
  assert.equal(stripHtml('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(stripHtml('<div><script>var x=1;</script><style>.a{}</style><!-- c --><noscript>ns</noscript><p>kept text</p></div>'), 'kept text');
  assert.equal(stripHtml('   '), '');
  assert.equal(stripHtml(null), '');
});

test('stripHtml: entities decode AFTER the tag strip, so escaped markup surfaces as text', () => {
  assert.equal(stripHtml('<p>&lt;i&gt;hi&lt;/i&gt;</p>'), '<i>hi</i>');
  assert.equal(stripHtml('<p>A &amp; B</p>'), 'A & B');
});

test('stripHtml: integrates the largest-region pick and the decode in one pass', () => {
  assert.equal(
    stripHtml('<html><head><title>Main Pick</title></head><body><article><p>tiny teaser</p></article><main><p>the real main content is the longest text present on this page</p></main></body></html>'),
    'the real main content is the longest text present on this page',
    'the <main> region wins over the smaller <article>, the title stays out'
  );
});

// extractArticle is directly testable (it carries the Readability import) —
// including the guard behavior for the no-DOMParser path.
test('extractArticle: extracts a substantial article via Readability and reports its title', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const original = globalThis.DOMParser;
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    const html = '<html><head><title>Doc Title</title></head><body><nav>Home Links</nav>' +
      '<article><h1>Real Story</h1><p>' + 'The substantial article body goes here. '.repeat(15) + '</p></article></body></html>';
    const art = extractArticle(html);
    assert.ok(art, 'an article over the 300-char threshold extracts');
    assert.ok(art.text.includes('The substantial article body goes here.'), 'the body text is kept');
    assert.ok(!art.text.includes('Home Links'), 'nav chrome is dropped');
    assert.equal(typeof art.title, 'string', 'the title rides along');
  } finally {
    globalThis.DOMParser = original;
  }
});

test('extractArticle: the typeof guard returns null without a DOMParser (node-testable purity)', () => {
  const original = globalThis.DOMParser;
  delete globalThis.DOMParser;
  try {
    assert.equal(extractArticle('<p>whatever</p>'), null, 'no DOMParser → null before Readability is ever touched');
  } finally {
    globalThis.DOMParser = original;
  }
});

test('extractArticle: a thin article (under 300 chars) yields null — callers fall back to stripHtml', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const original = globalThis.DOMParser;
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    assert.equal(extractArticle('<html><body><article><p>too short to matter</p></article></body></html>'), null);
    assert.equal(extractArticle(''), null, 'empty input extracts nothing');
  } finally {
    globalThis.DOMParser = original;
  }
});

test('extractArticle: a Readability blow-up is caught, warned and mapped to null', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const original = globalThis.DOMParser;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args[0]);
  try {
    globalThis.DOMParser = dom.window.DOMParser;
    dom.window.DOMParser.prototype.parseFromString = () => { throw new Error('parse exploded'); };
    assert.equal(extractArticle('<html><body><p>text</p></body></html>'), null);
    assert.ok(warnings.some((w) => String(w).includes('Readability extraction failed')), 'the failure is warned, not thrown');
  } finally {
    console.warn = originalWarn;
    globalThis.DOMParser = original;
  }
});

// ── readBoundedText — the bounded-read + byte-cap semantics ────────────────

const enc = new TextEncoder();
const streamRes = (chunks, { closeAtEnd = true } = {}) => {
  const state = { cancelled: false };
  let next = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(enc.encode(chunks[next++]));
      if (closeAtEnd && next >= chunks.length) controller.close();
    },
    cancel() { state.cancelled = true; }
  });
  return { res: { ok: true, status: 200, headers: { get: () => null }, body }, state };
};

test('readBoundedText: chunks under the budget decode in order and the reader is never cancelled', async () => {
  const c1 = 'a'.repeat(40000);
  const c2 = 'b'.repeat(25536); // 65536 total = exactly the budget for maxChars=12000
  const { res, state } = streamRes([c1, c2]);
  assert.equal(await readBoundedText(res, 12000), c1 + c2, 'every byte survives, in arrival order');
  assert.equal(state.cancelled, false, 'total === budget is not an overflow');
});

test('readBoundedText: the budget for maxChars=12000 is 65536 bytes — overflow cancels the reader mid-chunk', async () => {
  const c1 = 'a'.repeat(40000);
  const c2 = 'b'.repeat(40000);
  const { res, state } = streamRes([c1, c2], { closeAtEnd: false });
  const out = await readBoundedText(res, 12000);
  assert.equal(out.length, 65536, 'the output stops at the budget');
  assert.equal(out, c1 + 'b'.repeat(25536), 'the overflowing chunk contributes only its keep prefix (65536-40000)');
  assert.equal(state.cancelled, true, 'the reader must cancel the stream once the budget is exceeded');
});

test('readBoundedText: the byte budget scales with the requested cap up to the 1 MiB ceiling (600000 for 150k chars)', async () => {
  const { res, state } = streamRes(['q'.repeat(600100)], { closeAtEnd: false });
  const out = await readBoundedText(res, 150000); // budget = max(64KiB, min(600000, 1MiB)) = 600000
  assert.equal(out.length, 600000, 'the kept prefix is capped at the scaled budget');
  assert.equal(state.cancelled, true);
});

test('readBoundedText: a stream that ends before emitting any chunk yields the empty string', async () => {
  const { res, state } = streamRes([]);
  assert.equal(await readBoundedText(res, 12000), '');
  assert.equal(state.cancelled, false);
});

test('readBoundedText: without a streaming body it falls back to res.text(), defensively sliced to the budget', async () => {
  assert.equal(await readBoundedText({ text: async () => 'hello' }, 12000), 'hello');
  assert.equal((await readBoundedText({ text: async () => 'z'.repeat(70000) }, 12000)).length, 65536,
    'the fallback slice matches the same 65536 budget');
  assert.equal(await readBoundedText({ text: async () => 'hi' }), 'hi', 'the maxChars default is MAX_README_CHARS');
});

// ── end-to-end — atlas-sync flows through the module ───────────────────────

test('The re-wired excerpt flow is byte-identical for the same inputs (small cap)', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  stubFetch([[(r) => r.url.includes('raw.githubusercontent.com/'), () => textRes('x'.repeat(2000))]]);
  const r = await fetchSourceExcerpt('https://github.com/o/r/blob/main/docs/file.md', 500);
  assert.equal(r.kind, 'github');
  assert.equal(r.excerpt, 'x'.repeat(500), 'the caller cap is honored exactly through the imported pipeline');
  assert.equal(r.note, '');
});

test('The default README cap is still 12000 through the moved MAX_README_CHARS', async () => {
  stubFetch([[(r) => r.url.includes('raw.githubusercontent.com/'), () => textRes('y'.repeat(20000))]]);
  const r = await fetchSourceExcerpt('https://github.com/o/r/blob/main/README.md');
  assert.equal(r.excerpt, 'y'.repeat(12000), 'the hard ceiling rides on the moved constant');
});

test('Web pages strip exactly as before through the imported stripHtml/smartExcerpt', async () => {
  stubFetch([[(_unused) => true, () => textRes('<html><body><p>' + 'b'.repeat(140) + '</p></body></html>')]]);
  const r = await fetchSourceExcerpt('https://example.com/long', 100, undefined, { allowPrivate: true });
  assert.equal(r.excerpt, 'b'.repeat(60) + SEPARATOR + 'b'.repeat(24), 'excerpt output is byte-identical for the same input (A4)');
});

// ── atlas-sync.js is strictly net-smaller ──────────────────────────────────

test('Atlas-sync.js is strictly net-smaller; html-excerpt.js carries the pipeline', () => {
  assert.ok(syncLines < 532, `atlas-sync.js must shrink below its 532-line baseline (got ${syncLines})`);
  assert.ok(syncLines >= 60, `atlas-sync.js keeps its network + flow surface (got ${syncLines} lines)`);
  assert.ok(moduleLines >= 120, `html-excerpt.js must carry the pipeline bodies (got ${moduleLines} lines)`);
  assert.ok(moduleLines <= 200, `html-excerpt.js must stay a pure pipeline module (got ${moduleLines} lines)`);
});

test('extractArticle: a message-less Readability failure is warned and mapped to null', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const original = globalThis.DOMParser;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    globalThis.DOMParser = dom.window.DOMParser;
    dom.window.DOMParser.prototype.parseFromString = () => { throw { nope: true }; };
    assert.equal(extractArticle('<html><body><p>text</p></body></html>'), null);
    const hit = warnings.find((w) => String(w[0]).includes('Readability extraction failed'));
    assert.ok(hit, 'the failure is warned, not thrown');
    assert.deepEqual(hit[1], { nope: true }, 'the raw error object rides along when it has no message');
  } finally {
    console.warn = originalWarn;
    globalThis.DOMParser = original;
    dom.window.close();
  }
});

test('readBoundedText: falsy and negative maxChars resolve to the default floor budget', async () => {
  assert.equal((await readBoundedText({ text: async () => 'z'.repeat(70000) }, 0)).length, 65536, 'a falsy cap falls back to MAX_README_CHARS (64KiB floor budget)');
  assert.equal((await readBoundedText({ text: async () => 'z'.repeat(70000) }, -5)).length, 65536, 'a negative cap clamps to 1 char (still the 64KiB floor)');
});

test('readBoundedText: a present-but-non-streaming body and an empty text() both fall back safely', async () => {
  assert.equal(await readBoundedText({ body: {}, text: async () => 'h' }, 12000), 'h', 'a body without getReader still reads via text()');
  assert.equal(await readBoundedText({ text: async () => '' }, 12000), '', 'an empty text() result stays empty');
  assert.equal(await readBoundedText({ text: async () => null }, 12000), '', 'a null text() result falls back to empty');
});

test('readBoundedText: reader cancel and releaseLock failures are absorbed', async () => {
  const reader = {
    reads: 0,
    async read() { this.reads += 1; return { done: false, value: enc.encode('x'.repeat(40000)) }; },
    async cancel() { throw new Error('cancel failed'); },
    releaseLock() { throw new Error('release failed'); }
  };
  const res = { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => reader } };
  const out = await readBoundedText(res, 12000);
  assert.equal(out.length, 65536, 'the budgeted prefix is still decoded when cancel and releaseLock both fail');
  assert.equal(reader.reads, 2, 'the second chunk pushed past the budget, triggering the cancel path');
});
