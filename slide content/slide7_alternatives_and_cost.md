# Slide 7 — Alternatives Considered & Cost Breakdown

## Title
Why Azure AI Search + MiniSearch — What Else Was Evaluated

---

## Alternatives Evaluated & Rejected

| Tool | Reason Rejected |
|---|---|
| **Amazon OpenSearch** | Requires moving to AWS — search infrastructure already on Azure; cross-cloud dependency adds cost, complexity, and latency |
| **Algolia** | Third-party SaaS — data sovereignty concerns for government content; cost at scale; moves away from existing Azure investment |
| **Typesense** | Would require deploying and managing a new standalone service; not aligned with Cloud Foundry deployment model |
| **Azure Built-in Suggester** | Tested — returns raw chunked fragments; quality unacceptable for customer-facing autocomplete |

> All four were rejected in favour of extending the existing Azure AI Search investment with a lightweight in-process cache layer — no new cloud, no new infrastructure, no data leaving the existing estate.

---

## Cost Breakdown

| Component | Cost | Notes |
|---|---|---|
| LLM (GPT-4o-mini) | ~$0.01–0.05 per run | Headings only — 50–150 tokens per document |
| Azure Blob Storage | ~$0.01/month | Single JSON file, kilobytes in size |
| search-suggestions-index | Negligible | Additional index on existing Azure AI Search resource |
| MiniSearch | $0 | Runs inside existing Node.js CF process |
| ETag polling | ~$0 | HEAD requests every 30 min per instance |
| **Total** | **< $5/month** | At current document volume and update frequency |
