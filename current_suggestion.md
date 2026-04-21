  ---
  Cloud Foundry — Impact on the Architecture

  Simplifies things significantly:

  ┌──────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │                       Before (assumption)                        │                              Now (CF reality)                               │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Cloudflare Workers or Azure Functions needed to avoid cold start │ CF app is always-on — HFS Trie lives in process memory, no warm-up required │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Workers KV needed to persist HFS across deployments              │ Standard cf start warms the Trie at boot from the HFS list                  │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Complex edge runtime setup                                       │ Just a Node.js CF app; Azure key injected via cf set-env                    │
  ├──────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Response cache required external store                           │ In-process Map (TTL 60 s) is sufficient                                     │
  └──────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  Cloudflare Workers is now optional — worth considering only if you want a CDN edge cache in front of the CF app for Sydney-region latency gains, but not required.

  ---
  LLM / AI Path — Three Options

  Since a live LLM call adds 200–500 ms and breaks the SLA, all viable options work offline or async:

  ┌──────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────┬──────────────────────────────────────────────────┐
  │          Option          │                                             How                                             │       SLA Impact        │                  Recommendation                  │
  ├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────┤
  │ A — Pre-computed answers │ Nightly GPT-4o-mini batch over all 1,000 HFS queries; answers stored in memory              │ None                    │ ⭐ Start here                                    │
  ├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────┤
  │ B — Async streaming      │ Fire LLM async on question-intent queries; stream answer back via SSE after initial results │ None for first response │ Add later if conversational Q&A is prioritised   │
  ├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────────────────────────────┤
  │ C — Query reformulation  │ LLM rewrites ambiguous/misspelt queries on cache miss; cached at 1 hr TTL                   │ First occurrence only   │ Add if search recall metrics show long-tail gaps │
  └──────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────┴──────────────────────────────────────────────────┘

  Option A is the right first move — ~$0.05/day, zero latency cost, highest quality improvement for the most common queries.