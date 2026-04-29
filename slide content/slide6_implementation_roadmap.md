# Slide 6 — Implementation Roadmap

## Title
What's Built, What's Next, and What's Ahead

---

## Phase 1 — Completed (POC)

| # | What | Status |
|---|---|---|
| 1 | Azure built-in suggester on primary index | ✅ Tested — rejected, wrong data shape |
| 2 | OpenAI pipeline — extract from primary index → LLM → MiniSearch | ✅ Built and validated |
| 3 | MiniSearch in-memory index with `/suggest` and `/autocomplete` endpoints | ✅ Running on CF |
| 4 | Azure AI Search built-in suggester on separate branch | ✅ Built for comparison |

---

## Phase 2 — Proposed (Next)

| # | What | Depends On |
|---|---|---|
| 1 | Move extraction source from primary index → markdown files | — |
| 2 | Add rule-based extraction pipeline (headings, lists, related links) | 1 |
| 3 | Replace full-content LLM with headings-only batch approach | 1 |
| 4 | Normalise, deduplicate and upload `suggestions.json` to Azure Blob | 2, 3 |
| 5 | Feed curated suggestions into `search-suggestions-index` | 4 |
| 6 | Hot-reload MiniSearch from Azure Blob — polling + `/reload` endpoint | 4 |
| 7 | Tier 1 fallback to `search-suggestions-index` on MiniSearch miss | 5, 6 |

---

## Phase 3 — Future Scope

| # | What | Value |
|---|---|---|
| 1 | Track popular queries — feed back into MiniSearch as weighted suggestions | Continuously improves relevance with real usage |
| 2 | Swap MiniSearch for RediSearch as instance count grows | Instant consistency across all CF instances |
| 3 | Pub/sub broadcast on blob update | Eliminates polling lag entirely |
| 4 | Score suggestions by selection frequency | Surfaces most-used suggestions first |

---

## Summary View

```
Phase 1 — POC        Phase 2 — Proposed        Phase 3 — Future
─────────────────    ──────────────────────    ──────────────────
Azure Suggester ✅   Markdown extraction  →    Popular queries
OpenAI + Mini   ✅   Azure Blob pipeline  →    RediSearch
MiniSearch API  ✅   search-suggestions   →    Pub/Sub
                     Hot-reload           →    Usage scoring
```
