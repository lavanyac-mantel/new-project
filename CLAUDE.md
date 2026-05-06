# CLAUDE.md — Service NSW Autocomplete POC

This is a **research and design repository** for a search-as-you-type autocomplete capability for Service NSW. It contains design documents, evaluated alternatives, architecture diagrams, and a working POC implementation.

---

## Repository Layout

```
docs/
  PROJECT_CONTEXT.md          # High-level objective, stack, and constraints
  design/                     # Design decisions and final approach documents
    Requirements.md
    POC_NOTES.md
    azure-suggester-design.md
    current_suggestion.md
    previous_suggestion
  research/                   # Evaluated alternatives and analysis
    search_engine_evaluation.md
    search-libraries-analysis.md
    typesense_implementation_steps.md
    cache-selection-process.md
  slides/                     # Slide deck content (markdown per slide)
  confluence/                 # Confluence page export

diagrams/                     # PlantUML architecture diagrams (.puml)

poc/
  backend/                    # Node.js MiniSearch + server (main: index.js)
  ui/                         # React/Vite frontend (Tailwind CSS)
  scripts/                    # Utility scripts (Python)

prompts/                      # LLM prompts and Azure curl commands used during research

tools/
  discuss-cli/                # Independent CLI tool (separate git repo)
```

---

## POC — Backend (`poc/backend/`)

Node.js application using **MiniSearch** as an in-process search index.

```bash
npm install          # install dependencies (root package.json)
npm start            # start the Express server
npm run demo         # run the index demo
npm run bench        # run benchmarks
```

Entry point: `poc/backend/server.js`
Data: `poc/backend/data/services.js`

---

## POC — UI (`poc/ui/`)

React + Vite + Tailwind CSS frontend.

```bash
cd poc/ui && npm install && npm run dev
```

---

## Architecture Summary

**Chosen approach:** MiniSearch (Tier 0, in-process) → Azure AI Search Suggester (Tier 1 fallback)

- MiniSearch serves sub-millisecond results from heap memory, seeded from Azure on startup
- Azure AI Search Suggester handles cache misses (~40–70ms)
- LLM generates suggestions **offline** (nightly batch) — never in the hot path
- Target latency: **P95 < 100ms** end-to-end

See `docs/design/POC_NOTES.md` for the full evaluation and rationale.
See `docs/design/azure-suggester-design.md` for the Azure index schema, analyser choice, and REST API design.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| In-process cache | MiniSearch | Zero infra cost, sub-ms latency, 166× headroom at current dataset size |
| Analyser | `en.microsoft` | Lemmatisation over stemming — handles natural English service queries |
| Suggester mode | `analyzingInfixMatching` | Matches on any word in the phrase, not just the prefix |
| Endpoint | `suggest` not `autocomplete` | Returns full phrase documents for dropdown UX |
| Intent detection | Rules-based (keyword vs question) | Regex on question words + word count — fast and free |
| LLM role | Offline batch only | Live LLM call adds 200–500ms and breaks the 100ms SLA |

---

## Data Shape

Each indexed document in the Azure suggestions index:

```json
{
  "id":     "string",
  "text":   "string",
  "type":   "keyword | question",
  "weight": 0.5
}
```
