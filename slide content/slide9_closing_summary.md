# Slide 9 — Closing Summary

## Title
From Noisy Chunks to Precise Suggestions — A Clear Path Forward

---

## The Problem
Customer care agents need instant, relevant autocomplete suggestions while handling citizen enquiries. The existing search infrastructure returns raw, chunked data — too noisy, too long, and not fit for autocomplete.

---

## What We Proved

| What Was Tested | Result |
|---|---|
| Azure built-in suggester | Confirmed — dedicated suggestions layer is needed |
| LLM refinement of extracted content | Confirmed — clean, intent-aligned suggestions are achievable |
| MiniSearch as in-memory tier | Confirmed — sub-millisecond latency target is met |

---

## The Proposal in Three Lines
1. Extract clean suggestions from existing markdown files — no new data sources
2. Serve them from a two-tier cache — MiniSearch for speed, Azure AI Search for coverage
3. Keep them fresh via Azure Blob hot-reload — no restarts, no always-on infrastructure

---

## Why This Is the Right Approach

| Principle | How It's Met |
|---|---|
| Build on what exists | Azure AI Search, Cloud Foundry, existing ingestor — nothing replaced |
| Minimal cost | < $5/month — no new services, no per-query LLM calls |
| No new infrastructure | MiniSearch runs inside the existing Node.js process |
| Proven before proposed | Every layer validated in the POC before this proposal |
| Scales when needed | MiniSearch → RediSearch, polling → pub/sub — clear upgrade path |

---

## One Ask
Answers to the five open questions on Slide 8 — particularly data policy on OpenAI and instance count — are all that is needed to begin Phase 2.
