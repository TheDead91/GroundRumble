import React, { memo, useEffect, useRef } from 'react';
import { StyledCheckbox } from './StyledCheckbox';
import { redactSensitiveText } from '../utils/redact';

/**
 * ConfirmDialog - A modal dialog for confirm/prompt/choice interactions
 * Memoized so dialog state changes do not re-render the whole application.
 */
export const ConfirmDialog = memo(function ConfirmDialog({ 
  confirmState, 
  setConfirmState, 
  resolveDialog 
}) {
  const inputRef = useRef(null);

  // Auto-focus the input/textarea when dialog opens
  useEffect(() => {
    if (confirmState && inputRef.current) {
      inputRef.current.focus();
    }
  }, [confirmState]);

  if (!confirmState) return null;

  const submitOverride = async (action) => {
    const reason = (confirmState.inputValue || '').trim();
    if (confirmState.busy || (action === 'improve' && !reason)) return;
    setConfirmState(prev => ({ ...prev, busy: true, error: '' }));
    try {
      if (await confirmState.onSave(reason)) resolveDialog({ action, reason });
      else setConfirmState(prev => prev ? { ...prev, busy: false, error: 'Could not save the override. Your previous verdict is unchanged. Retry or cancel.' } : prev);
    } catch (err) {
      setConfirmState(prev => prev ? { ...prev, busy: false, error: `Could not save the override: ${redactSensitiveText(err?.message || err)}` } : prev);
    }
  };

  if (confirmState.type === 'override') {
    const cancel = () => { if (!confirmState.busy) resolveDialog(null); };
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="override-title"
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '560px', padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 id="override-title">{confirmState.message}</h3>
            <button type="button" aria-label="Close override dialog" className="btn-secondary" disabled={confirmState.busy} onClick={cancel}>×</button>
          </div>
          <label htmlFor="override-reason">Reason (optional)</label>
          <textarea id="override-reason" ref={inputRef} className="form-input" value={confirmState.inputValue}
            disabled={confirmState.busy} onChange={e => setConfirmState(prev => ({ ...prev, inputValue: e.target.value }))}
            rows={4} style={{ width: '100%', margin: '8px 0' }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>Improve Judge with AI uses your reason as feedback and may consume provider tokens. You review any proposed Judge prompt changes before applying them.</p>
          {confirmState.error && <p role="alert">{confirmState.error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" disabled={confirmState.busy} onClick={cancel}>Cancel</button>
            <button type="button" className="btn-primary" disabled={confirmState.busy} onClick={() => submitOverride('save')}>Save Override</button>
            <button type="button" className="btn-secondary" disabled={confirmState.busy || !confirmState.inputValue.trim()} onClick={() => submitOverride('improve')}>Improve Judge with AI</button>
          </div>
        </div>
      </div>
    );
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (confirmState.type === 'prompt' && confirmState.inputType === 'textarea') {
        if (!e.shiftKey) {
          e.preventDefault();
          resolveDialog(confirmState.inputValue);
        }
      } else {
        e.preventDefault();
        resolveDialog(confirmState.inputValue);
      }
    }
  };

  // Escape carries Cancel semantics on the dismissible generic variants
  // (confirm → false, choice → 'cancel', prompt → null). The override variant
  // above owns its own Escape/X handling (blocked while busy); workflow modals
  // with their own dismissal contracts are untouched.
  const cancelValue = confirmState.type === 'confirm' ? false : confirmState.type === 'choice' ? 'cancel' : null;
  const handleOverlayKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveDialog(cancelValue);
    }
  };
  const dialogName = String(confirmState.message || 'Confirmation').split('\n')[0].slice(0, 140) || 'Confirmation';

  const handleInputChange = (e) => {
    setConfirmState(prev => prev ? { ...prev, inputValue: e.target.value } : prev);
  };

  const renderButtons = () => {
    if (confirmState.type === 'choice') {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button autoFocus onClick={() => resolveDialog('cancel')} className="btn-secondary">{confirmState.cancelText || 'Cancel'}</button>
          <button onClick={() => resolveDialog('secondary')} className="btn-secondary">{confirmState.secondaryText || 'Save anyway'}</button>
          <button onClick={() => resolveDialog('primary')} className={`btn-primary ${confirmState.primaryColor || ''}`}>{confirmState.primaryText || 'Set up encryption'}</button>
        </div>
      );
    }
    
    if (confirmState.type === 'confirm') {
      return (
        <>
          <button autoFocus onClick={() => resolveDialog(false)} className="btn-secondary">{confirmState.cancelText || 'Cancel'}</button>
          <button onClick={() => resolveDialog(true)} className="btn-primary">{confirmState.primaryText || 'Confirm'}</button>
        </>
      );
    }
    
    // prompt type
    return (
      <>
        <button onClick={() => resolveDialog(null)} className="btn-secondary">{confirmState.cancelText || 'Cancel'}</button>
        <button onClick={() => resolveDialog(confirmState.inputValue)} className="btn-primary">{confirmState.primaryText || 'OK'}</button>
      </>
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={dialogName} onKeyDown={handleOverlayKeyDown} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '22px' }}>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: confirmState.type === 'prompt' ? '14px' : '18px' }}>
          {confirmState.message}
        </div>
        {confirmState.type === 'prompt' && (
          confirmState.inputType === 'textarea' ? (
            <textarea
              ref={inputRef}
              value={confirmState.inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="form-input"
              autoFocus
              style={{ width: '100%', marginBottom: '16px', minHeight: '80px', resize: 'vertical' }}
              rows={4}
            />
          ) : (
            <input
              ref={inputRef}
              type={confirmState.inputType || 'text'}
              value={confirmState.inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="form-input"
              autoFocus
              style={{ width: '100%', marginBottom: '16px' }}
            />
          )
        )}
        {confirmState.type === 'confirm' && confirmState.checkbox && (
          <StyledCheckbox
            checked={confirmState.checkboxValue}
            onChange={(v) => setConfirmState(prev => prev ? { ...prev, checkboxValue: v } : prev)}
            label={confirmState.checkbox}
            style={{ marginBottom: '12px' }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {renderButtons()}
        </div>
      </div>
    </div>
  );
});

ConfirmDialog.displayName = 'ConfirmDialog';
