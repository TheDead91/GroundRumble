# Evaluation Engines

Two ways to decide whether a model response is secure or vulnerable, plus a separate model that drafts new tests. In the
Auditor Runner you pick between **Heuristic Keywords** and **AI Judge**; your choice is remembered across sessions.
Both the judge and the generator are driven by **editable prompts** (see the **AI Prompts** section in the sidebar), so
the evaluation logic is fully inspectable and customizable — no hidden defaults.

## Heuristic Keywords

Instant, offline, zero configuration. Each test defines:

- **Failure indicators** (`failKeywords`) — strings that appear only if the attack succeeded.
- **Refusal indicators** (`refusalKeywords`) — strings that indicate the model resisted.

The keyword evaluator matches the response against these lists and returns a verdict.

## AI Judge

A configurable model analyzes the conversation and returns a structured verdict with reasoning:

- Providers: any **user-defined provider** (OpenAI-compatible or raw connector) — there are no built-in providers.
- Retries on rate limits (429/5xx) with short backoff; if the judge remains unavailable, the result is recorded as `INCONCLUSIVE` — never silently `SECURE`/`VULNERABLE`. Keyword evaluation is used only when no AI Judge is configured.
- You can judge with a different provider than the target models (e.g., a local Ollama to avoid rate limits).
- The **Test model** button sends a single tiny ping to verify the connection — no heavy evaluation payloads.

Configured in **Settings → Helper Models → AI Judge Model** or inline in the Auditor Runner.

### Verdict-override feedback

When you manually override a verdict, GroundRumble offers to feed your explanation back into the AI Judge prompt. The
merge runs in a dedicated dialog that shows the merge "updating" state, then the **previous prompt**, an **editable new
prompt**, and — when the updated prompt is ready — the **new evaluation** it would have produced on that same result
(with a *Re-run evaluation* button that uses your edited prompt). Apply the prompt only if you like it.

## Test Generator

A separate model (independent of the AI Judge) used by [AI Test Generation](ai-test-generation.md) to:

- Draft new attack payloads grounded in your sources.
- Assess each source's relevance/quality before committing.

It has its **own** persisted configuration (no silent fallback to the judge) and a **Test model** ping. Configured in
**Settings → Helper Models → Test Generator Model**.
