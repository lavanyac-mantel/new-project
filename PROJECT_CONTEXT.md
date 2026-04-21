# Project Context: Service NSW Autocomplete API

## 🎯 High-Level Objective
Build a high-performance (<100ms P95) autocomplete API that handles both **Keyword Completion** and **Question Completion** 
They already have a node js application with Search API and it's already using Azure search AI, I'm going to add Autocomplete API 

## 🏗️ Architecture Stack
- **Compute:** Cloud Foundry (Node.js Buildpack).
- **Search Engine:** Azure AI Search (existing resource) but we're free to use anything we want if the other option achieves our objectives
- **Cache/Speed Layer:** In-memory Trie (HFS list) — **No Redis/Always-on DBs.**
- **Data Sources:** They have ingestor which scrapes the data from various websites and ingests data into Azure as of now, but we can ingest that into anything we choose

## ⚡ Performance & Cost Constraints
- **Latency Budget:** Total round-trip < 100ms. 
- **Cost:** Must be as minimal as possible.
<!-- 
## 🧠 Smart Logic Rules
1. **Normalisation:** Lowercase/trim all queries.
2. **Intent Detection:** - Keywords: default path.
   - Questions: Triggered by (who/what/where/how/can/?) or queries > 4 words.
3. **Fuzzy Match:** Use `queryType=full` with `~1` edit distance for keywords.
4. **HFS Intercept:** Check the local Top-1000 list before hitting Azure. -->

## 🛠️ Infrastructure Details
- **Azure API Version:** 2024-07-01
- **Deployment Platform:** Cloud Foundry

## Evaluate 
- **Evalaute Amazon open-search **
- **Evalaute Typesense / Millisearch **
- **Azure AI Search **