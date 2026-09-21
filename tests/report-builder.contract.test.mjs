// Contract: the printable-report assembly lives in the pure module
// src/utils/report-builder.js and src/App.jsx keeps only thin data-gathering
// bindings (vault gates, modelKeyFor filtering, toasts).
//
// Behavioral suite: imports the real module DIRECTLY (it is pure browser-API
// ESM — Node-importable thanks to extensioned relative imports) and pins the
// exact guarantees:
//
//   - trusted-shell composition through the sanitize pipeline
//     (REPORT_SHELL_START + sanitizeReportHtml(body) + REPORT_SHELL_END)
//   - popup plumbing: exact CSP meta, sandbox='' iframe, srcdoc
//     payload, print deferred to iframe load exactly once, popup-blocked toast
//   - per-model report body: scoring math (valid = not ERROR/EMPTY/INCONCLUSIVE),
//     tactic rows with the 100% empty-total fallback, detail rows with
//     escapeHtml + 300-char reasoning slice, N/A score path
//   - run-report body: export-boundary redaction (redactAuditResult), per-model
//     summary grouped by targetUid||model with em-dash null scores, tactic
//     stats over valid results only, meta/subtitle escaping, default title
//
// Documents are compared byte-for-byte against the golden templates (the
// `Generated:` stamp is made deterministic via the injected `now` clock).
//
// The structural App-cleanup pins (first two tests) fail until App.jsx stops
// building report HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// DOM first: DOMPurify inside reportSanitize binds to the first window it sees.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;

const MODULE_PATH = 'src/utils/report-builder.js';
const { buildPrintableReportHtml, openPrintableReport, buildModelReportBody, buildRunReportBody } = await import('../src/utils/report-builder.js');
const { sanitizeReportHtml, REPORT_SHELL_START, REPORT_SHELL_END, escapeHtml } = await import('../src/utils/reportSanitize.js');
const { redactAuditResult } = await import('../src/utils/audit-record.js');

const sourceOf = (relPath) => {
  const abs = join(root, relPath);
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf8');
};
const moduleSource = sourceOf(MODULE_PATH);
const appSource = sourceOf('src/App.jsx');

// ---------------------------------------------------------------------------
// Structural pins
// ---------------------------------------------------------------------------

const declarationCount = (name, source) =>
  (source.match(new RegExp(`^[ \\t]*(?:export[ \\t]+)?(?:async[ \t]+)?(?:const[ \\t]+|function[ \\t]+)${name}\\b`, 'gm')) || []).length;

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else files.push(abs);
  }
  return files;
}

test('The module is the single canonical home of the report builders', () => {
  assert.ok(moduleSource.length > 0, `${MODULE_PATH} must exist`);
  for (const name of ['buildPrintableReportHtml', 'openPrintableReport', 'buildModelReportBody', 'buildRunReportBody']) {
    const sites = listSourceFiles(join(root, 'src'))
      .map((abs) => {
        const rel = abs.slice(root.length + 1);
        return { rel, count: declarationCount(name, sourceOf(rel)) };
      })
      .filter((s) => s.count > 0);
    assert.equal(sites.length, 1, `${name} must be declared exactly once tree-wide, found: ${sites.map((s) => `${s.rel} (${s.count}x)`).join(', ') || 'nowhere'}`);
    assert.equal(sites[0].rel, MODULE_PATH, `${name} must be declared in ${MODULE_PATH}`);
  }
});

test('App.jsx keeps only thin bindings — no report HTML assembly left behind', () => {
  for (const name of ['openPrintableReport', 'downloadModelReport', 'openRunReport']) {
    assert.equal(declarationCount(name, appSource), 0, `App.jsx must not declare ${name} anymore`);
  }
  for (const anchor of [
    '<h1>GroundRumble Security Audit Report',
    'Resilience by MITRE ATLAS Tactic',
    'Resilience by Model',
    'Generated locally by GroundRumble',
    'overall resilience'
  ]) {
    assert.ok(!appSource.includes(anchor), `App.jsx must no longer contain the report template anchor ${JSON.stringify(anchor)}`);
  }
  assert.ok(
    /from\s+['"]\.\/utils\/report-builder(\.js)?['"]/.test(appSource),
    'App.jsx must consume the report-builder module'
  );
  // printRunReport — the owner of the vault-locked gate toast — may live in
  // src/hooks/useAuditDetail.js. The toast resolves across App ∪ hook at
  // unchanged strength: exactly once across the union, never duplicated,
  // never dropped.
  let auditDetailHookSrc = '';
  try { auditDetailHookSrc = sourceOf('src/hooks/useAuditDetail.js'); } catch { /* hook absent */ }
  const gateToastUnion = (appSource + '\n' + auditDetailHookSrc).split('Unlock your API keys to generate reports.').length - 1;
  assert.equal(
    gateToastUnion,
    1,
    'the vault-locked gate toast stays defined exactly once across App ∪ useAuditDetail (it gates the thin bindings)'
  );
});

test('The module is pure — no React, no app-state hooks, extensioned util imports', () => {
  assert.ok(!/from\s+['"]react/.test(moduleSource), 'no React imports');
  assert.ok(!/\buseState\b|\buseContext\b|\buseEffect\b|\buseRef\b|\buseMemo\b/.test(moduleSource), 'no React hook identifiers');
  assert.ok(!/from\s+['"]\.\.\/context\//.test(moduleSource) && !/from\s+['"]\.\.\/App/.test(moduleSource), 'no app/context imports');
  assert.ok(/from\s+['"]\.\/reportSanitize\.js['"]/.test(moduleSource), 'must compose ./reportSanitize.js (extensioned, Node-importable)');
  assert.ok(/from\s+['"]\.\/audit-record\.js['"]/.test(moduleSource), 'must compose ./audit-record.js for export-boundary redaction');
});

test('The module composes reportSanitize exports (shell, sanitizer, escapeHtml)', () => {
  assert.ok(moduleSource.includes('REPORT_SHELL_START') && moduleSource.includes('REPORT_SHELL_END'), 'trusted shell composition');
  assert.ok(moduleSource.includes('sanitizeReportHtml'), 'body sanitizer composition');
  assert.ok(moduleSource.includes('escapeHtml'), 'pre-interpolation escaping');
});

// ---------------------------------------------------------------------------
// Shared fixtures + helpers
// ---------------------------------------------------------------------------

const STAMP = 'Aug 27, 2026, 12:00:00 PM';
const nowStub = { toLocaleString: () => STAMP };
const footnote = 'Generated locally by GroundRumble. Evaluations that hit technical errors, returned empty responses, or were inconclusive are excluded from resilience scores.';

const hostileName = 'Payload <script>alert(1)</script>';
const longReasoning = 'y'.repeat(305) + 'ENDMARK';
const secretReasoning = 'leaked sk-abcdef123456 in output';

const result = (over) => ({
  auditId: 'a1',
  timestamp: 1700000000000,
  targetUid: 't1',
  testId: 'T-1',
  testName: hostileName,
  techniqueId: 'ATK-1',
  tactic: 'Prompt Injection',
  model: 'gpt-test',
  provider: 'openai',
  status: 'VULNERABLE',
  reasoning: 'ok',
  ...over
});

const modelResults = [
  result({ testId: 'T-1', tactic: 'Prompt Injection', status: 'SECURE' }),
  result({ testId: 'T-2', tactic: 'Prompt Injection', status: 'VULNERABLE' }),
  result({ testId: 'T-3', tactic: 'Prompt Injection', status: 'ERROR', reasoning: '' }),
  result({ testId: 'T-4', tactic: 'Data Exfiltration', status: 'EMPTY' }),
  result({ testId: 'T-5', tactic: 'Data Exfiltration', status: 'INCONCLUSIVE' }),
  result({ testId: 'T-6', tactic: 'Data Exfiltration', status: 'SECURE' }),
  result({ testId: 'T-7', tactic: 'Data Exfiltration', status: 'ERROR' })
];
const tacticStats = {
  'Prompt Injection': { secure: 1, total: 2 },
  'Data Exfiltration': { secure: 1, total: 1 }
};

const canonicalRun = {
  results: [
    result({ testId: 'T-1', tactic: 'Prompt Injection', status: 'VULNERABLE', reasoning: secretReasoning }),
    result({ testId: 'T-2', tactic: 'Data Exfiltration', status: 'SECURE', reasoning: longReasoning }),
    result({ testId: 'T-3', tactic: 'Prompt Injection', status: 'VULNERABLE' }), // overridden to SECURE
    result({ testId: 'T-4', tactic: 'Prompt Injection', status: 'ERROR' }),
    result({ testId: 'T-5', tactic: 'Data Exfiltration', status: 'EMPTY' }),
    result({ testId: 'T-6', tactic: 'Data Exfiltration', status: 'INCONCLUSIVE' }),
    result({ auditId: 'a2', targetUid: undefined, testId: 'T-9', techniqueId: 'ATK-9', model: 'm2', provider: 'meta', status: 'ERROR' })
  ],
  overrides: { 'a1-t1-T-3': { verdict: 'SECURE', reason: '' } },
  opts: {
    title: 'Quarterly Security Audit Report',
    subtitle: 'Run vs prior baseline',
    meta: ['Confidential — internal', 'Scope <b>prod</b>']
  }
};
const allErrorsRun = [
  result({ testId: 'T-1', tactic: 'Prompt Injection', status: 'ERROR' }),
  result({ testId: 'T-2', tactic: 'Data Exfiltration', status: 'ERROR' })
];

// App-side override-effective mapping replica (the module intentionally takes
// already-effective plain data). The key template is pinned exactly from
// src/context/HistoryContext.jsx.
const resultOverrideKey = (r) => `${r.auditId || r.timestamp}-${r.targetUid}-${r.testId}`;
const effectiveDetails = (d) => {
  const o = canonicalRun.overrides[resultOverrideKey(d)];
  return o ? { ...d, status: o.verdict, overrideReason: o.reason } : d;
};

const makePopup = () => {
  const popup = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  let prints = 0;
  popup.window.print = () => { prints += 1; };
  return {
    popup,
    doc: popup.window.document,
    prints: () => prints,
    loadEvent: () => new popup.window.Event('load')
  };
};

const withPopup = (fn) => {
  const p = makePopup();
  dom.window.open = () => p.popup.window;
  try {
    return fn(p);
  } finally {
    dom.window.open = undefined;
  }
};

const withBlockedPopup = (fn) => {
  let openCalls = 0;
  dom.window.open = () => { openCalls += 1; return null; };
  try {
    return fn(() => openCalls);
  } finally {
    dom.window.open = undefined;
  }
};

// ---------------------------------------------------------------------------
// buildPrintableReportHtml
// ---------------------------------------------------------------------------

test('BuildPrintableReportHtml wraps the body in the sanitize pipeline inside the trusted shell', () => {
  const body = '<h1>Hello</h1><table><tr><td class="num">42%</td></tr></table>';
  const expected = REPORT_SHELL_START + sanitizeReportHtml(body) + REPORT_SHELL_END;
  assert.equal(buildPrintableReportHtml(body), expected);
  assert.ok(buildPrintableReportHtml(body).startsWith(REPORT_SHELL_START));
  assert.ok(buildPrintableReportHtml(body).endsWith(REPORT_SHELL_END));
});

test('BuildPrintableReportHtml strips hostile bodies and tolerates empty input', () => {
  const out = buildPrintableReportHtml(`<td>${'</td><td><svg onload=alert(1)>'}</td><script>alert(1)</script>`);
  assert.ok(!out.includes('<script'), 'scripts must not survive');
  assert.ok(!out.includes('onload'), 'event handlers must not survive');
  assert.equal(buildPrintableReportHtml(''), REPORT_SHELL_START + REPORT_SHELL_END);
});

// ---------------------------------------------------------------------------
// openPrintableReport — popup plumbing
// ---------------------------------------------------------------------------

const CSP_CONTENT = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

test('OpenPrintableReport keeps the CSP meta verbatim and the sandboxed iframe posture', () => {
  withPopup((p) => {
    const returned = openPrintableReport(dom.window, '<h1>Body</h1>');
    assert.equal(returned, p.popup.window, 'the popup window is returned on success');
    const meta = p.doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
    assert.ok(meta, 'CSP meta must be present');
    assert.equal(meta.content, CSP_CONTENT);
    const frame = p.doc.querySelector('iframe');
    assert.equal(frame.getAttribute('sandbox'), '', 'iframe must be fully sandboxed');
    assert.equal(frame.getAttribute('title'), 'GroundRumble Report');
    assert.equal(p.doc.title, 'GroundRumble Report');
    assert.equal(p.doc.body.style.margin, '0px');
    assert.equal(frame.getAttribute('srcdoc'), buildPrintableReportHtml('<h1>Body</h1>'));
  });
});

test('OpenPrintableReport defers print to iframe load, exactly once', () => {
  withPopup((p) => {
    openPrintableReport(dom.window, '<h1>Body</h1>');
    const frame = p.doc.querySelector('iframe');
    assert.equal(p.prints(), 0, 'must not print before the iframe loads');
    frame.dispatchEvent(p.loadEvent());
    assert.equal(p.prints(), 1);
    frame.dispatchEvent(p.loadEvent());
    assert.equal(p.prints(), 1, 'the load listener must be once-only');
  });
});

test('OpenPrintableReport toasts the exact popup-blocked message and returns null', () => {
  const toasts = [];
  withBlockedPopup((openCalls) => {
    const returned = openPrintableReport(dom.window, '<h1>Body</h1>', { addToast: (m) => toasts.push(m) });
    assert.equal(openCalls(), 1);
    assert.equal(returned, null);
    assert.deepEqual(toasts, ['Popup blocked — allow popups for this site to open the report.']);
  });
});

// ---------------------------------------------------------------------------
// buildModelReportBody
// ---------------------------------------------------------------------------

test('BuildModelReportBody golden document (canonical fixture)', () => {
  // scoring math: 7 records, 3 valid, 2 secure -> 67%
  assert.equal(buildModelReportBody({ model: 'gpt-x', provider: 'openai', modelResults, tacticStats, now: nowStub }), `<h1>GroundRumble Security Audit Report</h1>
    <div class="muted">Model: <b>gpt-x</b> | Provider: <b>openai</b> | Generated: ${STAMP}</div>
    <div class="score">67% <span class="score-note">overall resilience</span></div>
    <div class="muted">2 secure · 1 vulnerable · 2 technical errors · 1 empty · 1 inconclusive · 3 valid evaluations</div>
    <h2>Resilience by MITRE ATLAS Tactic</h2>
    <table><thead><tr><th>Tactic</th><th>Secure / Tested</th><th class="num">Secure %</th></tr></thead>
    <tbody><tr><td>Prompt Injection</td><td>1/2</td><td class="num">50%</td></tr><tr><td>Data Exfiltration</td><td>1/1</td><td class="num">100%</td></tr></tbody></table>
    <h2>Detailed Results</h2>
    <table><thead><tr><th>Technique</th><th>Attack Payload</th><th>Tactic</th><th>Status</th><th>Reasoning</th></tr></thead>
    <tbody>${modelResults.map((r) => `
      <tr>
        <td>${escapeHtml(r.techniqueId || '-')}</td>
        <td>${escapeHtml(r.testName)}</td>
        <td>${escapeHtml(r.tactic || '-')}</td>
        <td class="status status-${escapeHtml(r.status)}"><b>${escapeHtml(r.status)}</b></td>
        <td class="reason">${escapeHtml((r.reasoning || '').slice(0, 300))}</td>
      </tr>`).join('')}</tbody></table>
    <div class="muted footnote">${footnote}</div>`);
});

test('BuildModelReportBody — N/A score path and empty tactic-stats fallback row', () => {
  const body = buildModelReportBody({
    model: 'broken', provider: 'x',
    modelResults: [result({ testId: 'Z-1', status: 'ERROR', reasoning: '' })],
    tacticStats: {}, now: nowStub
  });
  assert.ok(body.includes('N/A% <span class="score-note">overall resilience</span>'), 'no valid evaluations -> N/A score');
  assert.ok(body.includes('0 secure · 0 vulnerable · 1 technical errors · 0 empty · 0 inconclusive · 0 valid evaluations'));
  assert.ok(body.includes('<tr><td colspan="3">No valid evaluations yet.</td></tr>'), 'empty tactic stats fall back');
});

test('BuildModelReportBody — escaping, 300-char reasoning slice, no Model column, deterministic stamp', () => {
  const body = buildModelReportBody({
    model: 'm::inner', provider: 'p',
    modelResults: [result({ testId: 'Z-2', status: 'SECURE', reasoning: longReasoning })],
    now: nowStub
  });
  assert.ok(body.includes('Model: <b>m::inner</b> | Provider: <b>p</b>'), 'model/provider are taken as plain data');
  assert.ok(body.includes('Generated: ' + STAMP), 'the Generated stamp comes from the injected now clock');
  assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'hostile test names stay literal text');
  assert.ok(!body.includes('<script>'), 'no live script may appear');
  assert.ok(body.includes('y'.repeat(300)), 'reasoning slice includes the first 300 chars');
  assert.ok(!body.includes('ENDMARK'), 'reasoning is sliced at 300 chars');
  assert.ok(body.includes('class="status status-SECURE"'), 'status classes use the raw status value');
  assert.ok(!body.includes('<th>Model</th>'), 'the per-model report has no Model column');
});

// ---------------------------------------------------------------------------
// buildRunReportBody
// ---------------------------------------------------------------------------

test('BuildRunReportBody golden document (canonical fixture, App-side override mapping)', () => {
  // App applies effectiveDetails at its call sites; the module redacts at the
  // export boundary. The golden replicates the pipeline order (redact ->
  // effective) — proven equivalent to (effective -> redact).
  const baselinePipeline = canonicalRun.results.map(redactAuditResult).map(effectiveDetails);
  const valid = baselinePipeline.filter((r) => r.status !== 'ERROR' && r.status !== 'EMPTY' && r.status !== 'INCONCLUSIVE');
  const secure = valid.filter((r) => r.status === 'SECURE').length;
  const vuln = valid.filter((r) => r.status === 'VULNERABLE').length;
  const errs = baselinePipeline.filter((r) => r.status === 'ERROR').length;
  const empties = baselinePipeline.filter((r) => r.status === 'EMPTY').length;
  const inconclusives = baselinePipeline.filter((r) => r.status === 'INCONCLUSIVE').length;
  const score = valid.length > 0 ? Math.round((secure / valid.length) * 100) : null;
  assert.equal(`${secure}/${vuln}/${errs}/${empties}/${inconclusives}/${valid.length}`, '2/1/2/1/1/3');
  assert.equal(score, 67);

  const modelUids = [...new Set(baselinePipeline.map((r) => r.targetUid || r.model))];
  const modelRows = modelUids.map((uid) => {
    const mr = baselinePipeline.filter((r) => (r.targetUid || r.model) === uid);
    const mValid = mr.filter((r) => r.status !== 'ERROR' && r.status !== 'EMPTY' && r.status !== 'INCONCLUSIVE');
    const mSecure = mValid.filter((r) => r.status === 'SECURE').length;
    const mVuln = mValid.filter((r) => r.status === 'VULNERABLE').length;
    const mScore = mValid.length > 0 ? Math.round((mSecure / mValid.length) * 100) : null;
    const m = mr[0];
    return `<tr><td>${escapeHtml(m?.model || uid)}</td><td>${escapeHtml(m?.provider || '-')}</td><td>${mSecure}/${mValid.length}</td><td>${mVuln}</td><td class="num">${mScore === null ? '—' : mScore + '%'}</td></tr>`;
  }).join('');
  const tacticAgg = {};
  valid.forEach((r) => {
    const t = r.tactic || 'Other';
    tacticAgg[t] = tacticAgg[t] || { total: 0, secure: 0 };
    tacticAgg[t].total += 1;
    if (r.status === 'SECURE') tacticAgg[t].secure += 1;
  });
  const tacticRows = Object.entries(tacticAgg).map(([t, s]) => {
    const pct = s.total > 0 ? Math.round((s.secure / s.total) * 100) : 100;
    return `<tr><td>${escapeHtml(t)}</td><td>${s.secure}/${s.total}</td><td class="num">${pct}%</td></tr>`;
  }).join('');
  const detailRows = baselinePipeline.map((r) => `
      <tr>
        <td>${escapeHtml(r.techniqueId || '-')}</td>
        <td>${escapeHtml(r.testName || '-')}</td>
        <td>${escapeHtml(r.tactic || '-')}</td>
        <td>${escapeHtml(r.model || '-')}</td>
        <td class="status status-${escapeHtml(r.status)}"><b>${escapeHtml(r.status)}</b></td>
        <td class="reason">${escapeHtml((r.reasoning || '').slice(0, 300))}</td>
      </tr>`).join('');
  const metaHtml = [
    canonicalRun.opts.subtitle && `<div class="muted">${escapeHtml(canonicalRun.opts.subtitle)}</div>`,
    `<div class="muted">Generated: ${STAMP}</div>`,
    ...canonicalRun.opts.meta.map((m) => escapeHtml(m))
  ].filter(Boolean).join('');
  const golden = `<h1>${escapeHtml(canonicalRun.opts.title)}</h1>
    ${metaHtml}
    <div class="score">${score === null ? '—' : score + '%'} <span class="score-note">overall resilience</span></div>
    <div class="muted">${secure} secure · ${vuln} vulnerable · ${errs} technical errors · ${empties} empty · ${inconclusives} inconclusive · ${valid.length} valid evaluations</div>
    <h2>Resilience by Model</h2>
    <table><thead><tr><th>Model</th><th>Provider</th><th>Secure / Tested</th><th>Vulnerable</th><th class="num">Secure %</th></tr></thead>
    <tbody>${modelRows}</tbody></table>
    <h2>Resilience by MITRE ATLAS Tactic</h2>
    <table><thead><tr><th>Tactic</th><th>Secure / Tested</th><th class="num">Secure %</th></tr></thead>
    <tbody>${tacticRows}</tbody></table>
    <h2>Detailed Results</h2>
    <table><thead><tr><th>Technique</th><th>Attack Payload</th><th>Tactic</th><th>Model</th><th>Status</th><th>Reasoning</th></tr></thead>
    <tbody>${detailRows}</tbody></table>
    <div class="muted footnote">${footnote}</div>`;

  assert.equal(buildRunReportBody({ results: canonicalRun.results.map(effectiveDetails), ...canonicalRun.opts, now: nowStub }), golden);
});

test('BuildRunReportBody redacts at the export boundary', () => {
  const body = buildRunReportBody({ results: canonicalRun.results, now: nowStub });
  assert.ok(body.includes('[REDACTED_KEY]'), 'key material must be scrubbed');
  assert.ok(!body.includes('sk-abcdef123456'), 'raw key material must not survive');
});

test('BuildRunReportBody — default title, em-dash null score, fallback rows on all-error runs', () => {
  const body = buildRunReportBody({ results: allErrorsRun, now: nowStub });
  assert.ok(body.startsWith('<h1>GroundRumble Security Audit Report</h1>'), 'default title applies when opts are omitted');
  assert.ok(body.includes('Generated: ' + STAMP));
  assert.ok(body.includes('— <span class="score-note">overall resilience</span>'), 'no valid evaluations -> em-dash score');
  assert.ok(body.includes('0 secure · 0 vulnerable · 2 technical errors · 0 empty · 0 inconclusive · 0 valid evaluations'));
  assert.ok(body.includes('<tr><td colspan="3">No valid evaluations yet.</td></tr>'), 'empty tactic stats fall back');
  assert.ok(body.includes('<th>Model</th>'), 'run reports carry the Model column');
  assert.ok(body.includes('<td>0/0</td><td>0</td><td class="num">—</td>'), 'per-model summary scores null as an em dash');
});

test('BuildRunReportBody — hostile title/subtitle/meta are escaped, grouping uses targetUid fallback', () => {
  const body = buildRunReportBody({
    results: [result({ testId: 'T-1', status: 'SECURE', targetUid: undefined, model: 'solo-model', provider: 'solo' })],
    title: 'T<i>x</i>',
    subtitle: 'Run <b>42</b>',
    meta: ['Confidential — internal', 'Scope <b>prod</b>'],
    now: nowStub
  });
  assert.ok(body.startsWith('<h1>T&lt;i&gt;x&lt;/i&gt;</h1>'), 'title is escaped');
  assert.ok(body.includes('<div class="muted">Run &lt;b&gt;42&lt;/b&gt;</div>'), 'subtitle is escaped');
  assert.ok(body.includes('Confidential — internalScope &lt;b&gt;prod&lt;/b&gt;'), 'meta items are escaped and concatenated without separators (baseline shape)');
  assert.ok(body.includes('<td>solo-model</td><td>solo</td>'), 'grouping falls back to r.model when targetUid is unset');
});

test('BuildModelReportBody — empty modelResults shows the fallback row (no detail rows)', () => {
  const body = buildModelReportBody({ model: 'm', provider: 'p', modelResults: [], now: nowStub });
  assert.ok(body.includes('<tr><td colspan="5">No evaluations yet.</td></tr>'), 'empty modelResults triggers detail fallback');
  assert.ok(body.includes('N/A% <span class="score-note">overall resilience</span>'));
  assert.ok(body.includes('<tr><td colspan="3">No valid evaluations yet.</td></tr>'), 'empty tacticStats triggers tactic fallback');
});

test('BuildModelReportBody — missing tactic and techniqueId fall back to dash', () => {
  const body = buildModelReportBody({
    model: 'm', provider: 'p',
    modelResults: [result({ testId: 'Z', techniqueId: undefined, tactic: undefined, status: 'SECURE' })],
    now: nowStub
  });
  assert.ok(body.includes('<td>-</td>'), 'missing techniqueId and tactic render as dash');
});

test('BuildModelReportBody — tactic with zero total shows 100% fallback', () => {
  const body = buildModelReportBody({
    model: 'm', provider: 'p',
    modelResults: [result({ testId: 'Z', status: 'SECURE' })],
    tacticStats: { 'Empty Tactic': { secure: 0, total: 0 } },
    now: nowStub
  });
  assert.ok(body.includes('Empty Tactic</td><td>0/0</td><td class="num">100%</td>'), 'pct=100 when total is 0');
});

test('BuildRunReportBody — empty results show all three fallback rows', () => {
  const body = buildRunReportBody({ results: [], now: nowStub });
  assert.ok(body.includes('<tr><td colspan="5">No evaluations yet.</td></tr>'), 'empty model rows fallback');
  assert.ok(body.includes('<tr><td colspan="3">No valid evaluations yet.</td></tr>'), 'empty tactic rows fallback');
  assert.ok(body.includes('<tr><td colspan="6">No evaluations yet.</td></tr>'), 'empty detail rows fallback');
});

test('BuildRunReportBody — tactic "Other" fallback when result has no tactic', () => {
  const body = buildRunReportBody({
    results: [result({ testId: 'O-1', tactic: undefined, status: 'SECURE' })],
    now: nowStub
  });
  assert.ok(body.includes('<td>Other</td>'), 'results without a tactic fall back to Other');
});

test('BuildRunReportBody — missing fields in detail rows fall back to dash', () => {
  const body = buildRunReportBody({
    results: [result({ testId: 'M-1', techniqueId: undefined, testName: undefined, tactic: undefined, model: undefined, reasoning: undefined, status: 'VULNERABLE' })],
    now: nowStub
  });
  assert.ok(/\s*<td>-<\/td>\s*<td>-<\/td>\s*<td>-<\/td>\s*<td>-<\/td>\s*<td class="status status-VULNERABLE">/.test(body), 'missing techniqueId, testName, tactic, model all render as dash');
});

test('BuildRunReportBody — model summary with provider present, score calculated, and subtitle omitted', () => {
  const body = buildRunReportBody({
    results: [
      result({ testId: 'S-1', targetUid: 'u1', model: 'gpt-x', provider: 'openai', status: 'SECURE' }),
      result({ testId: 'S-2', targetUid: 'u1', model: 'gpt-x', provider: 'openai', status: 'VULNERABLE' }),
    ],
    now: nowStub
  });
  assert.ok(body.includes('<td>gpt-x</td><td>openai</td><td>1/2</td><td>1</td><td class="num">50%</td>'), 'per-model row with real provider and calculated score');
  assert.ok(!body.includes('<div class="muted">undefined</div>'), 'no subtitle rendered when none provided');
});

test('OpenPrintableReport falls back to <html> when the popup document has no <head>', () => {
  withPopup((p) => {
    Object.defineProperty(p.doc, 'head', { value: null, configurable: true });
    openPrintableReport(dom.window, '<h1>Body</h1>');
    const meta = p.doc.documentElement.querySelector('meta[http-equiv="Content-Security-Policy"]');
    assert.ok(meta, 'the CSP meta lands on documentElement when head is absent');
    assert.equal(meta.content, CSP_CONTENT);
    const frame = p.doc.documentElement.querySelector('iframe');
    assert.equal(frame.getAttribute('sandbox'), '', 'the sandboxed iframe is still attached');
  });
});

test('OpenPrintableReport swallows win.print() failures when the iframe finishes loading', () => {
  withPopup((p) => {
    let printCalls = 0;
    p.popup.window.print = () => { printCalls++; throw new Error('print denied'); };
    openPrintableReport(dom.window, '<h1>Body</h1>');
    const frame = p.doc.querySelector('iframe');
    assert.doesNotThrow(() => frame.dispatchEvent(p.loadEvent()), 'a failing print must not escape the load handler');
    assert.doesNotThrow(() => frame.dispatchEvent(p.loadEvent()), 'the once-only listener stays inert after firing');
    assert.equal(printCalls, 1, 'printing is attempted only once even when it fails');
  });
});

test('BuildModelReportBody stamps Generated with the current clock when now is omitted', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const body = buildModelReportBody({ model: 'm', provider: 'p', modelResults: [result({ testId: 'N-1', status: 'SECURE' })] });
  assert.ok(body.includes(`Generated: ${new Date(1_800_000_000_000).toLocaleString()}</div>`), 'the default now clock renders the current time');
});

test('BuildRunReportBody model summary falls back to targetUid and dash for unnamed/other-provider results', () => {
  const body = buildRunReportBody({
    results: [result({ testId: 'F-1', targetUid: 'u9', model: undefined, provider: undefined, status: 'SECURE' })],
    now: nowStub
  });
  assert.ok(body.includes('<td>u9</td><td>-</td><td>1/1</td><td>0</td><td class="num">100%</td>'),
    'a result without model/provider renders the targetUid and a dash in the per-model row');
});
