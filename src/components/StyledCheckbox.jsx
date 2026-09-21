import React from 'react';

/**
 * StyledCheckbox - A custom styled checkbox component matching the app's design system
 * Glass-card aesthetic with custom checkmark SVG
 */
export const StyledCheckbox = ({ checked, onChange, disabled, label, style, ...props }) => (
  <label style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    color: disabled ? 'var(--text-muted)' : 'inherit',
    userSelect: 'none',
    ...style
  }}>
    <span style={{
      position: 'relative',
      width: '18px',
      height: '18px',
      borderRadius: '4px',
      border: `2px solid ${checked ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
      background: checked ? 'var(--color-primary)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.15s ease',
      boxShadow: checked ? '0 0 0 2px rgba(59,130,246,0.2)' : 'none'
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style={{ stroke: 'white', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <polyline points="6 10 9 13 15 7" />
        </svg>
      )}
    </span>
    {label && <span style={{ lineHeight: 1.4 }}>{label}</span>}
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange?.(e.target.checked)}
      disabled={disabled}
      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      {...props}
    />
  </label>
);