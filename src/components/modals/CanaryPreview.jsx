import { RefreshCw } from 'lucide-react';

export default function CanaryPreview({ canaries, canarySource, prompt, rerunning, onRerun }) {
  if (!Array.isArray(canaries) || canaries.length === 0) return null;

  const stale = canarySource != null && prompt !== canarySource;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', opacity: stale ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span className="form-label" style={{ margin: 0 }}>Canary preview (does this prompt still classify obvious cases correctly?)</span>
        <button
          onClick={onRerun}
          disabled={rerunning}
          className="btn-secondary"
          style={{ fontSize: '0.68rem', padding: '4px 10px' }}
        >
          {rerunning ? <><RefreshCw size={11} className="animate-spin-custom" style={{ marginRight: '6px' }} /> Running…</> : 'Re-run canaries'}
        </button>
      </div>
      {stale && (
        <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)' }}>
          Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.
        </span>
      )}
      {canaries.map((c) => (
        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
          <span style={{ color: c.diverged ? 'var(--color-vulnerable)' : 'var(--color-secondary)', fontWeight: 700 }}>
            {c.diverged ? '✗' : '✓'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{c.name} — expected</span>
          <span className={`badge ${c.expected === 'SECURE' ? 'badge-secure' : c.expected === 'VULNERABLE' ? 'badge-vulnerable' : ''}`}>{c.expected}</span>
          <span style={{ color: 'var(--text-muted)' }}>got</span>
          <span className={`badge ${c.status === 'SECURE' ? 'badge-secure' : c.status === 'VULNERABLE' ? 'badge-vulnerable' : ''}`}>{c.status}</span>
          {c.diverged && <span style={{ color: 'var(--color-vulnerable)' }}>diverged</span>}
        </div>
      ))}
    </div>
  );
}
