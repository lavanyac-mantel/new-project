# Slide 1 — Problem Statement

## Title
Search Autocomplete — From Raw Index to User-Ready Suggestions

## Description
Service NSW operates a Knowledge Management System used by customer care agents to quickly find answers to citizen enquiries across government services — covering housing, transport, licensing, fines, and more. Agents type queries in real time while on a call or handling a request. Without a responsive autocomplete layer, agents must recall and type full queries before results appear, slowing resolution time and impacting service quality. The goal is to surface relevant suggestions instantly as the agent types.

## Examples

User types "renew driv" →
- renew driver licence
- renew driver licence online
- renew driver licence after expiry
- renew driving authority

User types "how do I pay" →
- how do I pay a fine
- how do I pay for vehicle registration
- how do I pay stamp duty
- how do I pay a toll notice

User types "working with chil" →
- working with children check
- working with children check application
- working with children check renewal
- working with children check NSW requirements

## Constraints

| Constraint      | Requirement                                              |
|-----------------|----------------------------------------------------------|
| Latency         | < 100ms end-to-end, sub-millisecond for common queries   |
| Cost            | Minimal — no always-on databases, no per-query LLM calls |
| Infrastructure  | Existing Cloud Foundry deployment — no new compute       |
| Data freshness  | Suggestions must reflect content updates within the day  |
