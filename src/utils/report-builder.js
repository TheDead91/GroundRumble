// Printable-report assembly.
//
// Pure builder utilities: no React, no app state — every function takes plain
// data and returns strings/windows, so it is Node-importable under node:test.
//
// Trust boundary (mirrors src/utils/reportSanitize.js): a report document is
// assembled from two parts — a static, app-authored shell
// (REPORT_SHELL_START / REPORT_SHELL_END, trusted, never sanitized) and a
// body interpolated from model/test/provider data and caller-supplied meta
// (untrusted; the only part that flows through sanitizeReportHtml()).
// buildPrintableReportHtml composes the two; openPrintableReport renders the
// composed document into a popup whose iframe is fully sandboxed behind a
// restrictive CSP, so even a sanitizer regression cannot execute
// in the app's origin or reach the vault. Body builders redact sensitive
// text at the export boundary via redactAuditResult.

import { sanitizeReportHtml, REPORT_SHELL_START, REPORT_SHELL_END, escapeHtml } from './reportSanitize.js';
import { redactAuditResult } from './audit-record.js';

// Compose a sanitized report body inside the trusted static shell.
export function buildPrintableReportHtml(bodyHtml) {
  return REPORT_SHELL_START + sanitizeReportHtml(bodyHtml) + REPORT_SHELL_END;
}

// Render a printable report in a new window. The sanitized report body is
// wrapped in the trusted static shell and loaded into a sandboxed srcdoc
// iframe, so even a sanitizer regression cannot execute in the app's origin
// or reach the vault (sandbox strips scripts and grants an opaque origin).
// Print is deferred until the iframe has actually loaded its content.
export function openPrintableReport(sourceWindow, bodyHtml, { addToast } = {}) {
  const html = buildPrintableReportHtml(bodyHtml);
  const win = sourceWindow.open('', '_blank');
  if (!win) {
    addToast('Popup blocked — allow popups for this site to open the report.');
    return null;
  }
  const doc = win.document;
  doc.title = 'GroundRumble Report';
  // Tightened CSP for the report popup: the report needs no
  // network access at all, so `connect-src 'none'` (plus no img/font) makes
  // this document an unusable exfil channel even if a sanitizer regression
  // ever slipped markup through.
  const cspMeta = doc.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  (doc.head || doc.documentElement).appendChild(cspMeta);
  doc.body.style.margin = '0';
  const frame = doc.createElement('iframe');
  frame.setAttribute('sandbox', '');
  frame.setAttribute('title', 'GroundRumble Report');
  frame.style.cssText = 'width:100vw;height:100vh;border:0;display:block';
  frame.srcdoc = html;
  frame.addEventListener('load', () => { try { win.print(); } catch { /* not printable in this context */ } }, { once: true });
  doc.body.appendChild(frame);
  return win;
}

// Build the per-model report body (no shell): scoring math, tactic rows and
// detail rows. Plain data in, HTML string out. `providerLabel`, when supplied,
// resolves the stored provider id through the shared provider/model
// display-label contract; without it the raw id is rendered.
export function buildModelReportBody({ model, provider, modelResults, tacticStats = {}, now = new Date(), providerLabel = null }) {
  const resolveProvider = typeof providerLabel === 'function' ? providerLabel : (v) => v;
  const valid = modelResults.filter(r => r.status !== 'ERROR' && r.status !== 'EMPTY' && r.status !== 'INCONCLUSIVE');
  const secure = valid.filter(r => r.status === 'SECURE').length;
  const vuln = valid.filter(r => r.status === 'VULNERABLE').length;
  const errs = modelResults.filter(r => r.status === 'ERROR').length;
  const empties = modelResults.filter(r => r.status === 'EMPTY').length;
  const inconclusives = modelResults.filter(r => r.status === 'INCONCLUSIVE').length;
  const score = valid.length > 0 ? Math.round((secure / valid.length) * 100) : null;

  const tacticRows = Object.entries(tacticStats).map(([tactic, s]) => {
    const pct = s.total > 0 ? Math.round((s.secure / s.total) * 100) : 100;
    return `<tr><td>${escapeHtml(tactic)}</td><td>${s.secure}/${s.total}</td><td class="num">${pct}%</td></tr>`;
  }).join('');

  const detailRows = modelResults.map(r => `
      <tr>
        <td>${escapeHtml(r.techniqueId || '-')}</td>
        <td>${escapeHtml(r.testName)}</td>
        <td>${escapeHtml(r.tactic || '-')}</td>
        <td class="status status-${escapeHtml(r.status)}"><b>${escapeHtml(r.status)}</b></td>
        <td class="reason">${escapeHtml((r.reasoning || '').slice(0, 300))}</td>
      </tr>`).join('');

  return `<h1>GroundRumble Security Audit Report</h1>
    <div class="muted">Model: <b>${escapeHtml(model)}</b> | Provider: <b>${escapeHtml(resolveProvider(provider))}</b> | Generated: ${now.toLocaleString()}</div>
    <div class="score">${score === null ? 'N/A' : score}% <span class="score-note">overall resilience</span></div>
    <div class="muted">${secure} secure · ${vuln} vulnerable · ${errs} technical errors · ${empties} empty · ${inconclusives} inconclusive · ${valid.length} valid evaluations</div>
    <h2>Resilience by MITRE ATLAS Tactic</h2>
    <table><thead><tr><th>Tactic</th><th>Secure / Tested</th><th class="num">Secure %</th></tr></thead>
    <tbody>${tacticRows || '<tr><td colspan="3">No valid evaluations yet.</td></tr>'}</tbody></table>
    <h2>Detailed Results</h2>
    <table><thead><tr><th>Technique</th><th>Attack Payload</th><th>Tactic</th><th>Status</th><th>Reasoning</th></tr></thead>
    <tbody>${detailRows || '<tr><td colspan="5">No evaluations yet.</td></tr>'}</tbody></table>
    <div class="muted footnote">Generated locally by GroundRumble. Evaluations that hit technical errors, returned empty responses, or were inconclusive are excluded from resilience scores.</div>`;
}

// Build the run-report body (no shell) for an arbitrary set of run results.
// `results` items are runner result objects ({ testName, techniqueId, tactic,
// model, provider, status, reasoning }); override-effective statuses are
// applied by the caller (App maps effectiveDetails at its call sites), so
// this builder only redacts at the export boundary. `providerLabel`, when
// supplied, resolves stored provider ids through the shared provider/model
// display-label contract; internal ids stay the stored identity.
export function buildRunReportBody({ results, title = 'GroundRumble Security Audit Report', subtitle = '', meta = [], now = new Date(), providerLabel = null }) {
  const resolveProvider = typeof providerLabel === 'function' ? providerLabel : (v) => v;
  // Redact at the export boundary: live runner results carry raw model output
  // and judge reasoning that may echo secrets; the two history call sites pass
  // already-redacted records, so this is idempotent for them.
  const effectiveResults = results.map(redactAuditResult);
  const valid = effectiveResults.filter(r => r.status !== 'ERROR' && r.status !== 'EMPTY' && r.status !== 'INCONCLUSIVE');
  const secure = valid.filter(r => r.status === 'SECURE').length;
  const vuln = valid.filter(r => r.status === 'VULNERABLE').length;
  const errs = effectiveResults.filter(r => r.status === 'ERROR').length;
  const empties = effectiveResults.filter(r => r.status === 'EMPTY').length;
  const inconclusives = effectiveResults.filter(r => r.status === 'INCONCLUSIVE').length;
  const score = valid.length > 0 ? Math.round((secure / valid.length) * 100) : null;

  // Per-model summary
  const modelUids = [...new Set(effectiveResults.map(r => r.targetUid || r.model))];
  const modelRows = modelUids.map(uid => {
    const mr = effectiveResults.filter(r => (r.targetUid || r.model) === uid);
    const mValid = mr.filter(r => r.status !== 'ERROR' && r.status !== 'EMPTY' && r.status !== 'INCONCLUSIVE');
    const mSecure = mValid.filter(r => r.status === 'SECURE').length;
    const mVuln = mValid.filter(r => r.status === 'VULNERABLE').length;
    const mScore = mValid.length > 0 ? Math.round((mSecure / mValid.length) * 100) : null;
    const m = mr[0];
    return `<tr><td>${escapeHtml(m?.model || uid)}</td><td>${escapeHtml(resolveProvider(m?.provider) || '-')}</td><td>${mSecure}/${mValid.length}</td><td>${mVuln}</td><td class="num">${mScore === null ? '—' : mScore + '%'}</td></tr>`;
  }).join('');

  // Resilience by MITRE ATLAS tactic
  const tacticStats = {};
  valid.forEach(r => {
    const t = r.tactic || 'Other';
    tacticStats[t] = tacticStats[t] || { total: 0, secure: 0 };
    tacticStats[t].total++;
    if (r.status === 'SECURE') tacticStats[t].secure++;
  });
  const tacticRows = Object.entries(tacticStats).map(([t, s]) => {
    const pct = s.total > 0 ? Math.round((s.secure / s.total) * 100) : 100;
    return `<tr><td>${escapeHtml(t)}</td><td>${s.secure}/${s.total}</td><td class="num">${pct}%</td></tr>`;
  }).join('');

  const detailRows = effectiveResults.map(r => `
      <tr>
        <td>${escapeHtml(r.techniqueId || '-')}</td>
        <td>${escapeHtml(r.testName || '-')}</td>
        <td>${escapeHtml(r.tactic || '-')}</td>
        <td>${escapeHtml(r.model || '-')}</td>
        <td class="status status-${escapeHtml(r.status)}"><b>${escapeHtml(r.status)}</b></td>
        <td class="reason">${escapeHtml((r.reasoning || '').slice(0, 300))}</td>
      </tr>`).join('');

  const metaHtml = [
    subtitle && `<div class="muted">${escapeHtml(subtitle)}</div>`,
    `<div class="muted">Generated: ${now.toLocaleString()}</div>`,
    ...meta.map(m => escapeHtml(m))
  ].filter(Boolean).join('');

  return `<h1>${escapeHtml(title)}</h1>
    ${metaHtml}
    <div class="score">${score === null ? '—' : score + '%'} <span class="score-note">overall resilience</span></div>
    <div class="muted">${secure} secure · ${vuln} vulnerable · ${errs} technical errors · ${empties} empty · ${inconclusives} inconclusive · ${valid.length} valid evaluations</div>
    <h2>Resilience by Model</h2>
    <table><thead><tr><th>Model</th><th>Provider</th><th>Secure / Tested</th><th>Vulnerable</th><th class="num">Secure %</th></tr></thead>
    <tbody>${modelRows || '<tr><td colspan="5">No evaluations yet.</td></tr>'}</tbody></table>
    <h2>Resilience by MITRE ATLAS Tactic</h2>
    <table><thead><tr><th>Tactic</th><th>Secure / Tested</th><th class="num">Secure %</th></tr></thead>
    <tbody>${tacticRows || '<tr><td colspan="3">No valid evaluations yet.</td></tr>'}</tbody></table>
    <h2>Detailed Results</h2>
    <table><thead><tr><th>Technique</th><th>Attack Payload</th><th>Tactic</th><th>Model</th><th>Status</th><th>Reasoning</th></tr></thead>
    <tbody>${detailRows || '<tr><td colspan="6">No evaluations yet.</td></tr>'}</tbody></table>
    <div class="muted footnote">Generated locally by GroundRumble. Evaluations that hit technical errors, returned empty responses, or were inconclusive are excluded from resilience scores.</div>`;
}
