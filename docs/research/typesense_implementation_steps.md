# Typesense Autocomplete — Implementation Steps

## Why Typesense fits here

- Sub-10ms query latency (easily <100ms total)
- Built-in prefix search, typo tolerance, and fuzzy matching — no manual Trie needed
- Free & open-source; self-hosted on CF = near-zero cost
- REST API identical in structure to what the existing Node.js app already uses

---

## Phase 1 — Infrastructure Setup

### 1.1 Deploy Typesense on Cloud Foundry

Typesense is a single binary — it can run as a CF app via a binary buildpack:

```bash
# Download the Typesense binary for Linux amd64
curl -O https://dl.typesense.org/releases/0.27.0/typesense-server-0.27.0-linux-amd64.tar.gz
```

Create a `manifest.yml`:
```yaml
applications:
  - name: typesense
    buildpack: binary_buildpack
    command: ./typesense-server --data-dir=/tmp/typesense-data --api-key=$TYPESENSE_API_KEY --listen-port=$PORT
    memory: 512M
    disk_quota: 1G
    env:
      TYPESENSE_API_KEY: <generated-secret>
```

> **Note:** CF ephemeral disk means data is lost on restart. For persistence, mount a CF volume service or point `--data-dir` at a bound NFS/SMB volume. Alternatively, re-index on startup from the ingestor's source data.

---

## Phase 2 — Schema Design

### 2.1 Keyword Collection

```json
{
  "name": "keywords",
  "fields": [
    { "name": "text",       "type": "string" },
    { "name": "weight",     "type": "int32"  },
    { "name": "category",   "type": "string", "facet": true, "optional": true }
  ],
  "default_sorting_field": "weight"
}
```

### 2.2 Questions Collection

```json
{
  "name": "questions",
  "fields": [
    { "name": "text",       "type": "string" },
    { "name": "weight",     "type": "int32"  },
    { "name": "source_url", "type": "string", "index": false, "optional": true }
  ],
  "default_sorting_field": "weight"
}
```

---

## Phase 3 — Ingestor Integration

### 3.1 Modify the existing ingestor to write to Typesense

```javascript
// ingestor/typesense-writer.js
const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [{ host: process.env.TYPESENSE_HOST, port: 443, protocol: 'https' }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5
});

async function upsertDocuments(collection, docs) {
  // Batch import — Typesense handles upserts via action=upsert
  await client.collections(collection).documents().import(docs, { action: 'upsert' });
}
```

### 3.2 CF environment variables to bind

```
TYPESENSE_HOST=typesense.internal.cf-domain.com
TYPESENSE_API_KEY=<secret>
```

---

## Phase 4 — Autocomplete API Endpoint

### 4.1 Intent detection (keyword vs question)

```javascript
const QUESTION_TRIGGERS = /^(who|what|where|when|why|how|can|is|are|do|does)\b/i;

function detectIntent(query) {
  const q = query.trim().toLowerCase();
  if (QUESTION_TRIGGERS.test(q) || q.includes('?') || q.split(' ').length > 4) {
    return 'question';
  }
  return 'keyword';
}
```

### 4.2 Typesense query

```javascript
async function autocomplete(query) {
  const q = query.trim().toLowerCase();
  const intent = detectIntent(q);
  const collection = intent === 'question' ? 'questions' : 'keywords';

  const result = await client.collections(collection).documents().search({
    q,
    query_by: 'text',
    prefix: true,          // enables autocomplete behaviour
    num_typos: 1,          // fuzzy match with edit distance 1
    per_page: 10,
    sort_by: 'weight:desc'
  });

  return result.hits.map(h => h.document.text);
}
```

### 4.3 Express route

```javascript
// routes/autocomplete.js
router.get('/autocomplete', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  const suggestions = await autocomplete(q);
  res.json({ suggestions });
});
```

---

## Phase 5 — Optional: In-Memory Top-N Cache

Since there is no Redis, add a lightweight Node.js in-process cache for the hottest queries:

```javascript
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.value;
}

function setCached(key, value) {
  if (cache.size > 500) cache.delete(cache.keys().next().value); // simple LRU eviction
  cache.set(key, { value, ts: Date.now() });
}
```

Wrap `autocomplete()` with this before the Typesense call.

---

## Phase 6 — Performance Validation

| Step | Tool |
|------|------|
| Baseline latency | `autocannon` or `k6` against the CF endpoint |
| P95 target | < 100ms end-to-end |
| Typesense query time | Expect 2–8ms for 100K docs |
| Cache hit rate | Log cache hits; aim for >60% on hot queries |

---

## Dependency

```bash
npm install typesense
```

---

## Key Trade-offs vs Azure AI Search

| | Typesense | Azure AI Search |
|--|--|--|
| Cost | Free (compute only) | Pay-per-query |
| Latency | 2–8ms | 20–80ms |
| Fuzzy/prefix | Built-in | Requires query config |
| CF persistence | Needs volume mount | Managed externally |
| Ops burden | Self-managed | Fully managed |

The main risk is **data persistence on CF restarts** — mitigated by either a volume service or a fast re-index on startup from the ingestor's source.

---

## Phase 7 — Data Size & Startup Indexing from Azure AI Search

### 7.1 Dataset overview

We have **1,200 records** in Azure AI Search. For Typesense, only two fields per record are needed:

- **`title`** — ~6 words (~40 characters)
- **`section`** — ~10 words (~70 characters)

### 7.2 Estimated storage size in Typesense

| Field | Avg size | × 1,200 records |
|-------|----------|-----------------|
| `title` | ~40 bytes | ~48 KB |
| `section` | ~70 bytes | ~84 KB |
| Typesense index overhead (~3–5×) | — | ~650 KB |
| **Total** | | **< 1 MB** |

Trivially small — fits entirely in memory with no concern.

### 7.3 Startup indexer: Azure AI Search → Typesense

Since 1,200 records re-index in under a second, the simplest strategy is to drop and rebuild the collection on every app startup. Azure remains the source of truth; Typesense is a fast read cache.

```javascript
// startup-indexer.js
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const Typesense = require('typesense');

const azureClient = new SearchClient(
  process.env.AZURE_SEARCH_URL,
  process.env.AZURE_SEARCH_INDEX,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

const typesenseClient = new Typesense.Client({
  nodes: [{ host: process.env.TYPESENSE_HOST, port: 443, protocol: 'https' }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5
});

async function ensureCollection() {
  try {
    await typesenseClient.collections('autocomplete').delete();
  } catch (_) { /* does not exist yet */ }

  await typesenseClient.collections().create({
    name: 'autocomplete',
    fields: [
      { name: 'title',   type: 'string' },
      { name: 'section', type: 'string' }
    ]
  });
}

async function fetchFromAzure() {
  const docs = [];
  const results = azureClient.search('*', {
    select: ['title', 'section'],
    top: 1200
  });

  for await (const result of results) {
    docs.push({
      id:      result.document.id ?? String(docs.length + 1),
      title:   result.document.title   ?? '',
      section: result.document.section ?? ''
    });
  }
  return docs;
}

async function populateTypesense() {
  await ensureCollection();
  const docs = await fetchFromAzure();
  await typesenseClient.collections('autocomplete').documents().import(docs, { action: 'upsert' });
  console.log(`Indexed ${docs.length} documents into Typesense`);
}

module.exports = { populateTypesense };
```

### 7.4 Wire into app startup

Call `populateTypesense()` before the server begins accepting requests:

```javascript
// app.js
const { populateTypesense } = require('./startup-indexer');

(async () => {
  await populateTypesense();
  app.listen(process.env.PORT || 3000);
})();
```

### 7.5 Required environment variables

```
AZURE_SEARCH_URL=https://<instance>.search.windows.net
AZURE_SEARCH_INDEX=<index-name>
AZURE_SEARCH_API_KEY=<secret>
TYPESENSE_HOST=typesense.internal.cf-domain.com
TYPESENSE_API_KEY=<secret>
```

### 7.6 Additional dependency

```bash
npm install @azure/search-documents
```
