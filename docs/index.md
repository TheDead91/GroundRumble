# GroundRumble

**A visual, privacy-first LLM security workbench: turn security research into editable attack suites, then compare how different models and deployments hold up — side by side, in your browser.**

Turn security articles, papers, repositories, or pasted research into evidence-backed attack tests mapped to the
[MITRE ATLAS](https://atlas.mitre.org/) framework. Then run the same suite against a whole lineup of AI models and
see, side by side, who holds their ground — every payload mapped, every response judged, every verdict inspectable.
No backend, accounts, or telemetry.

GroundRumble is a **research and testing workbench**, not a replacement for code-first evaluation frameworks or a
runtime guardrail.

**Release status:** prepared `1.0.0` release candidate. The eventual `v1.0.0` tag and public release are still a separate human-authorized action.

## What makes it different

1. **From research to a grounded attack suite** — drop in a security article, paper, GitHub repo, URL, or pasted
   content; GroundRumble extracts the full source and generates tests that carry the evidence, reasoning, ATLAS
   technique mapping, and failure keywords, with a critique pass that drops weak or duplicate tests.
2. **One suite, many models and deployments** — fire the identical attack suite at any mix of models (or a guarded
   endpoint) in one pass and compare results in a payload × model matrix with per-model resilience scores by ATLAS
   tactic.
3. **Glass-box** — every prompt behind analysis, threat profiling, generation, critique, and judging is editable from
   the interface, with an AI-assisted update flow. No hidden evaluation logic.
4. **Private by architecture** — no server, accounts, or telemetry. Keys live in an encrypted browser-only Key Vault
   and go only to the providers you pick.

## Use cases

| Use case | For whom | What you get |
| --- | --- | --- |
| [Private model comparison](use-cases.md#1-private-model-comparison) | Researchers, consultants, small teams | Same payloads and scoring across local, hosted, custom, or sandbox models — data stays in your browser. |
| [Research-grounded red teaming](use-cases.md#2-research-grounded-red-teaming) | Security researchers, AppSec teams | Articles/papers/repos become evidence-backed, ATLAS-mapped attack tests you can review and edit. |
| [Guardrail & deployment validation](use-cases.md#3-guardrail-deployment-validation) | Enterprises, platform teams | Test a guarded/gatewayed endpoint via a custom provider; compare baseline vs. protected behavior. |

## Core workflow

```
Source (article / repo / URL / paste)
        │  Mozilla Readability full-article extraction
        ▼
Threat profile  (relevance + quality, per-source, editable)
        │
        ▼
Generated tests  (evidence + reasoning + ATLAS mapping + keywords)
        │
        ▼
Screening & critique  (drop weak / duplicate tests)
        │
        ▼
Model roster  (any mix of providers or guarded deployments, one pass)
        │
        ▼
Verdicts → resilience scores → payload × model matrix → printable reports
```

## Quick start

| You want to… | Do this |
| --- | --- |
| Try it with no keys | [Quick Start → Sandbox](quickstart.md) |
| Compare real or local models | [Quick Start → Compare real models](quickstart.md) |
| Build a suite from research | [Quick Start → Build a research-grounded suite](quickstart.md) |
| Validate a guarded deployment | [Quick Start → Validate a guarded deployment](quickstart.md) |

## Highlights

| Area | What you get |
| --- | --- |
| **First-run onboarding** | A guided tour walks you through the whole tool by clicking the real buttons. |
| **Sandbox mode** | Simulated secure/vulnerable models — run a full audit with zero API keys. |
| **Providers** | No built-in providers — add any OpenAI-compatible / raw HTTP endpoint (Groq, Gemini, Hugging Face, local Ollama, gateways, or anything else) as a custom provider with quick-fill presets. Model lists preloaded on start, per-provider refresh. |
| **AI Test Generation** | Source-grounded attack payloads via a checkpointed pipeline (Profiles → Screening → Review), with Simple and Advanced interaction modes. |
| **Editable AI prompts** | Inspect and customize the analyzer, generator, critic, assessor, and judge prompts from the interface, with **Update with AI**. |
| **Article fetching** | Full-article extraction via Mozilla Readability — direct browser fetching, with an optional **user-configured external proxy** for sites the browser blocks. |
| **Result overrides** | Manually mark a result Secure / Vulnerable / Inconclusive; it flows into scoring, with an optional feedback loop into the AI Judge prompt. |
| **Key Vault** | IndexedDB storage with optional passphrase encryption and a read-only mode when locked. |

![GroundRumble dashboard](assets/img/dashboard.png){ width="720" }

## Documentation

- [Use Cases](use-cases.md) — the three workflows this tool is built for.
- [Quick Start](quickstart.md) — outcome-based scenarios, from sandbox to guarded deployments.
- [Concepts & Scoring](concepts.md) — verdicts, resilience, overrides, and how to interpret results.
- [Features](features/settings-backup.md) — dashboard, matrix, test library, AI generation, auditor runner, sandbox, and vault.
- [Providers](providers.md) — supported hosts, how keys flow, and application/gateway targets.
- [Security & Privacy](security.md) — the threat model, vault, user-configured proxy, and responsible use.
- [Development](development.md) — building, linting, testing, and project structure.
- [License & Legal](legal.md) — licensing and third-party notices.
