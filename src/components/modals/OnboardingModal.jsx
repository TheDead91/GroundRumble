import { GroundRumbleLogo } from '../GroundRumbleLogo';
import { Upload } from 'lucide-react';

export function OnboardingModal({ onboardingOpen, onFinish, onStartTour, onImportBackup }) {
  if (!onboardingOpen) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 96, padding: '20px'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '620px', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px var(--color-primary-glow)' }}>
              <GroundRumbleLogo size={44} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
                Ground<span style={{ color: 'var(--color-primary)' }}>Rumble</span>
              </h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                LLM Security Testing
              </span>
            </div>
          </div>
          <button onClick={onFinish} className="btn-secondary" style={{ padding: '5px', lineHeight: 1 }} title="Skip">
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '20px' }}>
          Welcome! A client-side security auditor that stress-tests LLM models against adversarial MITRE ATLAS techniques.
          Everything stays in your browser — API keys are sent only to the model hosts you choose.
        </p>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          We&apos;ll now guide you through the whole interface: configure your providers and the AI judge, sync the live
          ATLAS matrix, then build a comparison lineup and run your first audit — all by clicking the real buttons.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
          <button
            onClick={() => { onFinish(); onStartTour(); }}
            className="btn-primary"
            style={{ justifyContent: 'center', padding: '12px' }}
          >
            Let&apos;s get started
          </button>
          <label htmlFor="wizard-backup-input" className="btn-secondary" style={{ justifyContent: 'center', padding: '12px', cursor: 'pointer' }}>
            <Upload size={14} style={{ marginRight: '6px' }} /> I have a previous export
          </label>
          <button onClick={onFinish} className="btn-secondary" style={{ justifyContent: 'center', padding: '12px' }}>
            Skip — I already know this tool
          </button>
        </div>
      </div>

      <input
        type="file"
        id="wizard-backup-input"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onImportBackup}
      />
    </div>
  );
}
