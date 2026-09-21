import React, { memo } from 'react';
import { X } from 'lucide-react';

/**
 * ToastContainer - Renders notification toasts
 * Memoized so toast state changes do not re-render the whole application.
 */
export const ToastContainer = memo(function ToastContainer({ toasts, removeToast }) {
  if (!toasts.length) return null;

  return (
    <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 140, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '10px',
          fontSize: '0.82rem', lineHeight: 1.45, boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
          background: t.type === 'error' ? 'rgba(127,29,29,0.92)' : t.type === 'success' ? 'rgba(6,78,59,0.92)' : 'rgba(23,37,84,0.95)',
          border: `1px solid ${t.type === 'error' ? 'rgba(239,68,68,0.5)' : t.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(96,165,250,0.35)'}`,
          color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          <span style={{ flexGrow: 1 }}>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="btn-secondary" style={{ padding: '2px', flexShrink: 0 }}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
});

ToastContainer.displayName = 'ToastContainer';