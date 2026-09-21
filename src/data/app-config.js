// Static app-level seed/config data shared by src/App.jsx and
// src/context/ProvidersContext.jsx. This module imports nothing (pure data, cycle-free).

// Quick-fill presets for the "Add Provider" form — OpenAI-compatible hosts added
// through the exact same flow as any other provider, so there is no special
// treatment for any vendor. Models are fetched from each endpoint (the lists
// change often), so presets only pre-fill the endpoint.
export const PROVIDER_PRESETS = [
  { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', modelsEndpoint: 'https://api.groq.com/openai/v1/models', models: [], note: 'Fast, free tier' },
  { name: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/models', models: [], note: 'Google AI Studio — OpenAI-compatible endpoint' },
  { name: 'Hugging Face', endpoint: 'https://router.huggingface.co/v1/chat/completions', modelsEndpoint: 'https://router.huggingface.co/v1/models', models: [], note: 'Serverless router' },
  { name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelsEndpoint: 'https://openrouter.ai/api/v1/models', models: [], note: 'Hundreds of models' },
  { name: 'Ollama (local)', endpoint: 'http://localhost:11434/v1/chat/completions', modelsEndpoint: 'http://localhost:11434/v1/models', models: [], note: 'Local, no key' }
];

// Sandbox pseudo-provider: simulated models available only while demo mode is
// on. It is not a real connector — targets under it are answered from the
// pre-recorded demo responses — but it is surfaced exactly like any other
// provider option so the first-run experience works without any keys.
export const SANDBOX_PROVIDER_ID = 'sandbox';
export const SANDBOX_MODELS = [
  { id: 'Demo Secure', name: 'Demo Secure' },
  { id: 'Demo Vulnerable', name: 'Demo Vulnerable' }
];
