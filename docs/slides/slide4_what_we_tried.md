# Slide 4 — What We Tried

## Title
Proof of Concept — Two Approaches Validated

## Description
Before proposing the architecture, two approaches were built and evaluated to validate the core assumptions. Each attempt produced a concrete finding that directly shaped the final design.

---

## Attempt 1 — Azure Built-in Suggester on Primary Index

The natural starting point. Azure AI Search has a built-in suggester that can be configured on any index field with zero additional infrastructure.

```
search-index  →  Built-in Suggester  →  /suggestions API
```

| What Was Tested | Finding |
|---|---|
| Suggester configured on primary index fields | Output was raw, chunked text fragments |
| Prefix matching against chunked content | Suggestions were too long and noisy for autocomplete |
| Zero additional infrastructure | Quality not acceptable for a customer-facing KMS |

**Verdict:** ❌ Wrong data shape. Confirmed we need a dedicated suggestions layer.

---

## Attempt 2 — OpenAI Pipeline + MiniSearch

Built an offline pipeline to validate the curated suggestions concept end to end.

```
search-index  →  Extract titles & sections  →  OpenAI Model  →  MiniSearch (in-memory)
```

| What Was Tested | Finding |
|---|---|
| LLM refinement of extracted titles and sections | Clean, precise, user-ready suggestions |
| MiniSearch loaded with OpenAI suggestions | Sub-millisecond responses, no external dependency |

**Verdict:** ✅ Core concept proven. LLM refinement produces clean suggestions; MiniSearch hits the latency target.

---

## What the POC Validated

| Component | Proven |
|---|---|
| LLM refinement | Produces clean, intent-aligned phrases |
| MiniSearch in-memory tier | Sub-millisecond for common queries |
| Dedicated suggestions layer | Needed — primary index unsuitable for autocomplete |

## What the POC Did Not Cover Yet

| Gap | Addressed In Proposed Architecture |
|---|---|
| Feeding suggestions into a dedicated Azure AI Search index | search-suggestions-index as tier 1 fallback |
| Reading from markdown files instead of primary index | Source moved to data/ folder |
| Hot-reload without app restart | Azure Blob + polling / pub/sub |
