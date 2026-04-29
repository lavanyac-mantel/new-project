# Slide 2 — Proposed Architecture

## Title
A Two-Tier Autocomplete Architecture

## Description
The proposed solution introduces a dedicated autocomplete layer alongside the existing search pipeline. It operates in two parts — a data pipeline that prepares and stores clean suggestions, and a two-tier query architecture that serves them with sub-millisecond performance.

## Part 1 — Data Pipeline
Suggestions are generated from the same markdown files already in the repository — no additional fetching. An extraction pipeline processes each file to produce clean keyword and question suggestions, deduplicates them, and uploads a single `suggestions.json` file to Azure Blob Storage. This file also gets ingested into a dedicated `search-suggestions-index` in Azure AI Search.

## Part 2 — Two-Tier Query Architecture

| Tier | Store             | Latency          | When Used                              |
|------|-------------------|------------------|----------------------------------------|
| 0    | In-memory cache (MiniSearch) | Sub-millisecond | Common queries — always checked first |
| 1    | Azure AI Search suggestions index | < 100ms | Fallback on cache miss        |

> **Tier 0 cache layer** can be implemented using MiniSearch (in-memory, no infrastructure cost), RediSearch (shared cache across instances, ideal at scale), or similar full-text caching solutions. MiniSearch is used in this implementation — lightweight, zero cost, and runs inside the existing Node.js process on Cloud Foundry.

## Diagram
*(insert both PlantUML diagrams here — data pipeline + query flow)*

## Key Points
- Azure Blob is the single source of truth for suggestions — loaded into MiniSearch on app boot
- MiniSearch index hot-reloads at runtime via polling or pub/sub broadcast — no app restart needed
- Tier 1 fallback ensures full coverage beyond the in-memory index
- Extraction pipeline runs alongside the existing ingestor — zero changes to primary search flow
- MiniSearch is designed to be lean — seeded with curated, high-signal suggestions; as usage grows, frequently asked questions and popular query patterns can be tracked and fed back into the index, continuously improving suggestion relevance without increasing infrastructure cost
