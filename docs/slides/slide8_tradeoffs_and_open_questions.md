# Slide 8 — Trade-offs, Risks & Open Questions

## Title
Known Trade-offs, Risks & Decisions Needed

---

## Trade-offs & Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MiniSearch multi-instance consistency | Low | ≤30 min ETag polling window — acceptable for daily content updates |
| LLM non-determinism | Low | Same headings may produce slightly varied suggestions across runs — deduplication by hash normalises this |
| MiniSearch memory growth | Medium | Corpus grows as more pages are added — monitor heap; migrate to RediSearch if memory becomes a constraint |
| Azure Blob as single point of failure on boot | Low | App falls back gracefully — serve from `search-suggestions-index` directly if blob is unavailable on startup |
| Government data sent to OpenAI | Medium | Only page headings are sent — no citizen data, no PII; verify acceptable under agency data policy |

---

## Open Questions — Decisions Needed

| # | Question | Why It Matters |
|---|---|---|
| 1 | How many CF instances are running in production? | Determines whether polling is sufficient or pub/sub / RediSearch is needed in Phase 2 |
| 2 | How frequently does content in the data folder change? | Sets the polling interval and LLM run schedule |
| 3 | Is sending page headings to OpenAI acceptable under the agency's data policy? | Blocks or shapes the LLM extraction approach |
| 4 | Who owns the suggestions pipeline — same team as the ingestor? | Determines where the new extraction code lives and who maintains it |
| 5 | Is RediSearch or pub/sub in scope for Phase 2, or deferred to Phase 3? | Affects Phase 2 scope and effort estimate |
