# Use Cases

GroundRumble is a **visual LLM security workbench**. These are the three core use cases it is designed for — each targets a different audience, but all share the same workflow: **research-grounded tests, run side-by-side, with evidence you can inspect**.

---

## 1. Private model comparison

**For:** researchers, consultants, and small teams evaluating multiple models.

**The problem:** comparing model safety by hand is slow and inconsistent, and hosted evaluation platforms can require uploading your prompts and results to a third party.

**The workflow:**

1. Configure providers: a local Ollama, hosted models (Groq, Gemini, Hugging Face), a custom endpoint — or use sandbox mode.
2. Assemble a **Comparison Lineup** from any mix of providers.
3. Fire the identical attack suite at every model in one pass.
4. Compare results in the **payload × model matrix** with per-model resilience scores broken down by ATLAS tactic.

**Required setup:** provider keys (or sandbox mode) + an AI Judge model, or the built-in keyword heuristic.

**Result:** an evidence-backed, side-by-side comparison of model behavior under identical conditions — refusal behavior, injection resistance, jailbreak susceptibility, and more.

**What GroundRumble does not claim:** it doesn't prove a model is "secure" — it measures behavior under the suite you chose. Scores are configuration-relative.

---

## 2. Research-grounded red teaming

**For:** security researchers and AppSec teams who want tests they can understand, edit, and defend.

**The problem:** hand-writing adversarial tests is slow; copying attack prompts from blog posts gives you no evidence to back them up.

**The workflow:**

1. Bring in a source: a security article, paper, GitHub repo, URL, or pasted content.
2. GroundRumble extracts the full source and analyzes it into a per-source **threat profile**.
3. The **Test Generator** drafts attack payloads **grounded in the source** — each carries the evidence (`extract`), reasoning, a real ATLAS technique mapping, and self-consistent failure keywords.
4. A **critique pass** drops weak or duplicate tests.
5. Review the survivors and add them to your suite.

**Required setup:** a capable Test Generator model (or use the sandbox), then human review.

**Result:** a reviewable attack suite where every test traces back to its source — reproducible, editable, and defensible.

**What GroundRumble does not claim:** generated tests are only as good as their sources and the generating model. **AI-generated tests require human review before use.**

---

## 3. Guardrail & deployment validation

**For:** enterprises and platform teams that have deployed guardrails (content filters, DLP, prompt-injection defenses, AI gateways) and want to know whether they actually work.

**The problem:** having guardrails configured is not the same as demonstrating they work under adversarial testing — and a guardrail vendor's own metrics aren't independent.

**The workflow:**

1. Configure a **Custom Provider** pointing at your application or gateway endpoint (OpenAI-compatible or a raw HTTP connector).
2. Optionally add a baseline (unprotected) model or endpoint to the same lineup for a protected-vs-unprotected comparison.
3. Run the same adversarial suite against both.
4. Compare what gets **blocked** vs. what **gets through**, and where legitimate requests are incorrectly rejected (false positives).

**Required setup:** a reachable application/gateway endpoint and a custom provider configuration for it.

**Result:** independent evidence about what a guarded deployment actually allows and blocks under a repeatable test suite — before and after policy, model, or gateway changes.

**What GroundRumble does not claim:**

- It does **not** integrate with or replace guardrail products (content filters, DLP, AI gateways) — it tests what a guarded deployment *does* through an endpoint.
- It does **not** currently capture guardrail decision metadata (e.g. which filter triggered, block reason, transform) beyond the final response and verdict.
- It is not a runtime guardrail or continuous monitoring service.

---

## Choosing a use case

| You want to… | Start here |
| --- | --- |
| See how models compare without spending anything | [Quick Start → Sandbox](quickstart.md) |
| Evaluate real models or local models side-by-side | [Quick Start → Compare real models](quickstart.md) |
| Build a suite from research | [AI Test Generation](features/ai-test-generation.md) |
| Validate a guarded deployment | [Providers → Application & gateway targets](providers.md) |
| Understand scoring and limits | [Concepts & Scoring](concepts.md) |
