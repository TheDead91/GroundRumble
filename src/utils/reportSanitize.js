// Sanitizes the printable-report HTML before it is rendered.
//
// The printable report is assembled from two parts:
//   - REPORT_SHELL_START / REPORT_SHELL_END: a static, app-authored document
//     shell (doctype, meta, the stylesheet). It contains NO interpolated data,
//     so it is trusted and never passed through the sanitizer.
//   - The report body: built from model names, test names, reasoning, provider
//     names, and caller-supplied meta — all untrusted until here. It is the
//     only part that flows through sanitizeReportHtml().
//
// The sanitizer is deliberately strict (defense-in-depth): the report is
// rendered inside a sandboxed srcdoc iframe (no scripts, opaque origin), so a
// config regression alone cannot execute in the app's origin. This strict
// allow-list is the second layer for the body content itself.

import DOMPurify from 'dompurify';
import { escapeMarkup } from './escape-markup.js';

let purify = null;
const getPurify = () => {
  if (!purify) {
    purify = typeof DOMPurify === 'function' ? DOMPurify(globalThis.window) : DOMPurify;
  }
  return purify;
};

// Static shell (trusted). Only report body content is interpolated; this
// template contains no user/model/provider-derived values.
export const REPORT_SHELL_START = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GroundRumble Report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;padding:32px;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;border-bottom:2px solid #ddd;padding-bottom:6px}
  .muted{color:#555;font-size:12px}
  .score{font-size:34px;font-weight:800;margin:12px 0 4px}
  .score-note{font-size:14px;font-weight:400;color:#555}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;background:#f3f4f6;padding:8px}
  td{padding:8px;border-bottom:1px solid #eee;vertical-align:top}
  .num{text-align:right}
  .status-secure{color:#16a34a}
  .status-vulnerable{color:#dc2626}
  .status-error,.status-empty,.status-inconclusive{color:#d97706}
  .reason{font-size:0.75em;color:#333}
  .footnote{margin-top:24px}
  .bar{height:8px;background:#eee;border-radius:4px;overflow:hidden;margin-top:4px}
  .bar>div{height:100%;background:#16a34a}
</style></head><body>`;

export const REPORT_SHELL_END = '</body></html>';

// HTML-escape untrusted report fields BEFORE interpolation so attacker-chosen
// text (a test name, a model name, a tactic, reasoning) prints as literal text
// instead of surviving as inert markup. DOMPurify and the sandboxed iframe
// remain layers 2-3; this gives auditors literal fidelity for payloads.
export const escapeHtml = (value) => escapeMarkup(value)
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Strict sanitizer for report BODY content. Rather than a blocklist (which can
// drift out of sync with what the report actually needs), this is a positive
// allow-list restricted to exactly the structural tags the report templates
// emit. Critically it EXCLUDES every media and interactive element — img,
// video, audio, source, track, picture, iframe, object, embed, svg, math, a,
// form, input, textarea, select, button — so a crafted test name, reasoning, or
// meta string can never trigger a remote load (tracking beacon) or interactive
// widget inside the report. Only the `class` and `colspan` attributes are kept
// (the shell styles via classes; empty-state rows use colspan); 'style' and
// other attribute-driven exfiltration surfaces are dropped outright.
export const sanitizeReportHtml = (html) => getPurify().sanitize(String(html ?? ''), {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'p', 'br', 'ul', 'ol', 'li',
    'code', 'pre'
  ],
  ALLOWED_ATTR: ['class', 'colspan']
});
