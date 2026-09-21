import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  List, 
  Terminal, 
  FileCode2, 
  Settings,
  ChevronDown, 
  ChevronUp, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Bell, 
  Trash2,
  AlertTriangle,
  Check,
  Info,
  Lock
} from 'lucide-react';
import { useUI } from '../context/useUI';
import { useProviders } from '../context/ProvidersContext';
import { GroundRumbleLogo } from './GroundRumbleLogo';

// Sidebar navigation items (icon + label)
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'matrix', label: 'ATLAS Matrix', icon: Layers },
  { id: 'tests', label: 'Test Management', icon: List },
  { id: 'runner', label: 'Auditor Runner', icon: Terminal },
  { id: 'prompts', label: 'AI Prompts', icon: FileCode2 },
  { id: 'settings', label: 'Settings', icon: Settings }
];

// Hover-preview menu: which sections each nav item jumps to.
const NAV_PREVIEW = {
  dashboard: [
    { label: 'Overall resilience score', tour: 'dash-overall' },
    { label: 'Resilience by model', tour: 'resilience-by-model' },
    { label: 'Audit history', tour: 'audit-history' }
  ],
  matrix: [
    { label: 'Matrix grid', tour: 'matrix-grid' }
  ],
  tests: [
    { label: 'AI Test Generation', tour: 'ai-gen-pane' },
    { label: 'Test Cases', tour: 'test-cases' },
    { label: 'Test Presets', tour: 'test-presets' }
  ],
  runner: [
    { label: 'Model Comparison Lineup', tour: 'runner-lineup' },
    { label: 'Attack Payloads Selection', tour: 'payload-selection' },
    { label: 'Run Comparison Audit', tour: 'run-audit' }
  ],
  prompts: [
    { label: 'AI Judge', tour: 'ai-prompts-judge' },
    { label: 'Source Analysis', tour: 'ai-prompts-source' },
    { label: 'Test Generation', tour: 'ai-prompts-generation' },
    { label: 'Test Critique', tour: 'ai-prompts-critique' },
    { label: 'Placeholders', tour: 'ai-prompts-placeholders' }
  ],
  settings: [
    { label: 'Providers', tour: 'credentials-panel' },
    { label: 'Helper Models', tour: 'helper-models' },
    { label: 'MITRE ATLAS', tour: 'atlas-sync-settings' },
    { label: 'Proxy', tour: 'cors-card' },
    { label: 'Account & Data', tour: 'account-data' },
    { label: 'Help & Onboarding', tour: 'help-onboarding' }
  ]
};

/**
 * Sidebar - Navigation sidebar component
 */
export function Sidebar({ 
  activeTab, 
  setActiveTab, 
  sidebarCollapsed, 
  toggleSidebar, 
}) {
  const { 
    notificationHistory, 
    clearNotifications, 
    onboardingOpen, 
    finishOnboarding,
    setTourRunning,
    expandedNav,
    setExpandedNav,
    jumpTo,
  } = useUI();
  const { 
    vaultLocked,
    vaultPassphraseSet
  } = useProviders();

  return (
    <aside style={{ 
      width: sidebarCollapsed ? '80px' : '280px', 
      flexShrink: 0,
      background: 'var(--bg-sidebar)', 
      borderRight: '1px solid var(--border-subtle)',
      padding: sidebarCollapsed ? '24px 10px' : '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      transition: 'width 0.2s ease, padding 0.2s ease'
    }}>
      <div style={{ display: 'flex', flexDirection: sidebarCollapsed ? 'column' : 'row', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexGrow: 1, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '6px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px var(--color-primary-glow), inset 0 0 14px rgba(59,130,246,0.08)',
            flexShrink: 0
          }}>
            <GroundRumbleLogo size={40} />
          </div>
          {!sidebarCollapsed && (
            <div style={{ minWidth: 0, overflow: 'hidden', flexShrink: 1, flexGrow: 1 }}>
              <h1 style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Ground<span style={{ color: 'var(--color-primary)' }}>Rumble</span>
              </h1>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                LLM SECURITY TESTING
              </span>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="btn-secondary"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ padding: '7px', flexShrink: 0, justifyContent: 'center' }}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          // When vault is locked, only Dashboard should be accessible
          const locked = vaultLocked && (vaultPassphraseSet ?? false) && item.id !== 'dashboard';
          const preview = NAV_PREVIEW[item.id];
          const open = expandedNav === item.id;
          return (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button 
                  data-tour={`nav-${item.id}`}
                  onClick={() => !locked && setActiveTab(item.id)} 
                  disabled={locked}
                  data-locked={locked}
                  className={`btn-secondary ${active ? 'glass-card-interactive' : ''}`}
                  title={sidebarCollapsed ? (locked ? `${item.label} (locked)` : item.label) : (locked ? `${item.label} — locked (read-only mode)` : undefined)}
                  style={{ 
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start', 
                    padding: sidebarCollapsed ? '10px' : undefined,
                    flexGrow: 1,
                    background: active ? 'rgba(59, 130, 246, 0.1)' : (locked ? 'rgba(255, 0, 0, 0.2)' : 'transparent'),
                    borderColor: active ? 'rgba(59, 130, 246, 0.3)' : (locked ? 'rgba(255, 0, 0, 0.8)' : 'transparent'),
                    color: active ? '#fff' : (locked ? '#ff4444' : 'var(--text-muted)'),
                    borderWidth: locked ? '3px' : '1px',
                    borderStyle: locked ? 'solid' : 'solid',
                  }}
                >
                  <Icon size={18} />
                  {!sidebarCollapsed && item.label}
                  {locked && <Lock size={11} style={{ marginLeft: 'auto', opacity: 1 }} />}
                </button>
                {!locked && !sidebarCollapsed && preview && preview.length > 0 && (
                  <button
                    onClick={() => setExpandedNav(open ? null : item.id)}
                    className="btn-secondary"
                    style={{ padding: '8px', flexShrink: 0 }}
                    title={`${open ? 'Hide' : 'Show'} ${item.label} sections`}
                    aria-expanded={open}
                  >
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>
              {open && !sidebarCollapsed && preview && !locked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '4px 0 6px 18px', paddingLeft: '8px', borderLeft: '1px solid var(--border-subtle)' }}>
                  {preview.map(sub => (
                    <button
                      key={sub.tour + sub.label}
                      onClick={() => { setExpandedNav(null); jumpTo(item.id, sub.tour); }}
                      className="btn-secondary"
                      style={{ justifyContent: 'flex-start', fontSize: '0.72rem', padding: '5px 8px' }}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {sidebarCollapsed ? (
        /* Collapsed sidebar: keep a small notification badge as a heads-up */
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={toggleSidebar}
            className="btn-secondary"
            title={notificationHistory.length > 0 ? `${notificationHistory.length} recent notification(s) — click to view` : 'No recent notifications'}
            style={{ position: 'relative', padding: '8px', justifyContent: 'center' }}
          >
            <Bell size={16} />
            {notificationHistory.length > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                background: 'var(--color-vulnerable)', color: '#fff',
                borderRadius: '50%', minWidth: '14px', height: '14px',
                fontSize: '0.55rem', fontWeight: 700, lineHeight: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px'
              }}>
                {notificationHistory.length > 9 ? '9+' : notificationHistory.length}
              </span>
            )}
          </button>
        </div>
      ) : (
        /* Recent notifications — rolling log (newest first, oldest dropped),
           kept short so it never crowds the menu or overflows the sidebar */
        notificationHistory.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Recent notifications
              </span>
              <button onClick={clearNotifications} className="btn-secondary" title="Clear notification history" style={{ padding: '4px', flexShrink: 0 }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '132px', overflowY: 'auto' }}>
              {notificationHistory.slice(0, 5).map(n => (
                <div key={n.id} title={n.message} style={{
                  display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '0.68rem',
                  color: 'var(--text-muted)', lineHeight: 1.3, cursor: 'default',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  <span style={{ flexShrink: 0, color: n.type === 'error' ? 'var(--color-vulnerable)' : n.type === 'success' ? 'var(--color-secure)' : 'var(--color-secondary)' }}>
                    {n.type === 'error' ? <AlertTriangle size={11} /> : n.type === 'success' ? <Check size={11} /> : <Info size={11} />}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.message}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {!sidebarCollapsed && onboardingOpen && (
        <div style={{ 
          borderTop: '1px solid var(--border-subtle)', 
          paddingTop: '16px',
          background: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 500 }}>
              Welcome to GroundRumble!
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Get started with the interactive tour to learn the key features.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => { finishOnboarding(); setTourRunning(true); }}
              className="btn-primary"
              style={{ flexGrow: 1 }}
            >
              Start Tour
            </button>
            <button 
              onClick={finishOnboarding}
              className="btn-secondary"
              style={{ flexGrow: 1 }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
