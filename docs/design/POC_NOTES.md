# POC Notes — Service NSW Search-as-You-Type Autocomplete

## Overview

Service NSW asked for an end-to-end POC for a low-cost, low-latency **search-as-you-type autocomplete capability** — full stack, UI through to backend and data layer. Requirements are intentionally open-ended; they want to see it working first and will define proper requirements once the POC is showcased.

Being built solo, syncing with one other engineer to sense-check ideas and approach.

---

## Constraints

| Constraint | Detail |
|---|---|
| Latency SLA | P95 < 100ms end-to-end |
| Deployment | Cloud Foundry (Node.js buildpack) |
| External DBs | No always-on external databases |
| Cost | Minimal |
| Dataset | ~1,200 records; `title` (~40 chars) + `section` (~70 chars); total < 1MB |
| Source of truth | Azure AI Search (existing; also used as RAG backend for client's chatbot) |

---

## Completion Modes

Two intent types to support:

- **Keyword completion** — short service/topic searches (e.g. "renew licence", "fine payment")
- **Question completion** — full question-format queries (e.g. "how do I renew my driver licence?")

Intent detection will require either lightweight rules-based classification or a small/nano LLM. Any LLM call must stay within the latency budget and not blow out cost. This applies regardless of which search engine sits underneath.

---

## Approaches Evaluated

| Option | Latency P95 | Cost/mo (AUD) | Notes |
|---|---|---|---|
| **MiniSearch** (in-process) | <1ms | $0 | In-memory index, rebuilt from Azure on startup |
| **Typesense** | 10–15ms | ~$20–30 | Purpose-built autocomplete engine, CF binary buildpack |
| **Azure AI Search** | 40–70ms | ~$0–10 | Already in use, no new infra |
| **Amazon OpenSearch** | 40–80ms | $70–150 | Ruled out — overkill, most expensive |

### Why Azure AI Search stays in play

- Already the source of truth; existing ingestor pipeline requires no changes
- Client's chatbot already uses it as a RAG backend — infrastructure is shared
- Has a native **Suggester** feature with dedicated `autocomplete` and `suggest` endpoints purpose-built for this use case
- Zero incremental cost on the existing tier

### Why Amazon OpenSearch was ruled out

- AUD $70–150/month with no meaningful advantage over the other options
- Requires a new parallel ingestor write path
- Complex Elasticsearch DSL configuration
- Overkill for 1,200 records

---

## Final Architecture Direction

**MiniSearch as a cache layer, Azure AI Search as fallback.**

- MiniSearch serves sub-millisecond results for anything already indexed
- Stores popular and recently asked queries so the most common searches never hit the network
- Requests that miss the MiniSearch cache fall through to Azure AI Search
- Azure remains the source of truth throughout

### Things to work through once approach is locked

- Cache warming strategy across multiple CF instances
- Cache invalidation / TTL policy
- Re-indexing cadence (on redeploy vs scheduled)
- Intent detection implementation (rules-based vs nano LLM)
- Nano LLM evaluation — latency and cost trade-offs

---

## POC Scope

End-to-end implementation:

- **UI** — search input with live suggestions as user types
- **Backend** — autocomplete and suggest endpoints with intent detection
- **Data layer** — MiniSearch in-process index seeded from Azure AI Search on startup

Two approaches will be demoed side-by-side so Service NSW can see the trade-offs and make an informed call when requirements are formalised.

---

## Product Owner Meeting — Questions to Ask

### User & Use Case
- Who are the primary users — citizens, internal staff, or both?
- What are they typically searching for — services, forms, FAQs, or all of the above?
- Do we have any analytics on current search queries to understand patterns?

### Requirements
- What does a "good" autocomplete result look like — service titles, full questions, or a mix?
- How important is question completion vs keyword completion — do we prioritise one?
- Is there a minimum character threshold before suggestions should appear?
- How many suggestions should show at once?

### Data & Accuracy
- Who owns the content in Azure AI Search — is there a content team maintaining it?
- How frequently is the data updated, and do we need results to reflect that in near real-time?
- Are there any sensitive or restricted services that should be excluded from suggestions?

### Success Metrics
- How will we measure if this is working well — click-through rate, time-to-result, something else?
- Is there an existing baseline we're trying to beat?

### Integration & Scope
- Where does this sit in the user journey — global search bar, page-specific, or both?
- Does the chatbot team need to be looped in given they share the Azure AI Search backend?
- Is there a design or UX spec, or are we also defining that as part of the POC?

### Timeline & Priorities
- What does a successful POC showcase look like — what must it do to get sign-off?
- Are there any hard deadlines tied to a release or demo to stakeholders?
- After sign-off, what does the path to production look like — same team, same stack?

> **Most critical to get answered:** success metrics, what a good result looks like, and what the POC needs to demonstrate for sign-off.
