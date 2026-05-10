# Open Questions

Consolidated list of decisions and information needed to proceed to Phase 2 and beyond. Questions marked **Phase 2 blocker** must be answered before Phase 2 development begins.

---

## Engineering / Ops

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| E1 | How many CF instances are running in production? | Determines whether 30-min ETag polling is sufficient or whether pub/sub / RediSearch is needed in Phase 2 | ✅ Yes |
| E2 | Is this an internal tool (contact centre agents) or citizen-facing (public portal)? | Sets the traffic volume estimate — affects CF scaling and hot-reload architecture | ✅ Yes |
| E3 | Is RediSearch or pub/sub in scope for Phase 2, or deferred to Phase 3? | Directly affects Phase 2 scope and effort estimate | ✅ Yes |
| E4 | Is rules-based intent detection (regex on question words + word count) sufficient, or is a nano LLM required? | Regex is fast and free but brittle for edge cases; nano LLM adds latency and cost | No — can be resolved mid-Phase 2 |
| E5 | Is P95 < 100ms the final production SLA, or is a tighter target required? | A tighter SLA narrows fallback options — Azure AI Search at ~40–70ms may not be reliable enough as Tier 1 | No |

---

## Product Owner / Architect

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| P1 | Is the reusable component model per-agency deployment (each team deploys their own CF instance) or a shared multi-tenant platform (one deployment serves all agencies)? | Determines index isolation design, ops model, and data privacy posture | ✅ Yes |
| P2 | What is the upper-bound dataset size if reused across agencies and departments? | MiniSearch ceiling is ~200,000 records on a 512MB CF instance — determines whether Typesense or RediSearch needs to be in scope earlier | No |
| P3 | Will the component package the full search capability (search-as-you-type + full search + AI overview) or just autocomplete for now? | Scopes the backend API surface and the frontend component interface | No — Phase 3 concern |

---

## Product Owner / UX

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| U1 | What does a "good" suggestion look like — short service title, full question, or a mix of both? | Defines what the LLM should generate and how the index is structured | ✅ Yes |
| U2 | Minimum character threshold before suggestions fire? | Affects prefix matching behaviour — 1–2 character queries produce high noise | No |
| U3 | How many suggestions should be displayed at once? | Affects the query result limit | No |
| U4 | Is typo tolerance a requirement? If yes, what is the acceptable edit distance — single character, or more? | Determines whether fuzzy matching must be supported and to what degree | No |
| U5 | Should suggestions be ranked? If yes, by what signal — usage frequency, content weight, recency, or a combination? | Affects index schema design and whether usage tracking is needed | No |
| U6 | What quality standard must suggestions meet — concise scannable phrases, or is longer descriptive text acceptable? | Determines the LLM generation prompt design and any post-processing/validation steps | ✅ Yes |
| U7 | What is the acceptable freshness window for suggestions after the service catalogue is updated — minutes, hours, or daily? | Determines the hot-reload strategy and update cadence | ✅ Yes |
| U8 | Are there any sensitive or restricted services that should be excluded from suggestions? | Must be handled at generation time — cannot be suppressed reliably at query time | No |
| U9 | Is question completion as important as keyword completion, or should one be prioritised? | Affects the split of keyword vs question suggestions in the index and intent detection weighting | No |
| U10 | Where does this sit in the user journey — global search bar, page-specific search, or both? | Affects API design (single endpoint vs context-aware) and what content the index should cover | No |
| U11 | Is there a UX/design spec, or is visual design being defined as part of this engagement? | Determines whether UI work is in scope alongside the backend/API | No |

---

## Success & Metrics

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| S1 | How will success be measured — click-through rate, time-to-result, user satisfaction, or a combination? | Determines what instrumentation and analytics need to be built | No |
| S2 | Is there an existing baseline to beat — current search abandonment rate, average time-to-result? | Without a baseline, measuring improvement is subjective | No |
| S3 | What must the POC demonstrate to get sign-off for Phase 2? | Ensures POC effort is directed at the decision-maker's actual criteria | No |
| S4 | Does the chatbot team need to be involved — they share the Azure AI Search backend? | A shared index schema change could affect the chatbot's RAG queries | No |

---

## Ingestor / Content Team

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| I1 | How frequently is the Azure AI Search index updated — daily, hourly, real-time? | Sets the hot-reload polling interval and the LLM batch run schedule | ✅ Yes |
| I2 | Who owns the suggestions pipeline — same team as the existing ingestor? | Determines where the new extraction and generation code lives and who maintains it | ✅ Yes |
| I3 | Are there service pages where the title and section alone would not produce a useful suggestion? | If yes, targeted full-content extraction should be scoped for those records; blanket content ingestion adds cost and noise without proportional quality gain | No |

---

## Legal / Data Governance

| # | Question | Why It Matters | Phase 2 blocker? |
|---|---|---|---|
| L1 | Is sending page headings to OpenAI acceptable under the agency's data policy? | If not, the LLM extraction pipeline is blocked — fallback is rule-based extraction only, which will produce lower quality suggestions | ✅ Yes |

---

## Summary — Phase 2 Blockers

These must be answered before Phase 2 development begins:

| # | Question | Owner |
|---|---|---|
| E1 | How many CF instances in production? | Engineering / Ops |
| E2 | Internal tool or citizen-facing? | Product Owner |
| E3 | RediSearch / pub/sub in Phase 2 or Phase 3? | Engineering / Architect |
| P1 | Per-agency deployment or shared multi-tenant? | Architect |
| U1 | What does a good suggestion look like? | Product Owner / UX |
| U6 | What quality standard must suggestions meet? | Product Owner / UX |
| U7 | What is the acceptable freshness window after a content update? | Product Owner / UX |
| I1 | How frequently is the Azure index updated? | Ingestor team |
| I2 | Who owns the suggestions pipeline? | Engineering lead |
| L1 | Is sending headings to OpenAI acceptable? | Legal / Data Governance |
