import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fetchSourceExcerpt } from '../src/utils/api.js';
const fetchFixture = (url, maxChars) => fetchSourceExcerpt(url, maxChars, undefined, { allowPrivate: true });

let savedFetch;
before(() => {
  savedFetch = globalThis.fetch;
  // Provide a DOMParser so the Readability extraction path runs in Node.
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
});

test('Readability extracts the article from a page with nav/footer chrome', async () => {
  const html =
    '<html><head><title>Big Story</title></head><body>' +
    '<nav><ul><li>Home</li><li>Newsletter</li><li>Sign up</li></ul></nav>' +
    '<article><h1>The Important Story</h1>' +
    '<p>' + ('The real body of the article goes here with real substance. '.repeat(120)) + '</p>' +
    '</article>' +
    '<footer>&#59392; Copyright links and junk</footer></body></html>';

  globalThis.fetch = async () => ({ ok: true, text: async () => html });
  const res = await fetchFixture('https://example.com/story', 150000);
  assert.ok(res.excerpt.includes('The Important Story'), 'should keep the article headline');
  assert.ok(res.excerpt.includes('real body of the article'), 'should keep the article body');
  assert.ok(!res.excerpt.includes('Newsletter'), 'should drop nav chrome');
  assert.ok(!res.excerpt.includes('&#'), 'should decode/remove entities');
  assert.ok(res.excerpt.length > 5000, 'should keep the full article');
});

test('prefers the largest article/main region (not a sidebar teaser)', async () => {
  // Mirrors sites like TheHackerNews: many small <article class="latest cf">
  // sidebar teasers, and the real article inside <main>.
  const teaser = (i) => `<article class='latest cf'><a href="#">Latest ${i} &#61593;</a><p>Short teaser text ${i}.</p></article>`;
  const html =
    '<html><body>' +
    teaser(1) + teaser(2) + teaser(3) + teaser(4) +
    '<main class="main clear" id="app">' +
    '<h1>The Real Long Article Title</h1>' +
    '<p>' + ('The full story body has lots of substance and detail. '.repeat(300)) + '</p>' +
    '</main>' +
    teaser(5) +
    '</body></html>';

  globalThis.fetch = async () => ({ ok: true, text: async () => html });
  const res = await fetchFixture('https://example.com/story', 150000);
  assert.ok(res.excerpt.includes('full story body has lots of substance'), 'should keep the main article body');
  assert.ok(!res.excerpt.includes('Latest 3'), 'should not use a sidebar teaser');
  assert.ok(res.excerpt.length > 5000, 'should keep the full article body');
});

test('fetchSourceExcerpt decodes entities, skips chrome, samples long articles', async () => {
  // A noisy long page: nav chrome, private-use icon entities, then a long article.
  const longBody = 'The quick brown fox jumps over the lazy dog. '.repeat(600); // ~5400 chars of article
  const html =
    '<html><head><title>Test Article</title></head><body>' +
    '<nav>Home Newsletter Webinars Sign up &#61593; &#61665;</nav>' +
    '<article><h1>Real Story</h1><p>Start: ' + longBody + '</p><p>Middle marker HERE-BE-MIDDLE. ' + longBody + '</p><p>End marker.</p></article>' +
    '<footer>&#59392; Follow us on social media</footer></body></html>';

  globalThis.fetch = async () => ({
    ok: true,
    text: async () => html
  });

  const res = await fetchFixture('https://example.com/story', 4000);
  assert.ok(res.excerpt, 'excerpt should be non-empty');
  assert.ok(!res.excerpt.includes('&#'), 'HTML entities should be decoded/removed');
  assert.ok(!res.excerpt.includes('Newsletter'), 'nav chrome should be skipped');
  assert.ok(res.excerpt.includes('Real Story'), 'article content should be kept');
  assert.ok(res.excerpt.length <= 4200, 'excerpt should respect the cap');
  // Long article: a middle slice should be represented (not just the head).
  assert.ok(res.excerpt.includes('Middle marker'), 'middle of a long article should be sampled');
  assert.ok(res.excerpt.includes('(truncated)'), 'should indicate truncation');
});

after(async () => { globalThis.fetch = savedFetch; });
