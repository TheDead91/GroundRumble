// Coverage + behavior of src/utils/reportSanitize.js — printable-report HTML
// must be stripped of scripts, event handlers, and dangerous URLs before it is
// written into a new document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;

const { sanitizeReportHtml, escapeHtml, REPORT_SHELL_START, REPORT_SHELL_END } = await import('../src/utils/reportSanitize.js');

const clean = `<div class="score">42%</div><table><tr><td>ok</td></tr></table>`;

test('sanitizeReportHtml keeps benign report markup', () => {
  const out = sanitizeReportHtml(clean);
  assert.ok(out.includes('42%'));
  assert.ok(out.includes('<table>'));
  assert.ok(out.includes('class="score"'));
});

test('sanitizeReportHtml strips <script> tags', () => {
  const out = sanitizeReportHtml(`${clean}<script>window.top.location='https://evil.example'</script>`);
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('evil.example'));
});

test('sanitizeReportHtml strips inline event handlers and javascript: URLs', () => {
  const out = sanitizeReportHtml(`${clean}<img src=x onerror="alert(1)"><a href="javascript:alert(1)">link</a>`);
  assert.ok(!out.includes('onerror'));
  assert.ok(!out.includes('javascript:'));
});

test('sanitizeReportHtml neutralizes embedded payloads in table cells', () => {
  const payload = `<td>${'</td><td><svg onload=alert(1)>'}</td>`;
  const out = sanitizeReportHtml(`<table><tr>${payload}</tr></table>`);
  assert.ok(!out.includes('onload'), 'event handlers must be stripped');
  assert.ok(!out.includes('alert(1)'), 'payload must be neutralized');
});

test('sanitizeReportHtml tolerates empty/null input', () => {
  assert.equal(sanitizeReportHtml(''), '');
  assert.equal(sanitizeReportHtml(null), '');
  assert.equal(sanitizeReportHtml(undefined), '');
});

test('escapeHtml renders untrusted report fields as literal text', () => {
  assert.equal(escapeHtml('<h1>evil</h1>'), '&lt;h1&gt;evil&lt;/h1&gt;');
  assert.equal(escapeHtml('"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml("it's & \"quoted\""), 'it&#39;s &amp; &quot;quoted&quot;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml('plain text'), 'plain text');
  // Escaping is applied BEFORE sanitization: escaped payloads must survive DOMPurify
  // as inert text rather than being parsed as structure.
  const escaped = escapeHtml('<h1>evil</h1><script>alert(1)</script>');
  const out = sanitizeReportHtml(`<td>${escaped}</td>`);
  assert.ok(out.includes('&lt;h1&gt;'), 'escaped payload must remain literal after sanitize');
  assert.ok(!out.includes('<h1>'), 'the payload must not become a real heading');
  assert.ok(!/<script>alert\(1\)<\/script>/.test(out), 'the escaped script must not be re-parsed into a live script tag');
});

// Strict-config regressions (M4): the report body must not be able to carry
// scriptable, form, frame, or styling/vector elements or attributes.
const BLOCKED_TAGS = ['style', 'form', 'input', 'meta', 'link', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'script'];
for (const tag of BLOCKED_TAGS) {
  test(`sanitizeReportHtml strips forbidden <${tag}> tags from the report body`, () => {
    const out = sanitizeReportHtml(`${clean}<${tag}>evil</${tag}>`);
    assert.ok(!out.includes(`<${tag}`), `<${tag}> must be removed`);
    // Scriptable/stylesheet tags also lose their content; plain text inside
    // removed non-script tags legitimately survives (it becomes inert text).
    if (tag === 'style' || tag === 'script') {
      assert.ok(!out.includes('evil'), `${tag} content must be removed`);
    }
  });
}

test('sanitizeReportHtml strips style/srcset/sandbox/formaction attributes', () => {
  const out = sanitizeReportHtml(
    `${clean}<div style="background:url(//evil.example/steal)" srcset="//evil.example 1x" sandbox="allow-scripts" formaction="//evil.example/pwn">x</div>`
  );
  assert.ok(!out.includes('style='), 'style attribute must be removed');
  assert.ok(!out.includes('srcset='), 'srcset attribute must be removed');
  assert.ok(!out.includes('sandbox='), 'sandbox attribute must be removed');
  assert.ok(!out.includes('formaction='), 'formaction attribute must be removed');
  assert.ok(!out.includes('evil.example'), 'payload URLs must not survive');
});

test('sanitizeReportHtml keeps the class-driven report markup the shell styles', () => {
  const body = `<div class="score">0% <span class="score-note">overall resilience</span></div>` +
    `<table><thead><tr><th class="num">Secure %</th></tr></thead>` +
    `<tbody><tr><td class="status status-vulnerable"><b>VULNERABLE</b></td><td class="reason">because</td></tr></tbody></table>` +
    `<div class="muted footnote">note</div>`;
  const out = sanitizeReportHtml(body);
  for (const cls of ['score-note', 'status-vulnerable', 'reason', 'footnote', 'num']) {
    assert.ok(out.includes(cls), `class "${cls}" must survive`);
  }
  assert.ok(out.includes('<b>VULNERABLE</b>'));
});

// L2: the allow-list must not permit media/anchor tags, so crafted report content
// cannot trigger a remote load (tracking beacon) or an interactive widget.
test('sanitizeReportHtml strips media tags and anchors that could beacon or navigate', () => {
  const mediaTags = ['img', 'video', 'audio', 'source', 'track', 'picture', 'iframe', 'object', 'embed', 'svg', 'math', 'a'];
  const out = sanitizeReportHtml(
    `${clean}<video src="https://evil.example/beacon"><source src="https://evil.example/beacon"><img src="https://evil.example/pixel.png">` +
    `<a href="https://evil.example">link</a>`
  );
  for (const tag of mediaTags) {
    assert.ok(!out.includes(`<${tag}`), `<${tag}> must be stripped from the report`);
  }
  assert.ok(!out.includes('evil.example'), 'no remote destination may survive in the report');
});

test('report shell is static markup that closes cleanly around body content', () => {
  assert.ok(REPORT_SHELL_START.startsWith('<!DOCTYPE html>'));
  assert.ok(REPORT_SHELL_START.includes('<style>'), 'the shell owns the report stylesheet');
  assert.ok(REPORT_SHELL_START.trimEnd().endsWith('<body>'));
  assert.equal(REPORT_SHELL_END, '</body></html>');
});