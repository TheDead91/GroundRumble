# AI Prompts

The **AI Prompts** section (in the sidebar) is the **glass-box** side of GroundRumble: every prompt that drives the AI
features is inspectable and editable from the interface. No hidden evaluation logic.

## What you can edit

The section is organized into cards by functionality. Each AI feature has its own prompt, shipped with a sensible
default:

**AI Judge** — evaluates whether each target response resisted or fell for an attack:

- **`judge_system`** — how the AI Judge decides between `SECURE` and `VULNERABLE`.
- **`judge_user`** — the per-evaluation prompt (test specs, target response, evaluator guidelines).

**Source Analysis** — ingests research sources:

- **`propose_system`** — proposes a title and description for a newly added URL source.
- **`assess_system`** — how sources are assessed for relevance/quality before generation.
- **`analyzer_system`** — how sources are turned into threat profiles (relevance, weight, attack vectors).

**Test Generation** — drafts grounded attack payloads from the derived threat profiles:

- **`generator_system`** — how new attack payloads are drafted from the profiles.

**Test Critique** — reviews generated tests:

- **`critic_system`** — how generated tests are critiqued (weak/duplicate tests dropped).

Each editor has a **Reset** button to restore the default. Changes apply immediately and are persisted in your browser.

## Placeholders

Prompts support `{{placeholder}}` tokens that are filled in automatically at runtime:

- `{{techniqueCatalog}}` — the ATLAS techniques available for mapping.
- `{{count}}` — how many tests to generate.
- `{{techniqueName}}` / `{{techniqueId}}` — the technique a test maps to.
- `{{systemPrompt}}` / `{{userPrompt}}` — the target model's system prompt and the attack payload.
- `{{modelResponse}}` — the target model's actual response to evaluate.
- `{{evaluatorPrompt}}` — the judge's evaluator guidelines.

## Why it matters

Because the prompts are fully editable, you can experiment with how the tool reasons — what it counts as a threat, how
it filters weak tests, and how it reaches a verdict — without forking code or maintaining config files.

Prompts are included in **Backup & Restore** exports.
