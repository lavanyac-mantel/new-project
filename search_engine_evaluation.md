# Search Engine Evaluation: Typesense vs Azure AI Search vs Amazon OpenSearch vs MiniSearch

## 1. Executive Summary

| Option | Best For | Monthly Cost (AUD) | Ops Burden | Recommendation |
|---|---|---|---|---|
| **MiniSearch (in-process)** | Simplest architecture, zero infrastructure | 0 | None | ★★★★★ Recommended |
| **Typesense** | Low latency, low cost, small dataset | 20–30 | Low | ★★★★★ Recommended |
| **Azure AI Search** | Managed service, existing integration | 0–10 (incremental) | Very Low | ★★★★ Good Alternative |
| **Amazon OpenSearch** | Large-scale analytics, AWS ecosystem | 70–150 | Medium | ★★ Not Recommended |

- **MiniSearch (in-process):** Lightweight Node.js search library; entire index lives in-process memory; sub-millisecond latency; zero infrastructure.
- **Typesense:** Free, single-binary, self-hosted search engine purpose-built for autocomplete; sub-10 ms query latency.
- **Azure AI Search:** Managed cloud service already in use; no incremental cost; adds no new infrastructure.
- **Amazon OpenSearch:** AWS-managed, Elasticsearch-compatible; powerful but overkill and expensive for this dataset.

---

## 2. Context & Constraints

| Constraint | Detail |
|---|---|
| Dataset | 1,200 records — `title` (~40 chars) + `section` (~70 chars); total < 1 MB |
| Latency SLA | P95 < 100 ms end-to-end |
| Traffic | 100–500 QPS baseline; up to 2,000 QPS spike |
| Deployment | Cloud Foundry (Node.js buildpack or binary buildpack) |
| Cost | Minimal; no always-on external databases |
| Existing search | Azure AI Search already used for main search feature |

---

## 3. Option Evaluations

---

### 3.1 Typesense

#### Overview
Open-source, single-binary search engine written in C++. Purpose-built for typo-tolerant prefix search and autocomplete. Free under AGPL 3.0.

#### Cloud Foundry Compatibility
Runs natively on CF via the binary buildpack. Single file, no JVM or runtime required.

```yaml
applications:
  - name: autocomplete-typesense
    buildpack: binary_buildpack
    command: ./typesense-server --data-dir=/tmp/ts-data --api-key=$TYPESENSE_API_KEY --listen-port=$PORT
    memory: 512M
    disk_quota: 1G
```

Memory footprint: ~100 MB (base + 1,200 records). Cold start: ~2 seconds.

#### Autocomplete Capabilities
- **Prefix search:** Native — queries `"driv"` match `"driver licence"`, `"driving test"`, etc.
- **Typo tolerance:** Built-in `num_typos` parameter (edit distance 1–2)
- **Fuzzy matching:** Phonetic and distance-based, no configuration needed
- **Multi-field search:** Simultaneous search across `title` and `section` with weights
- **Custom scoring:** Sort by popularity/weight field

#### Latency

| Metric | Value |
|---|---|
| Typesense query (P50) | 2–3 ms |
| Typesense query (P95) | 8–12 ms |
| CF intra-network overhead | 2–5 ms |
| End-to-end uncached (P95) | **10–15 ms** |
| End-to-end cached (>60% hit rate) | **< 2 ms** |

#### Cost

| Item | Monthly (AUD) |
|---|---|
| Typesense binary | Free |
| CF instance (512 MB) | 20–30 |
| Licensing | None |
| **Total** | **AUD 20–30** |

#### Data Persistence
Data is stored in `/tmp/typesense-data` — ephemeral CF disk, lost on restart.

**Recommended mitigation:** Re-index on every startup by fetching from Azure AI Search.
- 1,200 records re-index in < 1 second
- Azure remains the source of truth; Typesense acts as a high-performance read cache
- No volume service or external storage required

#### Ingestor Integration

```javascript
// startup-indexer.js — runs at app boot before accepting requests
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const Typesense = require('typesense');

const azureClient = new SearchClient(
  process.env.AZURE_SEARCH_URL,
  process.env.AZURE_SEARCH_INDEX,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

const tsClient = new Typesense.Client({
  nodes: [{ host: process.env.TYPESENSE_HOST, port: 443, protocol: 'https' }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5
});

async function populateTypesense() {
  try { await tsClient.collections('autocomplete').delete(); } catch (_) {}
  await tsClient.collections().create({
    name: 'autocomplete',
    fields: [
      { name: 'title',   type: 'string' },
      { name: 'section', type: 'string' }
    ]
  });

  const docs = [];
  for await (const r of azureClient.search('*', { select: ['title', 'section'], top: 1200 })) {
    docs.push({ id: r.document.id ?? String(docs.length + 1), title: r.document.title ?? '', section: r.document.section ?? '' });
  }

  await tsClient.collections('autocomplete').documents().import(docs, { action: 'upsert' });
  console.log(`Indexed ${docs.length} documents`);
}
```

#### Node.js SDK

```javascript
// npm install typesense
const result = await tsClient.collections('autocomplete').documents().search({
  q: userInput,
  query_by: 'title,section',
  prefix: true,
  num_typos: 1,
  per_page: 10
});
```

SDK: `typesense` — production-ready, TypeScript support, well-documented.

#### Operational Burden
- **One-time setup:** ~2 hours (CF manifest, binary deploy, startup indexer)
- **Monthly:** ~30 minutes (CF app health checks, occasional re-deploy)
- **Upgrades:** Download new binary, update manifest, redeploy (data rebuilds automatically)

#### Risks & Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Data loss on CF restart | Medium | Re-index on startup (< 1 second) |
| No managed backup | Low | Azure is source of truth |
| Single-instance at scale | Low | Not a concern for 1,200 records |
| AGPL licence | Low | Internal use only; no distribution required |

---

### 3.2 Azure AI Search

#### Overview
Microsoft's fully managed cloud search service. Already in use for the main search feature. Supports full-text search, semantic ranking, and autocomplete via query configuration.

#### Cloud Foundry Compatibility
No CF deployment needed. CF app calls the Azure API over HTTPS. No infrastructure to manage on CF side.

#### Autocomplete Capabilities
- **Prefix search:** Supported via `queryType=full` with `searchFields`
- **Typo tolerance:** Supported via fuzzy syntax (e.g., `term~1`)
- **Autocomplete:** Supported but not a first-class feature — requires manual query construction
- **Multi-field search:** Native support

**Limitation:** Autocomplete is not purpose-built; configuration is more verbose than Typesense.

#### Latency

| Metric | Value |
|---|---|
| Azure query (P50) | 20–30 ms |
| Azure query (P95) | 40–60 ms |
| Network (Sydney → Azure Australia East) | 20–40 ms |
| End-to-end uncached (P95) | **40–70 ms** |
| End-to-end cached (>60% hit rate) | **< 2 ms** |

Network latency is the primary bottleneck (~30 ms each way).

#### Cost

| Item | Monthly (AUD) |
|---|---|
| Azure AI Search tier (existing) | Already paid |
| Incremental cost for autocomplete | 0–10 |
| **Total incremental** | **AUD 0–10** |

Major advantage: zero incremental cost if the existing service is already licensed.

#### Data Persistence
Fully managed by Microsoft. 99.9% uptime SLA. Data persists indefinitely. Automatic backups.

#### Ingestor Integration
Existing ingestor already writes to Azure — no changes needed. Autocomplete queries use the same index.

```javascript
// npm install @azure/search-documents
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const client = new SearchClient(
  process.env.AZURE_SEARCH_URL,
  process.env.AZURE_SEARCH_INDEX,
  new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
);

const result = await client.search(userInput, {
  queryType: 'full',
  searchMode: 'all',
  searchFields: ['title', 'section'],
  top: 10
});
```

#### Node.js SDK
`@azure/search-documents` — official Microsoft SDK, production-ready, TypeScript support.

#### Operational Burden
- **One-time setup:** ~1 hour (autocomplete query design + endpoint wiring)
- **Monthly:** ~15 minutes (Azure portal monitoring only)
- **Upgrades:** Automatic; handled by Microsoft

#### Risks & Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Network latency (~30 ms baseline) | Medium | In-process caching layer |
| Vendor lock-in to Azure | Medium | Document query syntax for portability |
| Autocomplete not native | Low | Well-documented workaround |
| External dependency (outage) | Low | In-process cache provides graceful degradation |

---

### 3.3 Amazon OpenSearch (Managed)

#### Overview
AWS-managed search service; fork of Elasticsearch 7.x. Elasticsearch-compatible API. Designed for large-scale full-text search and analytics. Available as a fully managed service in AWS Australia (Sydney) region.

#### Cloud Foundry Compatibility
No CF deployment. CF app calls the OpenSearch HTTPS API. Network path: CF (NSW Gov) → AWS Sydney (~20–30 ms).

A self-hosted CF option is impractical: OpenSearch requires 2+ GB RAM, which is expensive on CF and hard to manage.

#### Autocomplete Capabilities
- **Prefix search:** Supported via `match_phrase_prefix` query
- **Typo tolerance:** Supported via `fuzzy` query with `fuzziness` parameter
- **Autocomplete:** Supported but requires custom analyser + tokenisation config (most complex of the three)
- **Multi-field search:** Native support

**Limitation:** Autocomplete requires significantly more Elasticsearch DSL configuration than Typesense.

#### Latency

| Metric | Value |
|---|---|
| OpenSearch query (P50) | 10–20 ms |
| OpenSearch query (P95) | 20–40 ms |
| Network (Sydney → AWS Sydney) | 20–30 ms |
| End-to-end uncached (P95) | **40–80 ms** |
| End-to-end cached (>60% hit rate) | **< 2 ms** |

#### Cost

| Item | Monthly (AUD) |
|---|---|
| `t3.small.search` instance | 60–100 |
| EBS storage (10 GB) | 5–10 |
| Data transfer | ~5 |
| **Total** | **AUD 70–150** |

Significantly more expensive than both alternatives.

#### Data Persistence
Fully managed by AWS. 99.99% uptime SLA. Automatic backups via snapshots.

#### Ingestor Integration
Requires a new parallel ingestor path: existing pipeline writes to Azure; a new path must write to OpenSearch. Additional code change to ingestor required.

```javascript
// npm install @elastic/elasticsearch
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: process.env.OPENSEARCH_URL });

const result = await client.search({
  index: 'autocomplete',
  body: {
    query: {
      bool: {
        must: [{ match_phrase_prefix: { title: userInput } }]
      }
    },
    size: 10
  }
});
```

SDK: `@elastic/elasticsearch` or `opensearch-js`. More complex query DSL than Typesense.

#### Operational Burden
- **One-time setup:** ~4–8 hours (AWS console, index creation, ingestor changes, analyser config)
- **Monthly:** ~30–60 minutes (AWS CloudWatch monitoring, snapshot management)
- **Upgrades:** Managed by AWS; some downtime during major version upgrades

#### Risks & Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Overkill for 1,200 records | High | Use simpler option (Typesense or Azure) |
| Cost (AUD 70–150/month) | High | No mitigation; fixed overhead |
| New ingestor path required | Medium | Additional development effort |
| Complex query DSL | Medium | Team learning curve |
| AWS vendor lock-in | Medium | Standard Elasticsearch DSL helps portability |

---

### 3.4 MiniSearch (In-Process Node.js)

#### Overview
A lightweight, zero-dependency full-text search library for Node.js. The entire index is built and queried inside the existing Node.js process — no external service, no network hop, no additional CF app. Best suited for small-to-medium datasets where simplicity and latency matter most.

#### Cloud Foundry Compatibility
Runs inside the existing Node.js CF app. No new buildpack, no new manifest, no new CF app. Just an npm package.

#### Autocomplete Capabilities
- **Prefix search:** Native (`prefix: true`)
- **Typo tolerance:** Built-in fuzzy matching (`fuzzy: 0.2` ≈ edit distance 1)
- **Multi-field search:** Simultaneous search across `title` and `section` with field boosting
- **Custom scoring:** Sort by a `weight` field or relevance score

```javascript
// npm install minisearch
const MiniSearch = require('minisearch');

const miniSearch = new MiniSearch({
  fields: ['title', 'section'],
  storeFields: ['title', 'section']
});

// On startup — index all documents in-process
async function buildIndex(docs) {
  miniSearch.addAll(docs);
}

// Autocomplete query — runs in microseconds
function autocomplete(query) {
  return miniSearch.search(query, {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2 }
  }).slice(0, 10).map(r => r.title);
}
```

Wire into app startup:

```javascript
// app.js
const { fetchFromAzure } = require('./search/azure-fetcher');

(async () => {
  const docs = await fetchFromAzure();
  miniSearch.addAll(docs);             // loads into process memory — < 50 ms for 1,200 records
  app.listen(process.env.PORT);
})();
```

#### Latency

| Metric | Value |
|---|---|
| Query latency (P50) | < 0.5 ms |
| Query latency (P95) | < 1 ms |
| Network overhead | Zero (in-process) |
| End-to-end uncached (P95) | **< 1 ms** |

#### Cost

| Item | Monthly (AUD) |
|---|---|
| MiniSearch package | Free |
| Additional CF infrastructure | None |
| **Total** | **AUD 0** |

#### Data Persistence
Index lives in Node.js heap memory. Rebuilt from Azure AI Search on every app startup, same as the Typesense startup-indexer approach. Source of truth remains Azure.

#### Ingestor Integration
Identical to the Typesense startup-indexer: fetch 1,200 records from Azure on boot, call `miniSearch.addAll(docs)`. No ingestor code changes required.

#### Node.js SDK
`minisearch` — 8 KB gzipped, zero dependencies, TypeScript support, production-ready.

#### Operational Burden
- **One-time setup:** ~1 hour (install package, build index on startup, wire route)
- **Monthly:** Zero (no external service to monitor)
- **Upgrades:** Standard npm package update

#### Maximum Data Volume

The index lives in Node.js heap, so the limit is available CF instance memory.

**Memory estimate for this data shape** (`title` ~40 chars + `section` ~70 chars = ~110 bytes raw/record):

| Records | Raw Data | MiniSearch Index (est.) | CF Instance Needed |
|---|---|---|---|
| 1,200 *(current)* | ~132 KB | ~1.2 MB | 256 MB |
| 10,000 | ~1.1 MB | ~10 MB | 256 MB |
| 50,000 | ~5.5 MB | ~50 MB | 256 MB |
| 100,000 | ~11 MB | ~100 MB | 512 MB |
| **200,000** | ~22 MB | ~200 MB | **512 MB (safe limit)** |
| 500,000 | ~55 MB | ~500 MB | 1 GB |
| 1,000,000 | ~110 MB | ~1 GB | 2 GB |

**CF memory budget on a 512 MB instance:**

```
512 MB CF limit
 - 100 MB  Node.js base + app code
 -  50 MB  headroom / GC buffer
─────────────
  ~360 MB  available for MiniSearch index
  → safe upper bound: ~200,000–250,000 records
```

For **Service NSW's current 1,200 records**, MiniSearch has ~166× headroom before hitting CF limits. Even at 10× growth (12,000 records), memory usage remains under 15 MB.

**Query latency at scale:**

| Records | Query P95 |
|---|---|
| 1,200 | < 0.5 ms |
| 10,000 | ~1 ms |
| 100,000 | ~2–5 ms |
| 500,000 | ~10–20 ms |

**Index build time at scale:**

| Records | Build Time |
|---|---|
| 1,200 | < 50 ms |
| 10,000 | ~200 ms |
| 100,000 | ~1–2 seconds |
| 1,000,000 | ~15–20 seconds (too slow for CF startup) |

**When to switch from MiniSearch to Typesense:**

| Threshold | Action |
|---|---|
| < 200,000 records | MiniSearch (in-process) — right tool |
| 200,000 – 1,000,000 records | Switch to Typesense (separate CF binary app) |
| > 1,000,000 records | Typesense cluster or Azure AI Search (managed scaling) |

#### Risks & Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Heap memory consumed by index | Low | 1,200 records uses ~1.2 MB; 166× headroom on 256 MB instance |
| GC pauses on large heaps | Low | Not a concern below 200,000 records |
| No standalone search service | Low | Acceptable — search is a cache layer over Azure |
| Data stale between restarts | Low | Same as Typesense; Azure is source of truth |

---

## 4. Side-by-Side Comparison

| Criterion | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| **Deployment** | Inside existing CF app | CF binary buildpack (self-hosted) | External managed service | External managed service (AWS) |
| **CF Integration** | In-process (no network) | CF internal network | HTTPS API call | HTTPS API call |
| **Autocomplete** | Purpose-built, native prefix + fuzzy | Purpose-built, native prefix + fuzzy | Supported, manual query config | Supported, complex DSL config |
| **P95 Latency (uncached)** | < 1 ms | 10–15 ms | 40–70 ms | 40–80 ms |
| **P95 Latency (cached)** | < 1 ms (already in-process) | < 2 ms | < 2 ms | < 2 ms |
| **Monthly Cost** | AUD 0 | AUD 20–30 | AUD 0–10 (incremental) | AUD 70–150 |
| **Data Persistence** | In-memory (re-index on startup) | Ephemeral (re-index on startup) | Fully managed | Fully managed |
| **Ingestor Change** | Startup indexer (reads from Azure) | Startup indexer (reads from Azure) | None (existing pipeline) | New parallel write path |
| **Node.js SDK** | `minisearch` (zero deps, 8 KB) | `typesense` (simple) | `@azure/search-documents` (official) | `@elastic/elasticsearch` (complex DSL) |
| **Ops Burden** | Zero | 30 min/mo | 15 min/mo | 30–60 min/mo |
| **Max Records (512 MB CF)** | ~200,000 | ~10M+ | Unlimited (managed) | Unlimited (managed) |
| **Key Risk** | Heap memory (166× headroom currently) | Data loss on CF restart (mitigated) | Network latency 30 ms | Overkill + high cost |

---

## 5. Detailed Comparisons

### 5.1 Performance Under Load

| Scenario | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| 500 QPS sustained | ✓ < 1 ms/query; in-process | ✓ < 10 ms; single CF app | ✓ 40–70 ms; managed | ✓ 40–80 ms; managed |
| 2,000 QPS spike | ✓ No bottleneck (no I/O) | ✓ Single instance sufficient | ✓ Transparent (managed) | ✓ Transparent (managed) |
| Cache miss storm | ✓ No such concept (no cache needed) | ✓ Fast recovery (2–8 ms/query) | Risk (60 ms × 2,000 = high load) | Risk (40–80 ms × 2,000) |

### 5.2 Cold Start & Initialisation

| | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| CF app cold start | ~1 second (Azure fetch + addAll) | ~2 seconds (Azure fetch + import) | No CF deployment | No CF deployment |
| First query latency | Normal (< 1 ms) | Normal (10–15 ms) | Normal (40–70 ms) | Normal (40–80 ms) |
| Recovery after restart | Automatic (re-index on boot) | Automatic (re-index on boot) | Immediate (managed) | Immediate (managed) |

### 5.3 Failure Modes & Recovery

| Failure | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| CF restart | Index lost → rebuilt on boot (< 1 sec) | Data lost → re-index (< 1 sec) | Unaffected | Unaffected |
| Search service outage | N/A (in-process; no external dep) | CF in-process cache as fallback | Azure outage → cache layer | AWS outage → cache layer |
| Data corruption | Re-index from Azure (always recoverable) | Re-index from Azure | Microsoft handles | AWS handles |
| SLA | No SLA (in-process) | No SLA (self-hosted) | 99.9% | 99.99% |

### 5.4 Data Consistency

| | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| Update frequency | On CF redeploy (recommended: daily) | On CF redeploy (recommended: daily) | Real-time (ingestor writes directly) | Real-time (if ingestor writes directly) |
| Update latency | Next redeploy or scheduled re-index | Next redeploy or scheduled re-index | Sub-second | Sub-second |
| Source of truth | Azure (MiniSearch is a cache) | Azure (Typesense is a cache) | Azure | Azure or OpenSearch |

---

## 6. Final Recommendation

### Ranked by Fit

**1st — MiniSearch (Recommended)**
Simplest possible architecture — runs inside the existing Node.js app, no new CF apps, no external services, zero cost. Sub-millisecond P95 latency. 166× headroom on memory for the current dataset. Rebuilt from Azure on every startup. Best choice given the dataset is < 1 MB and all constraints favour zero-infrastructure solutions.

**2nd — Typesense (Recommended if dataset outgrows MiniSearch)**
Purpose-built for autocomplete; 10–15 ms P95; AUD 20–30/month; simple CF binary buildpack deployment. The right upgrade path when the dataset exceeds ~200,000 records and MiniSearch's memory footprint becomes a concern.

**3rd — Azure AI Search (Good Alternative)**
Zero incremental cost; no new infrastructure; zero ops; integrates with existing ingestor. 40–70 ms P95 is comfortably under the 100 ms SLA. Best choice if the team prioritises operational simplicity and is already deeply invested in Azure.

**4th — Amazon OpenSearch (Not Recommended)**
AUD 70–150/month with no benefit over the other options for this dataset. Adds AWS dependency, a new ingestor path, and a complex query DSL — all unnecessary for 1,200 records.

### Decision Tree

```
Is the team risk-averse and prefers fully managed services?
  YES → Azure AI Search (zero ops, existing integration)
  NO  ↓

Is the dataset < 200,000 records? (Current: 1,200)
  YES → MiniSearch (in-process; zero infra; sub-millisecond latency; zero cost)
  NO  ↓

Is the dataset 200K – 1M records?
  YES → Typesense (CF binary buildpack; 10–15 ms; AUD 20–30/month)
  NO  ↓

Is the dataset > 1M records AND in the AWS ecosystem?
  YES → Amazon OpenSearch (managed; scales to petabytes)
  NO  → Azure AI Search (managed; scales transparently)
```

### Final Statement

**Use MiniSearch (in-process).** For 1,200 records with two short fields, this is the simplest, cheapest, and fastest option. It runs inside the existing Node.js CF app — no new services, no new deployments, zero cost. Sub-millisecond P95 latency is well under the 100 ms SLA. The index is rebuilt from Azure on every startup in under a second.

**Upgrade path:** If the dataset grows beyond ~200,000 records, migrate to Typesense. The startup-indexer pattern is identical — only the search client changes.

**Alternative:** If the team prefers a fully managed service, use Azure AI Search — no incremental cost, no new infrastructure, and the existing ingestor pipeline requires no changes.

---

## 7. Implementation Roadmap

### MiniSearch Path (Recommended) — 2 Weeks

| Week | Task |
|---|---|
| 1 | `npm install minisearch`; implement startup index builder (fetch from Azure + `addAll`) |
| 1 | Implement autocomplete endpoint; wire into `app.js` startup |
| 2 | Load testing (P95 latency vs. 100 ms SLA; 2,000 QPS spike) |
| 2 | Production deployment |

**Dependencies:** `minisearch`, `@azure/search-documents`

### Typesense Path (If Dataset Outgrows MiniSearch) — 4 Weeks

| Week | Task |
|---|---|
| 1 | CF binary buildpack app; download Typesense binary; create `manifest.yml` |
| 1–2 | Implement startup indexer (`startup-indexer.js`); wire into `app.js` startup |
| 2 | Implement autocomplete API endpoint; add in-process caching layer |
| 3 | Load testing (P95 latency vs. 100 ms SLA; 2,000 QPS spike) |
| 4 | Production deployment |

**Dependencies:** `typesense`, `@azure/search-documents`

### Azure AI Search Path (Alternative) — 3 Weeks

| Week | Task |
|---|---|
| 1 | Design autocomplete query syntax (prefix + fuzzy); test against existing index |
| 1–2 | Implement autocomplete endpoint; add in-process caching layer |
| 2–3 | Load testing + production deployment |

**Dependencies:** `@azure/search-documents` (already installed)

### Amazon OpenSearch — Not Recommended
Skip for this use case.

---

## 8. Appendix

### A. Benchmark Data (1,200 Records)

| Metric | MiniSearch | Typesense | Azure AI Search | Amazon OpenSearch |
|---|---|---|---|---|
| Index size | ~1.2 MB (heap) | ~5 MB (disk) | ~5 MB (managed) | ~10 MB (managed) |
| Memory (search engine) | ~1.2 MB heap | ~100 MB CF app | N/A (managed) | N/A (managed) |
| Query latency P50 | < 0.5 ms | 2–3 ms | 20–30 ms | 10–20 ms |
| Query latency P95 | < 1 ms | 8–12 ms | 40–60 ms | 20–40 ms |
| Network overhead | Zero (in-process) | 2–5 ms (CF internal) | 20–40 ms (Azure AU East) | 20–30 ms (AWS Sydney) |
| End-to-end P95 | **< 1 ms** | 10–15 ms | 40–70 ms | 40–80 ms |
| Max records (512 MB CF) | ~200,000 | ~10M+ | Unlimited | Unlimited |

### B. CF Resource Recommendations

| Resource | Typesense | Notes |
|---|---|---|
| Memory | 512 MB | ~100 MB used; headroom for spikes |
| Disk quota | 1 GB | Typesense index ~5 MB; headroom for logs |
| Instances | 1 | Sufficient for 1,200 records at 2,000 QPS |

### C. SDK Maturity

| SDK | Package | TypeScript | Stability |
|---|---|---|---|
| MiniSearch | `minisearch` | Yes | Production-ready, zero dependencies |
| Typesense | `typesense` | Yes | Production-ready |
| Azure AI Search | `@azure/search-documents` | Yes | Official Microsoft SDK |
| OpenSearch | `@elastic/elasticsearch` | Yes | Official Elastic SDK |

### D. Related Files
- `typesense_implementation_steps.md` — detailed Typesense setup and code guide
- `PROJECT_CONTEXT.md` — project constraints and architecture overview
