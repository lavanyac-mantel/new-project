# Azure Suggester — Index Schema, Analyser & API Design

**Context:** Tier 1 fallback for the autocomplete system. Azure AI Search Suggester is queried when MiniSearch (Tier 0) returns no results. LLM-generated keyword and question suggestions are the indexed data.

---

## 1. Data Shape

Each indexed document is an LLM-generated suggestion:

```json
{
  "id":     "string",
  "text":   "string",
  "type":   "keyword | question",
  "weight": 0.5
}
```

`weight` is a numeric ranking signal — see §5 for details.

---

## 2. Index Schema

```json
{
  "name": "search-suggestions-index",
  "fields": [
    {
      "name": "id",
      "type": "Edm.String",
      "key": true,
      "retrievable": true,
      "searchable": false,
      "filterable": false,
      "sortable": false,
      "facetable": false
    },
    {
      "name": "text",
      "type": "Edm.String",
      "key": false,
      "retrievable": true,
      "searchable": true,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "analyzer": "en.microsoft"
    },
    {
      "name": "type",
      "type": "Edm.String",
      "key": false,
      "retrievable": true,
      "searchable": false,
      "filterable": true,
      "sortable": false,
      "facetable": false
    },
    {
      "name": "weight",
      "type": "Edm.Double",
      "key": false,
      "retrievable": true,
      "searchable": false,
      "filterable": true,
      "sortable": true,
      "facetable": false
    }
  ],
  "suggesters": [
    {
      "name": "suggestions-sg",
      "searchMode": "analyzingInfixMatching",
      "sourceFields": ["text"]
    }
  ]
}
```

### Why this schema

| Decision | Rationale |
|---|---|
| `text` is the only searchable field | All user-facing content lives here — short, clean, atomic phrases from the LLM pipeline. No raw chunks. |
| `type` is filterable, not searchable | Used only to filter (`keyword` vs `question`) — never full-text searched. Filterable fields are cheap; keeping it non-searchable avoids polluting the text analysis pipeline. |
| `id` is non-searchable | A synthetic key — no value in being indexed for search. |
| `weight` is sortable, not searchable | Numeric ranking signal used in `orderby` — not text content. |
| Single suggester on `text` | The Azure Suggester operates per-field. `text` is the only field that needs autocomplete prefix generation. Including `type`, `weight`, or `id` in the suggester would degrade quality. |
| One index, both types | Keyword and question suggestions live in the same index. `type` as a filter separates them at query time — no need to maintain two indexes. |

---

## 3. Analyser Choice: `en.microsoft`

### What was evaluated

| Analyser | Description |
|---|---|
| `standard` (default Lucene) | Language-agnostic tokeniser. Splits on whitespace and punctuation. No stemming, no lemmatisation. |
| `en.lucene` | Lucene English analyser. Adds Porter stemming, removes possessives and English stop words. |
| `en.microsoft` | Microsoft NLP-backed English analyser. Performs lemmatisation (not stemming). Handles inflected and irregular forms. |

### Why `en.microsoft`

**Lemmatisation over stemming.** Porter stemming is a rule-based suffix-chopper — it maps "renewing" → "renew" correctly, but also maps "drives" → "drive" crudely. Lemmatisation maps words to their dictionary base form using linguistic context: "brought" → "bring", "renovations" → "renovation". For a government services corpus, where queries use natural phrasing ("renewing my licence" → matches "renew licence"), lemmatisation produces more accurate prefix matches.

**Handles irregular government service phrasing.** Queries like "working with children check" contain compound terms. The Microsoft analyser understands English word structure; the Lucene standard analyser treats each token atomically.

**Suggester constraint is satisfied.** Azure Suggesters only accept the default Standard Lucene analyser or a named language analyser. `en.microsoft` is explicitly listed on the `LexicalAnalyzerName` struct and is compatible with suggesters. Custom analysers are disallowed on suggester fields.

**Indexing speed trade-off is acceptable.** Microsoft analysers are 2–3× slower at index time than Lucene equivalents. For an offline batch ingestor running nightly over ~1,200 documents, this is irrelevant. Query performance is not meaningfully affected.

### Tokeniser

The tokeniser is internal to `en.microsoft` and not separately configurable when using a named language analyser. It uses Microsoft's NLP tokeniser, which correctly handles:
- Hyphenated compounds: `context-sensitive` → `context`, `sensitive`, `context-sensitive`
- Possessives: `driver's licence` → `driver`, `licence`
- Contractions and common government service patterns

> If custom tokeniser behaviour is ever needed (e.g., treating `NSW` as a single token), the correct approach per Azure docs is to use **two fields** for the same content: one with `en.microsoft` for the suggester, one with a custom analyser for any bespoke query logic.

### Normaliser

Not applicable to the `text` field. Normalisers in Azure AI Search apply only to `filterable` / `sortable` / `facetable` fields (exact-match operations). The `text` field is `searchable` only — `en.microsoft` handles lowercasing internally as part of its analysis pipeline.

---

## 4. How the Analyser & Tokeniser Work — Worked Example

This section traces exactly what happens when a suggestion is stored and when a user types a query.

**Stored suggestion:** `"Can rent increase after renovations?"`
**User types:** `"rent"`

---

### Step 1 — Index Time: analysing the stored suggestion

`en.microsoft` runs three operations in sequence on the `text` field value.

#### 1a. Tokenisation

The Microsoft NLP tokeniser splits on word boundaries and strips punctuation:

```
Input:   "Can rent increase after renovations?"

Tokens:  ["Can", "rent", "increase", "after", "renovations"]
          ↑ punctuation "?" dropped
```

#### 1b. Lemmatisation

Each token is reduced to its **dictionary base form** using linguistic knowledge — not rule-based suffix-chopping:

```
"Can"         → "can"
"rent"        → "rent"
"increase"    → "increase"
"after"       → "after"
"renovations" → "renovation"   ← plural stripped via lemmatisation
```

Compare this to what `en.lucene` (Porter stemmer) would produce:

```
"renovations" → "renovat"      ← over-stemmed, not a real word
"increase"    → "increas"      ← over-stemmed
```

`en.microsoft` produces real dictionary words. `en.lucene` produces truncations that no real user would type.

#### 1c. Lowercasing (internal to analyser)

```
Final stored tokens: ["can", "rent", "increase", "after", "renovation"]
```

#### 1d. Suggester prefix expansion

The suggester takes each token and generates all possible prefix sequences. `analyzingInfixMatching` creates prefix entries for **every token in the field**, not just the first word:

```
"can"        → c, ca, can
"rent"       → r, re, ren, rent
"increase"   → i, in, inc, incr, incre, increas, increase
"after"      → a, af, aft, afte, after
"renovation" → r, re, ren, reno, renov, renova, renovat, renovati, renovatio, renovation
```

All of these prefix entries point back to the original document: `"Can rent increase after renovations?"`

---

### Step 2 — Query Time: user types "rent"

The same `en.microsoft` analyser runs on the query input:

```
Input:   "rent"
Token:   ["rent"]
Lemma:   ["rent"]   ← already base form, no change
```

The suggester looks for documents that have a stored prefix token matching `"rent"` exactly.

---

### Step 3 — The Match

```
Query token:  "rent"
                 ↓
Stored prefixes for "Can rent increase after renovations?":
  c, ca, can, r, re, ren, [rent] ✅, increase, ...
                               ↑
                          MATCH FOUND
```

The document is returned because `"rent"` is one of the stored prefix tokens.

---

### What else would and would not match

| User types | Matches? | Why |
|---|---|---|
| `rent` | ✅ | Exact stored token from the word "rent" |
| `reno` | ✅ | Prefix of stored token "renovation" (lemmatised from "renovations") |
| `renov` | ✅ | Prefix of stored token "renovation" |
| `renovat` | ❌ | Not a stored prefix — `en.microsoft` lemmatised to "renovation", not "renovat" |
| `renovations` | ✅ | Full word, resolved to "renovation" at query time, matches stored token |
| `increasing` | ✅ | Lemmatised to "increase" at query time — matches stored token |
| `increases` | ✅ | Lemmatised to "increase" at query time — matches stored token |

The `standard` analyser would store `"renovations"` as-is — a user typing `"reno"` would still match but `"increasing"` would not. `en.lucene` produces `"renovat"` and `"increas"` — strings no user would type. `en.microsoft` stores real base forms, matching the natural prefixes users actually type.

---

## 5. Ranking Suggestions

### Default ranking — free, already active

Out of the box, the Suggest API returns results ordered by **match score** — Azure scores each suggestion by how well it matches the query prefix. No extra configuration needed.

For a small, curated corpus of clean LLM-generated phrases this default is often sufficient.

### Custom ranking via `weight`

To control ranking explicitly (e.g. surface "renew driver licence" above "renew boat licence" because it is a higher-traffic service), the `weight` field is used in `orderby`.

**Populate `weight` at ingest time:**

```json
{ "id": "k-001", "text": "renew driver licence",    "type": "keyword", "weight": 0.95 }
{ "id": "k-002", "text": "renew vehicle registration", "type": "keyword", "weight": 0.90 }
{ "id": "k-003", "text": "renew boat licence",       "type": "keyword", "weight": 0.60 }
```

**Request with ranking:**

```http
POST /indexes/search-suggestions-index/docs/suggest?api-version=2024-07-01

{
  "search":        "renew",
  "suggesterName": "suggestions-sg",
  "filter":        "type eq 'keyword'",
  "select":        "id, text",
  "top":           5,
  "fuzzy":         true,
  "orderby":       "search.score() desc, weight desc"
}
```

`search.score() desc` ranks by Azure's match relevance first. `weight desc` breaks ties using the curated popularity signal.

### What to put in `weight`

| Source | How |
|---|---|
| Manual curation | Assign higher weights to high-traffic services at ingest time. Start here. |
| Usage analytics | Count how often a suggestion was clicked → feed back as `weight` on the next ingest run |
| LLM confidence | If the LLM generates suggestions with a confidence score, store it as `weight` |

Default all suggestions to `0.5` and adjust from there. This is the same popularity scoring that RediSearch offers natively via `SUGADD INCR` — implemented at the ingest pipeline level rather than at query time.

---

## 6. REST API Design

### 6.1 Keyword Suggestions

Returns short service/topic completions. Triggered when the client detects a keyword-style query (short, no question words).

**Request**
```http
POST /indexes/search-suggestions-index/docs/suggest?api-version=2024-07-01
Content-Type: application/json
api-key: {{AZURE_SEARCH_API_KEY}}

{
  "search":           "renew",
  "suggesterName":    "suggestions-sg",
  "filter":           "type eq 'keyword'",
  "select":           "id, text",
  "top":              5,
  "fuzzy":            true,
  "orderby":          "search.score() desc, weight desc",
  "highlightPreTag":  "<em>",
  "highlightPostTag": "</em>",
  "minimumCoverage":  80
}
```

**Response**
```json
{
  "@search.coverage": 100,
  "value": [
    { "@search.text": "renew driver licence",              "id": "k-001", "text": "renew driver licence" },
    { "@search.text": "renew vehicle registration",        "id": "k-002", "text": "renew vehicle registration" },
    { "@search.text": "renew boat licence",                "id": "k-003", "text": "renew boat licence" },
    { "@search.text": "renew working with children check", "id": "k-004", "text": "renew working with children check" },
    { "@search.text": "renew photo card",                  "id": "k-005", "text": "renew photo card" }
  ]
}
```

---

### 6.2 Question Suggestions

Returns full natural-language question completions. Triggered when the client detects a question-style query (starts with how/what/when/where/can/do, or length > 4 words).

**Request**
```http
POST /indexes/search-suggestions-index/docs/suggest?api-version=2024-07-01
Content-Type: application/json
api-key: {{AZURE_SEARCH_API_KEY}}

{
  "search":           "how do i renew",
  "suggesterName":    "suggestions-sg",
  "filter":           "type eq 'question'",
  "select":           "id, text",
  "top":              5,
  "fuzzy":            true,
  "orderby":          "search.score() desc, weight desc",
  "highlightPreTag":  "<em>",
  "highlightPostTag": "</em>",
  "minimumCoverage":  80
}
```

**Response**
```json
{
  "@search.coverage": 100,
  "value": [
    { "@search.text": "how do I renew my driver licence?",              "id": "q-001", "text": "how do I renew my driver licence?" },
    { "@search.text": "how do I renew my vehicle registration?",        "id": "q-002", "text": "how do I renew my vehicle registration?" },
    { "@search.text": "how do I renew my boat licence online?",         "id": "q-003", "text": "how do I renew my boat licence online?" },
    { "@search.text": "how do I renew my photo card?",                  "id": "q-004", "text": "how do I renew my photo card?" },
    { "@search.text": "how do I renew my working with children check?", "id": "q-005", "text": "how do I renew my working with children check?" }
  ]
}
```

---

### 6.3 Why `suggest` not `autocomplete`

Azure AI Search exposes two typeahead endpoints:

| Endpoint | Returns | Best for |
|---|---|---|
| `autocomplete` | Completed query string (term completion) | Completing a partial word in a search bar |
| `suggest` | Matching documents with selected fields | Showing a dropdown list of full suggestion phrases |

`suggest` is the correct choice here. The goal is to display a ranked list of full suggestion phrases ("renew driver licence") that the user can click — not to complete a half-typed word mid-query. `suggest` returns the full `text` field from matching documents, which is exactly what the dropdown needs. `autocomplete` would return only the completed term fragment, insufficient for a phrase-level suggestion UX.

---

### 6.4 Parameter Rationale

| Parameter | Value | Why |
|---|---|---|
| `filter` | `type eq 'keyword'` or `type eq 'question'` | Separates the two completion modes at query time without needing two indexes. Fast — `type` is a filterable, non-searchable field with no text analysis overhead. |
| `top` | `5` | Standard autocomplete dropdown convention. Enough to be useful, few enough to be scannable. |
| `fuzzy` | `true` | Enables one-character edit distance tolerance (Levenshtein distance 1). Handles common typos ("renwe" → "renew"). Not aggressive enough to cause false matches at short query lengths. Confirmed valid parameter on the `/suggest` endpoint per Azure REST API docs. |
| `orderby` | `search.score() desc, weight desc` | Ranks by Azure match relevance first; uses curated `weight` as tiebreaker. |
| `select` | `id, text` | Returns only what the client needs. `type` is consumed by the filter; `weight` is a server-side ranking signal only. |
| `highlightPreTag/PostTag` | `<em>` | Wraps matched prefix in the response. Client uses this to bold the matched portion in the dropdown — standard UX pattern. |
| `minimumCoverage` | `80` | Percentage of index shards Azure must query before returning results. Protects against partial results if a replica is unavailable. Default is 80; set to 100 would fail if any shard is down — too strict for autocomplete. Default value stated explicitly here for documentation clarity. Response includes `@search.coverage` showing actual coverage achieved. |
| `api-version` | `2024-07-01` | Matches the version already in use by the platform per `PROJECT_CONTEXT.md`. |

---

## 7. Node.js Integration (CF App)

The Tier 1 fallback call from the Node.js service layer:

```typescript
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';

interface Suggestion {
  id:     string;
  text:   string;
  weight: number;
}

const client = new SearchClient<Suggestion>(
  process.env.AZURE_SEARCH_ENDPOINT,
  'search-suggestions-index',
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

async function fetchSuggestions(query: string, type: 'keyword' | 'question'): Promise<string[]> {
  const results = await client.suggest<Suggestion>(query, 'suggestions-sg', {
    filter:           `type eq '${type}'`,
    select:           ['id', 'text'],
    top:              5,
    useFuzzyMatching: true,
    orderBy:          ['search.score() desc', 'weight desc'],
    highlightPreTag:  '<em>',
    highlightPostTag: '</em>',
  });

  return results.results.map(r => r.document.text);
}
```

---

## 8. Summary

| Concern | Decision |
|---|---|
| Index | Single `search-suggestions-index` — both keyword and question types |
| Schema | `id` (key), `text` (searchable + suggester), `type` (filterable), `weight` (sortable) |
| Analyser | `en.microsoft` — lemmatisation for natural English query handling |
| Tokeniser | Internal to `en.microsoft` — not separately configurable on suggester fields |
| Normaliser | Not applicable — `en.microsoft` handles lowercasing; normalisers only apply to filterable/sortable fields |
| Suggester | `suggestions-sg` on `text` field, `analyzingInfixMatching` mode |
| Ranking | `orderby: search.score() desc, weight desc` — relevance first, curated weight as tiebreaker |
| `minimumCoverage` | `80` — Azure must cover 80% of shards before returning; protects against partial results from unavailable replicas |
| Keyword API | `POST /docs/suggest` with `filter: type eq 'keyword'`, `top: 5`, `fuzzy: true` |
| Question API | `POST /docs/suggest` with `filter: type eq 'question'`, `top: 5`, `fuzzy: true` |
| Endpoint choice | `suggest` over `autocomplete` — returns full phrase documents, not partial term completions |
