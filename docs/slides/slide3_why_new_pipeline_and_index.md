# Slide 3 — Why a New Pipeline and New Index?

## Title
The Existing Index is Optimised for Retrieval — Not Autocomplete

## Description
The primary search index is built for document retrieval — finding the most relevant page given a full query. Its chunking strategy is intentionally verbose, preserving surrounding context for relevance ranking. That same verbosity makes it unsuitable as an autocomplete source. Suggestions must be short, clean, and atomic — a fundamentally different data shape.

## Pictorial — What the Existing Index Returns vs What Autocomplete Needs

```
User types: "renew"

┌─────────────────────────────────────────────────────────────┐
│  EXISTING INDEX (raw chunks)                                │
│                                                             │
│  "To renew your driver licence you will need to visit a     │
│   service centre or complete the process online through     │
│   the Service NSW website. You must ensure your licence     │
│   has not been expired for more than 5 years..."            │
│                                                             │
│  "Vehicle registration renewal can be completed online,     │
│   by phone, or at a service centre. You will need your      │
│   renewal notice or plate number to proceed..."             │
│                                                 ❌ Too long  │
│                                           ❌ Raw fragments  │
│                                          ❌ Not scannable   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW SUGGESTIONS INDEX (curated)                            │
│                                                             │
│  ✦ renew driver licence                                     │
│  ✦ renew vehicle registration                               │
│  ✦ renew boat licence                                       │
│  ✦ renew working with children check                        │
│                                                  ✅ Concise │
│                                               ✅ Scannable  │
│                                          ✅ Intent-aligned  │
└─────────────────────────────────────────────────────────────┘
```

## Why a New Pipeline?

| | Existing Ingestor | New Suggestions Pipeline |
|---|---|---|
| Input | Government web pages | Same markdown files |
| Processing | Dynamic chunking for context | Structural extraction + LLM for headings |
| Output unit | Context window chunk | Atomic keyword or question phrase |
| Optimised for | Retrieval ranking | Autocomplete display |
| Changes to existing flow | None | Runs alongside, independently |

## Why a New Index?

The suggestions index has a fundamentally different schema and query pattern to the primary index. It stores short phrases, not document chunks. It is queried with prefix matching, not full-text relevance ranking. Keeping them separate means each index can be tuned, scaled, and evolved independently.

```
search-index                    search-suggestions-index
────────────────────            ────────────────────────
id                              id
title                           text
content  (chunked)              type  (keyword | question)
url                             weight
metadata
agency
```
