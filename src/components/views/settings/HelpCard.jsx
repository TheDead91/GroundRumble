import React from 'react';
import { HelpCircle, Info } from 'lucide-react';
import { SettingsCardHeader } from './SettingsCardHeader';

/**
 * HelpCard - the Help & Onboarding card. Props-in/events-out: the
 * context-owned handler bodies (clear atlas_onboarding_done + open onboarding;
 * exit to the dashboard + start the tour) stay with SettingsView and arrive as
 * the replay/tour callbacks; the collapse state arrives as a prop (no context
 * reaches inside).
 */
export function HelpCard({ onReplayOnboarding: replayOnboarding, onStartTour: startTour, collapsedSettings }) {
  return (
    <div className="glass-card" data-tour="help-onboarding" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['help'] ? '0' : '14px' }}>
      <SettingsCardHeader settingKey="help" icon={<HelpCircle size={18} color="var(--color-primary)" />} title={'Help & Onboarding'} />
      {!collapsedSettings['help'] && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
        New to GroundRumble? Replay the guided onboarding walkthrough or start an interactive tour of the
        interface to get oriented.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={replayOnboarding}
          className="btn-secondary"
          style={{ justifyContent: 'center', minWidth: '160px' }}
        >
          <HelpCircle size={14} style={{ marginRight: '6px' }} /> Replay onboarding
        </button>
        <button
          onClick={startTour}
          className="btn-secondary"
          style={{ justifyContent: 'center', minWidth: '160px' }}
        >
          <Info size={14} style={{ marginRight: '6px' }} /> Start interface tour
        </button>
      </div>
        </div>
      )}
    </div>
  );
}

export default HelpCard;
