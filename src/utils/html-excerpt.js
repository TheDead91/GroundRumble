// Pure HTML→excerpt pipeline. No fetch, no network. The only global touched is
// DOMParser, guarded by a typeof check so the module stays node-testable:
// without a DOM, extractArticle returns null and callers fall back to the plain
// stripHtml path.
import { Readability } from '@mozilla/readability';

// Prefer the main article content over site chrome. Pages vary a lot: some
// wrap the article in <article>, others in <main>, and many list sidebar
// "latest" teasers as <article> blocks. Collect every <article>/<main> region
// and return the one with the most text — the real content is the largest.
export const extractMainContent = (html) => {
  const src = String(html || '');
  const candidates = [];
  const region = (re) => { const r = re; let mm; while ((mm = r.exec(src))) candidates.push(mm[0]); };
  region(/<article[\s\S]*?<\/article>/gi);
  region(/<main[\s\S]*?<\/main>/gi);
  if (candidates.length === 0) return src;
  const textLen = (s) => s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  let best = { c: src, len: -1 };
  for (const c of candidates) {
    const len = textLen(c);
    if (len > best.len) best = { c, len };
  }
  return best.len > 0 ? best.c : src;
};

// Decodes common named + numeric HTML entities. Numeric entities that map to
// private-use or astral code points (icon-font glyphs, emoji) are dropped — they
// are meaningless to an LLM and would pollute excerpts.
export const decodeHtmlEntities = (html) => String(html || '')
  .replace(/&#(\d+);/g, (_, n) => {
    const cp = Number(n);
    if ((cp >= 0xE000 && cp <= 0xF8FF) || cp > 0xFFFF) return '';
    return String.fromCodePoint(cp);
  })
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
    const cp = parseInt(h, 16);
    if ((cp >= 0xE000 && cp <= 0xF8FF) || cp > 0xFFFF) return '';
    return String.fromCodePoint(cp);
  })
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'");

export const stripHtml = (html) => {
  const body = extractMainContent(String(html || ''));
  return decodeHtmlEntities(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
};

// For very long pages, don't just take the first N chars (often site chrome).
// Return the lede plus a representative middle slice so the model sees real
// content regardless of article length.
export const smartExcerpt = (text, maxChars) => {
  const str = String(text || '').trim();
  if (!str) return '';
  if (str.length <= maxChars) return str;
  const head = Math.floor(maxChars * 0.6);
  const sep = '\n… (truncated)…\n';
  const mid = maxChars - head - sep.length;
  const midStart = Math.floor((str.length - mid) / 2);
  return str.slice(0, head) + sep + str.slice(midStart, midStart + mid);
};

// Extract the main article from any page using Mozilla's Readability algorithm
// (the same approach as Firefox Reader Mode). Works on arbitrary sites, not
// just ones that use <article>/<main>. Returns { text, title } or null (falls
// back to plain stripHtml) when extraction yields nothing substantial.
export const extractArticle = (html) => {
  try {
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const article = new Readability(doc, { charThreshold: 200 }).parse();
    const text = (article && article.textContent ? article.textContent : '').trim();
    if (text.length >= 300) return { text, title: article.title };
  } catch (err) {
    console.warn('Readability extraction failed:', err?.message || err);
  }
  return null;
};

export const MAX_README_CHARS = 12000;

// Honor a caller-requested excerpt cap without ever exceeding the hard README
// ceiling; `Math.max(maxChars, MAX_README_CHARS)` would ignore small caps.
export const capChars = (maxChars) => Math.max(1, Math.min(Number(maxChars) || MAX_README_CHARS, MAX_README_CHARS));

// Hard ceiling on how many response bytes a direct source fetch may buffer
// before cancelling the stream. Prevents `res.text()` from reading an
// arbitrarily large body into memory (a client-side DoS). The budget scales
// with the requested excerpt cap but never exceeds this absolute ceiling.
export const MAX_SOURCE_READ_BYTES = 1024 * 1024;

// Read a response body with a size budget: stream chunks, accumulate up to
// `budget` bytes, then cancel the stream. Returns the decoded text (possibly
// shorter than the full body). Falls back to `res.text()` (defensively sliced)
// when the response has no streaming body (e.g. mocked fetch in tests).
export const readBoundedText = async (res, maxChars = MAX_README_CHARS) => {
  const chars = Math.max(1, Number(maxChars) || MAX_README_CHARS);
  const budget = Math.max(64 * 1024, Math.min(4 * chars, MAX_SOURCE_READ_BYTES));
  const body = res && res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = String((await res.text()) || '');
    return text.length > budget ? text.slice(0, budget) : text;
  }
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > budget) {
        const keep = value.length - (total - budget);
        if (keep > 0) chunks.push(value.subarray(0, keep));
        try { await reader.cancel(); } catch { /* ignore cancel failures */ }
        break;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  if (chunks.length === 0) return '';
  const all = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(all);
};