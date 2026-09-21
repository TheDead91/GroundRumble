import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceOf = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const moduleSource = sourceOf('src/utils/report-builder.js');
const appSource = sourceOf('src/App.jsx');
const dashboardSource = sourceOf('src/components/views/DashboardView.jsx');
const auditDetailSource = sourceOf('src/hooks/useAuditDetail.js');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
const report = await import('../src/utils/report-builder.js');
const { REPORT_SHELL_START, REPORT_SHELL_END } = await import('../src/utils/reportSanitize.js');

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? sourceFiles(path) : [path];
});

test('Report builders have one pure canonical home outside App.jsx', () => {
  for (const name of ['buildPrintableReportHtml', 'openPrintableReport', 'buildModelReportBody', 'buildRunReportBody']) {
    const declaration = new RegExp(`^[ \\t]*(?:export[ \\t]+)?(?:const[ \\t]+|function[ \\t]+)${name}\\b`, 'gm');
    const sites = sourceFiles(join(root, 'src'))
      .map((path) => [path.slice(root.length + 1), sourceOf(path.slice(root.length + 1)).match(declaration)?.length ?? 0])
      .filter(([, count]) => count > 0);
    assert.deepEqual(sites, [['src/utils/report-builder.js', 1]], `${name} declaration sites`);
  }
  assert.doesNotMatch(moduleSource, /from ['"]react|\buse(?:State|Effect|Context|Ref|Memo)\b|\.\.\/context\//);
  assert.match(moduleSource, /from '\.\/reportSanitize\.js';/);
  assert.match(moduleSource, /from '\.\/audit-record\.js';/);
  assert.doesNotMatch(appSource, /const (?:openPrintableReport|downloadModelReport|openRunReport)\b|Resilience by MITRE ATLAS Tactic/);
});

test('Dashboard and run-report consumers remain thin data adapters', () => {
  assert.match(dashboardSource, /import \{ buildModelReportBody, openPrintableReport \} from '\.\.\/\.\.\/utils\/report-builder';/);
  assert.match(dashboardSource, /const \[provider, \.\.\.modelParts\] = modelKey\.split\('::'\);/);
  assert.match(dashboardSource, /openPrintableReport\(window, buildModelReportBody\(\{ model, provider, modelResults, tacticStats: perModelTacticStats\[modelKey\] \|\| \{\}, providerLabel \}\), \{ addToast \}\);/);
  assert.match(appSource, /import \{ openPrintableReport, buildRunReportBody \} from '\.\/utils\/report-builder';/);
  assert.match(auditDetailSource, /buildRunReportBody\(\{ results: results\.map\(effectiveDetails\), title, subtitle, meta, providerLabel \}\)/);
  assert.equal((`${dashboardSource}\n${auditDetailSource}`.match(/Unlock your API keys to generate reports\./g) ?? []).length, 2);
  assert.match(auditDetailSource, /Reports require IndexedDB support \(secure context\)\.[\s\S]*No results to report yet\./);
});

test('Trusted shell composition strips hostile body markup', () => {
  const html = report.buildPrintableReportHtml('<h1>Report</h1><script>alert(1)</script><img src=x onerror=alert(2)>');
  assert.ok(html.startsWith(REPORT_SHELL_START));
  assert.ok(html.endsWith(REPORT_SHELL_END));
  assert.match(html, /<h1>Report<\/h1>/);
  assert.doesNotMatch(html, /<script|onerror/i);
});

test('Popup plumbing preserves its CSP, opaque sandbox, and once-only print', () => {
  const popup = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  let prints = 0;
  popup.window.print = () => { prints += 1; };
  dom.window.open = (url, target) => {
    assert.deepEqual([url, target], ['', '_blank']);
    return popup.window;
  };
  assert.equal(report.openPrintableReport(dom.window, '<h1>Body</h1>'), popup.window);
  const doc = popup.window.document;
  assert.equal(doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content, "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  const frame = doc.querySelector('iframe');
  assert.equal(frame.getAttribute('sandbox'), '');
  assert.equal(frame.getAttribute('srcdoc'), report.buildPrintableReportHtml('<h1>Body</h1>'));
  assert.equal(prints, 0);
  frame.dispatchEvent(new popup.window.Event('load'));
  frame.dispatchEvent(new popup.window.Event('load'));
  assert.equal(prints, 1);
});

test('Model and run bodies preserve score math, ordering, escaping, and redaction', () => {
  const now = { toLocaleString: () => 'Sep 8, 2026' };
  const base = { auditId: 'a', targetUid: 'one', testId: '1', techniqueId: 'AML.T0051', testName: 'Probe <x>', tactic: 'Injection', model: 'm1', provider: 'p1', status: 'SECURE', reasoning: 'safe' };
  const results = [
    base,
    { ...base, targetUid: 'two', testId: '2', model: 'm2', status: 'VULNERABLE', reasoning: 'leaked sk-abcdef1234567890' },
    { ...base, targetUid: 'two', testId: '3', model: 'm2', status: 'ERROR' },
  ];
  const modelBody = report.buildModelReportBody({ model: 'm::1', provider: 'p1', modelResults: results, tacticStats: { Injection: { secure: 1, total: 2 } }, now });
  assert.match(modelBody, /50% <span class="score-note">overall resilience<\/span>/);
  assert.match(modelBody, /1 secure · 1 vulnerable · 1 technical errors · 0 empty · 0 inconclusive · 2 valid evaluations/);
  assert.match(modelBody, /Probe &lt;x&gt;/);
  const runBody = report.buildRunReportBody({ results, title: 'Audit <final>', meta: ['Internal <only>'], now });
  assert.match(runBody, /^<h1>Audit &lt;final&gt;<\/h1>/);
  assert.match(runBody, /<td>m1<\/td><td>p1<\/td><td>1\/1<\/td><td>0<\/td><td class="num">100%<\/td>/);
  assert.match(runBody, /<td>m2<\/td><td>p1<\/td><td>0\/1<\/td><td>1<\/td><td class="num">0%<\/td>/);
  assert.match(runBody, /\[REDACTED_KEY\]/);
  assert.doesNotMatch(runBody, /sk-abcdef1234567890/);
});
