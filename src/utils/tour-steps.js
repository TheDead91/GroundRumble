// Guided-tour step definitions.
// Pure data + closures factory: buildTourSteps(deps) returns the step array the
// <Tour> component walks. Every App-state closure arrives via the deps object —
// the module imports nothing (no React, no contexts) and is node-testable.
export function buildTourSteps({
  setActiveTab, selectedTechniqueRef, targets, presets, DEFAULT_PRESET_ID,
  allTests, selectedTests, running, results, expandedCell, useDemoMode
}) {
  return [
    {
      target: '[data-tour="nav-settings"]',
      onEnter: () => setActiveTab('settings'),
      title: 'Settings',
      body: 'This is Settings — every configuration card lives here: Providers (with the sandbox), Helper Models (AI Judge + Test Generator), the MITRE ATLAS sync, the proxy, Account & Data, and Help. Cards are collapsible. (The AI Prompts editor has its own section in the sidebar.) Let\'s set up your first provider.'
    },
    {
      target: '[data-tour="credentials-panel"]',
      title: 'Providers',
      body: 'Add providers here — any OpenAI-compatible or custom HTTP endpoint, each with its own key (or endpoint) and explicit rate limit. Use "Add Provider" and pick a quick-fill preset (Groq, Gemini, Hugging Face, OpenRouter, Ollama) to pre-fill the endpoint — every provider is configured the same way. Keys live in your browser\'s secure Key Vault, and the Sandbox Configuration block lives in this same card.'
    },
    {
      target: '[data-tour="judge-config"]',
      title: 'AI Judge Model',
      body: 'The AI Judge decides whether each model response is secure or vulnerable. Pick a provider you configured and choose a model — you can even use a different provider than the target models. Click "Test model" to verify it works before continuing.'
    },
    {
      target: '[data-tour="nav-matrix"]',
      onEnter: () => setActiveTab('matrix'),
      title: 'MITRE ATLAS Matrix',
      body: 'GroundRumble is built on the MITRE ATLAS framework — the official adversarial threat model for AI systems. This tab shows every tactic and technique, and each test payload in the suite maps back to one of them.'
    },
    {
      target: '[data-tour="matrix-grid"]',
      onEnter: () => setActiveTab('matrix'),
      waitFor: () => !!selectedTechniqueRef.current,
      autoAdvance: true,
      title: 'Explore a technique',
      body: 'Click any technique card — for example one with the blue dot (it has mapped diagnostic prompts). Selecting it opens a detail panel below with mitigations and the attack payloads that test it.'
    },
    {
      target: '[data-tour="technique-detail"]',
      title: 'Technique details & mapped prompts',
      body: 'This is the technique detail pane. Look at "Recommended Mitigations" and especially "Mapped Diagnostic Prompts" — those are the ready-to-run attack payloads for this technique. Close it with the ✕ when you\'re done and move on.'
    },
    {
      target: '[data-tour="nav-tests"]',
      onEnter: () => setActiveTab('tests'),
      title: 'Test Management',
      body: 'All attack payloads live here: curated presets, auto-generated coverage for every technique, and your own custom tests. You can toggle tests on/off, edit payloads, or create your own.'
    },
    {
      target: '[data-tour="ai-generate"]',
      title: 'AI test generation',
      body: 'You can also have the AI craft brand-new attack payloads from your sources — pick a source above, set a count, and click "Generate tests". In simple mode it runs autonomously and opens the review screen; in advanced mode you can review the Profiles and Screening steps along the way.'
    },
    {
      target: '[data-tour="add-target"]',
      onEnter: () => setActiveTab('runner'),
      waitFor: () => targets.length >= 2,
      autoAdvance: true,
      title: 'Model Comparison Lineup',
      body: 'Now let\'s build your comparison lineup. Two demo targets (Sandbox/Demo Secure and Sandbox/Demo Vulnerable) are pre-loaded so you can run a first audit immediately — replace them with your own provider + model by picking one here and clicking "Add to Comparison"; we need at least 2 models. We will auto-advance as soon as you have 2 targets.'
    },
    {
      target: '[data-tour="preset-select"]',
      waitFor: () => {
        const def = presets.find(p => p.id === DEFAULT_PRESET_ID);
        if (!def) return true; // no Default preset — don't block the tour
        const ids = def.testIds.filter(id => allTests.some(t => t.id === id));
        return ids.length > 0 && selectedTests.length === ids.length && ids.every(id => selectedTests.includes(id));
      },
      autoAdvance: true,
      title: 'Attack Payloads Selection',
      body: 'Choose which payloads to run against your lineup. Open the "Load preset…" dropdown and pick the Default preset (the most interesting curated attacks) — we\'ll auto-advance once it\'s applied. You can also toggle individual tests or save your own presets.'
    },
    {
      target: '[data-tour="run-audit"]',
      waitFor: () => running,
      autoAdvance: true,
      title: 'Run Comparison Audit',
      body: 'Click "Run Comparison Audit" to execute every selected payload against each model in your lineup. As soon as it starts, we\'ll walk you over to the console.'
    },
    {
      target: '[data-tour="show-console"]',
      waitFor: () => !running && results.length > 0,
      autoAdvance: true,
      title: 'Show Console',
      body: 'Click "Show Console" to see the raw log stream of the run — every request, response, evaluation, and error. We\'ll continue automatically once the audit has finished, then move to the results.'
    },
    {
      target: '[data-tour="results-table"]',
      waitFor: () => !!expandedCell,
      autoAdvance: true,
      title: 'Comparison Results',
      body: 'The results table shows every payload against every model, with vulnerable rows grouped at the top. Click a red VULNERABLE cell to expand the full prompt and model response underneath — explore what slipped through.'
    },
    {
      target: '[data-tour="expanded-result"]',
      title: 'The executed test in detail',
      body: 'Here is the full result of that test: the technique, the exact attack prompt sent, the model\'s response, and the judge\'s reasoning for the verdict. This is where you dig into exactly what happened for a specific model on a specific payload.'
    },
    {
      target: '[data-tour="nav-dashboard"]',
      onEnter: () => setActiveTab('dashboard'),
      title: 'Dashboard',
      body: 'Now let\'s look at where everything lands — the Security Dashboard.'
    },
    {
      target: '[data-tour="dash-overall"]',
      title: 'Overall results',
      body: 'The cards on top summarize your audits: overall security score, total audits run, vulnerable models, and models tested.'
    },
    {
      target: '[data-tour="resilience-by-model"]',
      title: 'Resilience Score by Model',
      body: 'This table breaks down each model\'s resilience per MITRE tactic. Click a column header to sort, or generate a printable PDF report for any model.'
    },
    {
      target: '[data-tour="audit-history"]',
      title: 'Audit Logs History',
      body: 'Every audit run is logged here — re-open past results, export PDF reports, or clear the history.'
    },
    {
      target: '[data-tour="sandbox-config"]',
      onEnter: () => setActiveTab('settings'),
      waitFor: () => !useDemoMode,
      title: 'Disable the sandbox',
      body: 'Last step: sandbox mode simulates the comparison targets so no API keys are needed. Turn OFF "Active Sandbox Mode" here so your audits run against the real models. Important: once you leave sandbox, also open the "Helper Models" card and make sure the AI Judge Model (and Test Generator Model) point to a provider you configured — the sandbox only simulates targets, never the judge — otherwise evaluations fall back to keyword checks. Done — you\'re all set!'
    }
  ];
}
