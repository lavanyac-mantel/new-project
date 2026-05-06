# Cache Layer (Tier 0) — Selection Process & Decision Record

**Decision date:** May 2026
**Context:** In-process autocomplete cache for the Service NSW Knowledge Management System — prefix search on curated government suggestion phrases, atomic hot-reload, runs inside existing Node.js Cloud Foundry app.

---

## 1. Requirements

| Requirement | Detail |
|---|---|
| Search type | Prefix matching ("renew" → "renew driver licence", "renew registration"…) |
| Latency | Sub-millisecond — Tier 0 must return before any network hop |
| Hot-reload | Atomic index swap on suggestions refresh — no app restart |
| Infrastructure | In-process only — no new CF services, no new compute |
| Cost | $0 additional — runs inside existing Node.js process |
| TypeScript | Required |
| Security | Zero or minimal dependency surface — government deployment |

---

## 2. All Libraries Evaluated

### 2.1 Summary Scorecard

| Library | Version | Last Release | Stars | Open Issues | Prefix | Hot-Reload | TypeScript | CVEs | Active |
|---|---|---|---|---|---|---|---|---|---|
| **MiniSearch** | 7.2.0 | Sep 2025 | 5.9K | 7 | ✅ | ✅ Native | ✅ Full | None | ⚠️ See §3 |
| **FlexSearch** | 0.8.214 | Feb 2026 | 13.7K | 27 | ✅ | ✅ Fast-Update | ✅ Partial | 1 unresolved | ✅ |
| **Fuse.js** | 7.3.0 | Apr 2026 | 20.2K | 3 | ✅ (extended) | ❌ Full rebuild | ✅ Full | None | ✅ |
| **Orama** | 3.1.18 | Feb 2026 | 10.3K | 27 | ✅ | ✅ Insert/remove | ✅ Full | None | ✅ |
| **fuzzysort** | 3.1.0 | Oct 2024 | 4.3K | 15 | ❌ | ❌ | ✅ Full | None | ✅ |
| **Lunr.js** | 2.3.9 | Jul 2024 | 9.2K | 129 | ❌ | ❌ | ❌ | None | ❌ Stalled |
| **js-search** | 2.0.1 | May 2023 | 2.2K | 8 | ✅ (limited) | ❌ | ❌ Flow only | None | ❌ Abandoned |
| **Wade** | 0.3.3 | May 2023 | 3K | 4 | ❌ | ❌ | ❌ | None | ❌ Abandoned |
| **elasticlunr** | 0.9.6 | Dec 2022 | 2.1K | 77 | ❌ | ❌ | ❌ | None | ❌ Abandoned |

### 2.2 Disqualified Libraries

| Library | Reason |
|---|---|
| **Lunr.js** | 129 open issues, stalled 18+ months, no atomic hot-reload, no prefix matching natively, no TypeScript |
| **elasticlunr** | 77 open issues, stalled 1.5 years, no prefix search, no hot-reload, no TypeScript |
| **js-search** | Abandoned 3 years, uses Flow not TypeScript, no hot-reload |
| **Wade** | Abandoned 3 years, no prefix search, no fuzzy, no hot-reload |
| **fuzzysort** | No prefix matching — fuzzy-only design, no hot-reload, not an indexing engine |

### 2.3 Active Contenders — Why They Were Not Selected

**FlexSearch**
Close second. Actively maintained (Feb 2026), excellent throughput, Fast-Update Mode for hot-reload. Rejected for two reasons:
- Outstanding unresolved security advisory: **GHSA-8qq5-rm4j-mr97** (Feb 2026) in the `flexsearch → sqlite3 (unmaintained) → tar ≤7.5.2` dependency chain — an arbitrary file overwrite vulnerability. The in-memory path is not affected, but an unresolved critical advisory on any dependency is difficult to defend in a government security review.
- Still at `0.x` versioning — semver-legal breaking changes without a major bump.

**Fuse.js**
Most starred library (20.2K), most actively maintained (Apr 2026), cleanest issue queue (3 open). Rejected because:
- No native atomic hot-reload — updating suggestions requires instantiating a new `Fuse` object (full rebuild, not incremental).
- Built around fuzzy/approximate matching, not prefix completion. At short query lengths ("re"), it can surface semantically distant results — wrong UX for an autocomplete dropdown.

**Orama**
Most promising alternative. Zero deps, <2KB, TypeScript-first, vector search support. Rejected for now because:
- Relatively young project (rebranded from Lyra ~2023). Less battle-tested in production Node.js server deployments.
- ~150K weekly downloads vs MiniSearch's ~1.09M — adoption gap reflects maturity gap.
- Atomic hot-reload behaviour is not explicitly documented.

**Orama is the recommended alternative** if MiniSearch is replaced — it has the right architecture and is maturing quickly.

---

## 3. Selected Library: MiniSearch 7.2.0

### Why MiniSearch

| Criterion | Assessment |
|---|---|
| Prefix matching | Native — `search(query, { prefix: true })` |
| Atomic hot-reload | Native — `addAll` / `remove` on individual documents, no index rebuild |
| Zero dependencies | No transitive vulnerability surface |
| TypeScript | Full built-in types since v3+ |
| API stability | v7.x — stable, semver-governed |
| Government security audit | Clean npm audit, zero CVEs, single-file auditable codebase |
| npm adoption | ~1.09M weekly downloads — production-grade adoption |
| CF deployment | Pure Node.js in-process — no infrastructure changes |

### ⚠️ Known Risk: Inactive Development

**This is a documented and accepted risk.**

MiniSearch v7.2.0 was released on **16 September 2025**. As of May 2026, the maintainer has been silent for approximately **7.5 months**:

- 3 open PRs unreviewed (oldest: June 2025, 11 months waiting)
- Active bugs going unanswered (Issue #311, April 2026 — no response)
- Repository is **not archived or deprecated** — but also not active

**Why this is acceptable for now:**

1. **Feature-complete for our use case.** v7.2.0 covers prefix search, fuzzy match, atomic hot-reload, and TypeScript. No missing capability.
2. **Open issues do not affect our path.** Reported bugs are edge cases in `combineWith:'AND'` logic and tokeniser behaviour — not in prefix autocomplete.
3. **Zero dependencies means zero drift.** A quietly maintained library with no dependencies accumulates no transitive risk over time. It will not silently break due to an upstream package.
4. **Small, auditable codebase.** MiniSearch is ~1,500 lines. If a bug surfaces in our usage, it is fixable in-house or via a fork.

**Migration trigger — move to Orama if any of the following occur:**

| Trigger | Action |
|---|---|
| Repository is archived or deprecated | Migrate to Orama immediately |
| A bug surfaces that affects our autocomplete path and goes unpatched | Fork MiniSearch at 7.2.0 or migrate to Orama |
| Government security audit flags inactive maintenance as a blocker | Migrate to Orama |
| 12 months pass with zero maintainer activity (i.e., Sep 2026) | Evaluate Orama migration proactively |

---

## 4. MiniSearch vs RediSearch — When to Escalate

MiniSearch is the right Tier 0 choice **today**. RediSearch is the right choice **at scale**. These are not competing options for the same moment — they are sequential phases.

### Comparison

| | MiniSearch (in-process) | RediSearch (shared service) |
|---|---|---|
| **Cost** | $0 — runs in existing CF process | $5–50+/month managed; Azure Enterprise tier required for Azure Cache for Redis |
| **Latency** | Sub-millisecond — no network hop | ~1–5ms — Redis is a separate process |
| **Multi-instance consistency** | ⚠️ Per-instance — 30-min ETag polling gap | ✅ Shared — all CF instances instantly consistent |
| **Hot-reload** | ETag polling + POST `/reload` pub/sub | Native Redis pub/sub; `SUGADD`/`SUGDEL` incremental |
| **Popularity scoring** | Not available at launch | ✅ `SUGADD key phrase score INCR` — score increments per query |
| **Data growth ceiling** | Node.js heap (~100–500MB practical) | Redis memory — vertically scalable to GBs |
| **Persistence across restarts** | Rebuilt from Azure Blob on boot | ✅ RDB + AOF persistence |
| **Operational overhead** | None | Redis server + patching + monitoring + CF service broker |
| **CF compatibility** | ✅ Works today | ⚠️ Depends on CF broker; RediSearch module availability varies |
| **Security CVEs (2025–2026)** | None | Multiple RCE-class CVEs in Redis (patched in 8.6.3) — requires patching governance |
| **Battle-tested at enterprise scale** | Library-scale | ✅ Fortune 50, banking, healthcare, AI/ML at scale |
| **Versioning** | v7.x — stable | Integral to Redis 8 (May 2026) — mature |

### RediSearch Key Advantage: Multi-Instance Consistency

```
MiniSearch — current architecture
─────────────────────────────────
CF Instance 1  →  MiniSearch index A  (30-min polling lag)
CF Instance 2  →  MiniSearch index B  (30-min polling lag)
CF Instance 3  →  MiniSearch index C  (30-min polling lag)

Up to 30 min divergence. User on instance 1 may see
different suggestions than user on instance 2.

RediSearch — shared cache
─────────────────────────
CF Instance 1 ──┐
CF Instance 2 ──┼──→  Redis (single shared index)  ←  Ingestor writes once
CF Instance 3 ──┘

All instances always consistent. Ingestor updates propagate instantly.
```

### When to Migrate from MiniSearch to RediSearch

| Trigger | Why |
|---|---|
| CF instances > 3 | 30-min consistency window becomes user-visible at scale |
| Suggestion corpus > 50K entries | MiniSearch heap pressure becomes observable |
| Popularity scoring is required | RediSearch `SUGADD INCR` makes this trivial; MiniSearch has no equivalent |
| Always-on freshness required (<1 min) | RediSearch eliminates the polling gap entirely |

The architecture already documents RediSearch as the Phase 2 Tier 0 upgrade path. That framing is correct. The swap is designed to be straightforward — both expose the same query interface to the Node.js app layer.

---

## 5. Decision Summary

| Question | Answer |
|---|---|
| Tier 0 cache library | **MiniSearch 7.2.0** |
| Nearest alternative | **Orama** (if MiniSearch is abandoned) |
| Tier 0 upgrade path | **RediSearch** (Phase 2, when scale triggers are met) |
| MiniSearch inactive development | Accepted risk — feature-complete, zero deps, auditable codebase, clear migration triggers defined |
| FlexSearch rejected? | Yes — unresolved CVE in dependency chain; `0.x` versioning |
| Fuse.js rejected? | Yes — no atomic hot-reload; wrong search model for prefix autocomplete |
| Orama rejected now? | Yes — insufficient production track record today; first choice for migration |
