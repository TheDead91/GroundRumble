// Shared audit-history hygiene helpers: redact a single audit result, redact
// an entire audit record, and summarize an audit record for persistence.
// Pure-logic utility module. Single canonical copy consumed by src/App.jsx,
// src/context/HistoryContext.jsx and src/hooks/useAuditRun.js.
//
// NOTE: sibling utils import './redact' extensionless (Vite-only resolution),
// but this module is imported directly by node:test suites, which require the
// explicit '.js' specifier under bare Node ESM.

import { redactSensitiveText } from './redact.js';

export function buildAuditRecord({ id, timestamp, lineup, isDemo, results, expectedCount, completed }) {
  const targets = lineup.map(target => ({ provider: target.provider, model: target.model }));
  const model = lineup.map(target => target.model).join(', ');
  const provider = lineup.map(target => target.provider).join(', ');
  const vulnerableCount = results.filter(result => result.status === 'VULNERABLE').length;
  const secureCount = results.filter(result => result.status === 'SECURE').length;
  const errorCount = results.filter(result => result.status === 'ERROR').length;
  const emptyCount = results.filter(result => result.status === 'EMPTY').length;
  const inconclusiveCount = results.filter(result => result.status === 'INCONCLUSIVE').length;

  if (completed) {
    return {
      id,
      timestamp,
      targets,
      model,
      provider,
      isDemo,
      totalTests: results.length,
      vulnerableCount,
      secureCount,
      errorCount,
      emptyCount,
      inconclusiveCount,
      completed: true,
      completedCount: results.length,
      expectedCount,
      details: results
    };
  }

  return {
    id,
    timestamp,
    targets,
    model,
    provider,
    isDemo,
    completed: false,
    cancelled: true,
    completedCount: results.length,
    expectedCount,
    totalTests: results.length,
    vulnerableCount,
    secureCount,
    errorCount,
    emptyCount,
    inconclusiveCount,
    details: results
  };
}

/**
 * Redacts sensitive content from an audit result object.
 */
export function redactAuditResult(result) {
  return {
    ...result,
    systemPrompt: redactSensitiveText(result.systemPrompt),
    userPrompt: redactSensitiveText(result.userPrompt),
    response: redactSensitiveText(result.response),
    reasoning: redactSensitiveText(result.reasoning)
  };
}

/**
 * Redacts sensitive content from an entire audit record.
 */
export function redactAuditRecord(record) {
  return {
    ...record,
    details: Array.isArray(record.details) ? record.details.map(redactAuditResult) : []
  };
}

/**
 * Summarizes an audit record by removing detailed prompts and responses.
 */
export function summarizeAuditRecord(record) {
  return {
    ...record,
    details: Array.isArray(record.details) ? record.details.map(result => {
      const {
        systemPrompt: _systemPrompt,
        userPrompt: _userPrompt,
        response: _response,
        reasoning: _reasoning,
        ...summary
      } = result;
      return summary;
    }) : []
  };
}
