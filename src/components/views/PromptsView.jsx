import React from 'react';
import { Cpu, Database, Wand2, ShieldCheck, Scale, ScrollText, Tag, BadgeCheck, Brain, Hammer, Filter, RotateCcw, Sparkles } from 'lucide-react';
import { setPrompt, resetPrompt, DEFAULT_PROMPTS, PROMPT_LABELS, PROMPT_DESCRIPTIONS } from '../../utils/prompts';

/**
 * PromptsView - AI Prompts tab view for inspecting and customizing the
 * prompts that drive analysis, generation, critique, and judging.
 */
export function PromptsView({ promptDraft, setPromptDraft, setPromptUpdate, getPromptOverrides, vaultLocked, vaultPassphraseSet, addToast, judgeConfigured }) {
  return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {[
              {
                title: 'AI Judge',
                tour: 'ai-prompts-judge',
                icon: Cpu,
                desc: 'Evaluates whether each target response resisted or fell for an attack.',
                keys: ['judge_system', 'judge_user']
              },
              {
                title: 'Source Analysis',
                tour: 'ai-prompts-source',
                icon: Database,
                desc: 'Ingests research sources: proposes titles, assesses relevance/quality, and builds threat profiles.',
                keys: ['propose_system', 'assess_system', 'analyzer_system']
              },
              {
                title: 'Test Generation',
                tour: 'ai-prompts-generation',
                icon: Wand2,
                desc: 'Drafts grounded attack payloads from the derived threat profiles.',
                keys: ['generator_system']
              },
              {
                title: 'Test Critique',
                tour: 'ai-prompts-critique',
                icon: ShieldCheck,
                desc: 'Reviews generated tests and drops weak or duplicate ones.',
                keys: ['critic_system']
              }
            ].map(group => {
              const GroupIcon = group.icon;
              const label = (key) => PROMPT_LABELS[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              const keyIcon = {
                judge_system: Scale,
                judge_user: ScrollText,
                propose_system: Tag,
                assess_system: BadgeCheck,
                analyzer_system: Brain,
                generator_system: Hammer,
                critic_system: Filter
              };
              return (
                <div key={group.title} className="glass-card" data-tour={group.tour} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <GroupIcon size={18} color="var(--color-primary)" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{group.title}</h3>
                  </div>
                  {group.keys.map((key, ki) => {
                    const def = DEFAULT_PROMPTS[key];
                    const KeyIcon = keyIcon[key];
                    return (
                      <div key={key}>
                        {ki > 0 && <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '20px 0' }} />}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <KeyIcon size={18} color="var(--color-secondary)" />
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{label(key)}</h3>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                            {PROMPT_DESCRIPTIONS[key] || ''}
                          </p>
                          <textarea
                            value={promptDraft[key] !== undefined ? promptDraft[key] : getPromptOverrides()[key] ?? def}
                            onChange={(e) => setPromptDraft(prev => ({ ...prev, [key]: e.target.value }))}
                            onBlur={() => { setPrompt(key, promptDraft[key] !== undefined ? promptDraft[key] : def); }}
                            rows="6"
                            className="prompt-editor"
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                            <button
                              onClick={() => { resetPrompt(key); setPromptDraft(prev => ({ ...prev, [key]: def })); addToast('Prompt reset to default.'); }}
                              disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                              className="btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '8px 14px' }}
                            >
                              <RotateCcw size={15} /> Reset to default
                            </button>
                            <button
                              onClick={() => setPromptUpdate({ key, state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' })}
                              disabled={(vaultLocked && (vaultPassphraseSet ?? false)) || !judgeConfigured}
                              className="btn-primary"
                              style={{ fontSize: '0.8rem', padding: '8px 14px' }}
                              title="Feed feedback and have the AI rewrite this prompt"
                            >
                              <Sparkles size={15} /> Update with AI
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div className="glass-card" data-tour="ai-prompts-placeholders" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Available placeholders: <code>{'{{techniqueCatalog}}'}</code> <code>{'{{count}}'}</code> <code>{'{{techniqueName}}'}</code>{' '}
              <code>{'{{techniqueId}}'}</code> <code>{'{{systemPrompt}}'}</code> <code>{'{{userPrompt}}'}</code> <code>{'{{modelResponse}}'}</code> <code>{'{{evaluatorPrompt}}'}</code>
            </div>
          </div>
  );
}

export default PromptsView;