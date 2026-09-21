# Providers

There are **no built-in providers**. Every model host you use is a **user-defined provider** — an
OpenAI-compatible `/v1/chat/completions` host or a raw method/headers/body-template connector — each with its own
endpoint, API key, and requests-per-minute cap. All providers are treated identically in the UI and the engine; the only
convenience is a **quick-fill preset** that pre-fills the endpoint fields for common hosts.

| Connector | Use it for |
| --- | --- |
| **OpenAI-compatible** | Any host exposing `/v1/chat/completions` (and optionally `/v1/models`): Groq, Gemini, Hugging Face, OpenRouter, local Ollama, gateways, or your own app. |
| **Raw** | Anything else — you define the method, custom headers, and a body template with `{{model}}` / `{{systemPrompt}}` / `{{userPrompt}}` / `{{maxTokens}}` placeholders. |

## Adding providers

**Settings → Providers → Add Provider**:

- **Quick-fill presets** pre-fill the endpoint for Groq, Gemini, Hugging Face, OpenRouter, and local Ollama.
- For **both** connectors, custom headers and the HTTP method are honored on every request — a configured
  `Authorization` header takes precedence over the API key field.
- The **Test connection** button checks the endpoint is reachable and that the key authenticates — **without running a
  model completion**, so it never touches your quota. (Model-gated gateways that reject unknown models are detected and
  verified with a single 1-token probe.)
- API keys are sent via headers, never in the request URL.

## Model discovery

Model lists are **preloaded live on app start** from every configured provider, so the pickers are already populated.
Each provider row has a **Refresh models** button to reload its catalog, and a newly saved provider fetches its models
automatically. If a live list can't be loaded or the provider returns no models, you can type a model id manually.

## Application & gateway targets

A provider doesn't have to be a raw model API — it can point at your **application or gateway endpoint**. This is
how you validate a guarded deployment (content filters, DLP, prompt-injection defenses, an AI gateway) with the same
adversarial suite:

- **OpenAI-compatible:** if your app/gateway exposes `/v1/chat/completions`, configure it as a standard provider.
- **Raw connector:** for everything else, use the raw method/headers/body-template connector (`{{model}}`,
  `{{systemPrompt}}`, `{{userPrompt}}`, `{{maxTokens}}` placeholders).

The endpoint must return a response GroundRumble can parse. Gateways that wrap or transform responses may need a raw
connector, and you should review what the "response" actually contains before judging results.

!!! note
    GroundRumble sees the endpoint's final response and verdict. It does **not** capture guardrail decision metadata
    (which filter triggered, block reason, sanitized/transformed content). For a full picture, compare a protected
    endpoint against a baseline (unprotected) model in the same lineup. See
    [Use Cases → Guardrail & deployment validation](use-cases.md#3-guardrail-deployment-validation).

## How requests flow

All requests go **directly from your browser** to the provider hosts. Keys live in your browser's **Key Vault**
(IndexedDB) and are never routed through a third party. Private / loopback / special-use endpoints are blocked unless you
explicitly approve them (`allowPrivate`), and redirects are never followed so credentials can't leak to a different
origin (see [Security](security.md)). The only other exception is optional **article content fetching**, which can
route through a **user-configured external proxy** when the browser blocks the direct request; see
[AI Test Generation](features/ai-test-generation.md).