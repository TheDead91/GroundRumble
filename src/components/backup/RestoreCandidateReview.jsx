import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * ExpandableSection - accessible expand/collapse for security-sensitive details.
 *
 * Collapsed state must clearly signal that security-sensitive changes exist.
 * Expanded details must be fully visible before Apply.
 * Apply must work without requiring physical expansion.
 *
 * Props:
 * - title: section heading
 * - summary: collapsed summary (count/type of changes)
 * - children: detailed content (expanded view)
 * - defaultExpanded: initial state (default false)
 * - severity: 'warning' | 'info' (default 'info')
 */
export function ExpandableSection({ 
  title, 
  summary, 
  children, 
  defaultExpanded = false,
  severity = 'info'
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = () => setExpanded(!expanded);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  const iconColor = severity === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)';
  const borderColor = severity === 'warning' ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)';
  const bgColor = severity === 'warning' ? 'rgba(245,158,11,0.05)' : 'rgba(59,130,246,0.03)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      background: bgColor,
      marginBottom: '10px'
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        {expanded ? (
          <ChevronDown size={16} color={iconColor} style={{ flexShrink: 0 }} />
        ) : (
          <ChevronRight size={16} color={iconColor} style={{ flexShrink: 0 }} />
        )}
        {severity === 'warning' && !expanded && (
          <AlertTriangle size={14} color={iconColor} style={{ flexShrink: 0 }} />
        )}
        <div style={{ flexGrow: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '2px' }}>
            {title}
          </div>
          {!expanded && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {summary}
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{
          padding: '0 12px 12px 36px',
          fontSize: '0.8rem',
          lineHeight: 1.5
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * PromptDiffView - renders exact prompt changes with before/after values.
 */
export function PromptDiffView({ promptDiff }) {
  if (!promptDiff || promptDiff.changed.length === 0) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No prompt changes
      </div>
    );
  }

  return (
    <ExpandableSection
      title="AI Prompt Changes"
      summary={`${promptDiff.changed.length} prompt${promptDiff.changed.length === 1 ? '' : 's'} will be modified`}
      severity="warning"
    >
      {promptDiff.changed.map((change) => (
        <div key={change.key} style={{
          marginBottom: '16px',
          padding: '10px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '6px',
          borderLeft: '3px solid var(--color-warning)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <code style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-primary)' }}>
              {change.label}
            </code>
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(245,158,11,0.2)',
              color: 'var(--color-warning)',
              fontWeight: 600
            }}>
              {change.transition}
            </span>
          </div>
          
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Before:
            </div>
            <pre style={{
              margin: 0,
              padding: '8px',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: '4px',
              fontSize: '0.72rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '200px',
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: change.before === '(built-in default)' ? 'var(--text-muted)' : 'inherit'
            }}>
              {change.before}
            </pre>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              After:
            </div>
            <pre style={{
              margin: 0,
              padding: '8px',
              background: 'rgba(34,197,94,0.1)',
              borderRadius: '4px',
              fontSize: '0.72rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '200px',
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: change.after === '(built-in default)' ? 'var(--text-muted)' : 'inherit'
            }}>
              {change.after}
            </pre>
          </div>
        </div>
      ))}
    </ExpandableSection>
  );
}

/**
 * TestCriteriaDiffView - renders verdict criteria for restored tests.
 */
export function TestCriteriaDiffView({ testCriteriaDiff }) {
  if (!testCriteriaDiff || testCriteriaDiff.tests.length === 0) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No tests with verdict criteria
      </div>
    );
  }

  return (
    <ExpandableSection
      title="Test Verdict Criteria"
      summary={`${testCriteriaDiff.tests.length} test${testCriteriaDiff.tests.length === 1 ? '' : 's'} with verdict criteria`}
      severity="warning"
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
        These fields control how keyword evaluation produces SECURE/VULNERABLE verdicts:
      </div>
      {testCriteriaDiff.tests.map((test, idx) => (
        <div key={`${test.id}-${idx}`} style={{
          marginBottom: '12px',
          padding: '8px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '6px',
          borderLeft: '3px solid var(--color-warning)'
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '6px' }}>
            {test.name}
          </div>
          {test.criteria.map((criterion, cidx) => (
            <div key={`${test.id}-${criterion.field}-${cidx}`} style={{
              marginBottom: '6px',
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '4px'
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '2px' }}>
                {criterion.field}
              </div>
              <div style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                {Array.isArray(criterion.restored) ? (
                  <div>
                    {criterion.restored.map((kw, kwidx) => (
                      <span
                        key={kwidx}
                        style={{
                          display: 'inline-block',
                          margin: '2px 4px 2px 0',
                          padding: '2px 6px',
                          background: 'rgba(59,130,246,0.2)',
                          borderRadius: '3px',
                          fontSize: '0.68rem'
                        }}
                      >
                        "{kw}"
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>{criterion.restored}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </ExpandableSection>
  );
}
