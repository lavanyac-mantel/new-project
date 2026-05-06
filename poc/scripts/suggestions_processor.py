"""
Suggestions Processor
=====================
Reads markdown files from the data/ folder, extracts keyword and question
suggestions, and ingests them into a dedicated Azure AI Search suggestions
index alongside saving a suggestions.json for Azure Blob upload.

Runs alongside the existing ingestor pipeline — no changes to existing processors.

Usage:
    python suggestions_processor.py

Environment variables:
    AZURE_SEARCH_ENDPOINT       — Azure AI Search service URL
    AZURE_SEARCH_API_KEY        — Azure AI Search admin key
    SUGGESTIONS_INDEX_NAME      — default: search-suggestions-index
    AZURE_OPENAI_ENDPOINT       — Azure OpenAI endpoint
    AZURE_OPENAI_API_KEY        — Azure OpenAI key
    AZURE_OPENAI_DEPLOYMENT     — deployment name (e.g. gpt-4o-mini)
    DATA_DIR                    — path to markdown files, default: ./data
    SUGGESTIONS_OUTPUT_DIR      — output path for suggestions.json, default: ./output
    MANIFEST_PATH               — change-detection manifest, default: .suggestions_manifest.json
"""

import os
import re
import json
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    LexicalAnalyzerName,
)
from openai import AzureOpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

AZURE_SEARCH_ENDPOINT   = os.environ["AZURE_SEARCH_ENDPOINT"]
AZURE_SEARCH_API_KEY    = os.environ["AZURE_SEARCH_API_KEY"]
SUGGESTIONS_INDEX_NAME  = os.environ.get("SUGGESTIONS_INDEX_NAME", "search-suggestions-index")

AZURE_OPENAI_ENDPOINT   = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_OPENAI_API_KEY    = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_OPENAI_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

DATA_DIR                = Path(os.environ.get("DATA_DIR", "./data"))
SUGGESTIONS_OUTPUT_DIR  = Path(os.environ.get("SUGGESTIONS_OUTPUT_DIR", "./output"))
MANIFEST_PATH           = Path(os.environ.get("MANIFEST_PATH", ".suggestions_manifest.json"))

# Headings that appear on every NSW Gov page — skip them
BOILERPLATE_HEADINGS = {
    "get help from nsw fair trading",
    "legislation supporting this page",
    "related information",
    "contact us",
    "feedback",
    "last updated",
    "on this page",
}

QUESTION_RE = re.compile(
    r"^(how (do|can|should|long|much)|what (is|are|do|happens)|"
    r"when (do|can|should|is)|where (can|do|should)|"
    r"can i|do i need|am i eligible|who (is|can|needs))",
    re.IGNORECASE,
)

LINK_RE = re.compile(r"\[(.+?)\]\(.+?\)")  # strips markdown link syntax

# ---------------------------------------------------------------------------
# Azure clients (initialised once)
# ---------------------------------------------------------------------------

_search_credential   = AzureKeyCredential(AZURE_SEARCH_API_KEY)
_index_client        = SearchIndexClient(AZURE_SEARCH_ENDPOINT, _search_credential)
_openai_client       = AzureOpenAI(
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    api_key=AZURE_OPENAI_API_KEY,
    api_version="2024-02-01",
)

# ---------------------------------------------------------------------------
# Index management
# ---------------------------------------------------------------------------

def create_suggestions_index() -> None:
    """Create search-suggestions-index if it does not already exist."""
    fields = [
        SimpleField(
            name="id",
            type=SearchFieldDataType.String,
            key=True,
            filterable=True,
        ),
        SearchableField(
            name="text",
            type=SearchFieldDataType.String,
            analyzer_name=LexicalAnalyzerName.EN_MICROSOFT,
        ),
        SimpleField(
            name="type",
            type=SearchFieldDataType.String,
            filterable=True,
            facetable=True,
        ),
        SimpleField(
            name="weight",
            type=SearchFieldDataType.Double,
            sortable=True,
            filterable=True,
        ),
    ]

    index = SearchIndex(name=SUGGESTIONS_INDEX_NAME, fields=fields)
    _index_client.create_or_update_index(index)
    log.info("Index ready: %s", SUGGESTIONS_INDEX_NAME)

# ---------------------------------------------------------------------------
# Markdown parsing
# ---------------------------------------------------------------------------

def parse_markdown_zones(markdown: str) -> dict:
    """Split markdown into labelled zones for targeted extraction."""
    zones: dict = {
        "h1": [],
        "h2": [],
        "list_items": [],
        "related_links": [],
        "body_paragraphs": [],
    }
    in_related = False

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("# "):
            zones["h1"].append(line[2:].strip())

        elif line.startswith("### "):
            heading = line[4:].strip()
            if heading.lower() not in BOILERPLATE_HEADINGS:
                zones["h2"].append(heading)

        elif line.startswith("## "):
            heading = line[3:].strip()
            in_related = "related" in heading.lower()
            if heading.lower() not in BOILERPLATE_HEADINGS:
                zones["h2"].append(heading)

        elif line.startswith(("- ", "* ")):
            item = LINK_RE.sub(r"\1", line[2:]).strip()
            if in_related:
                zones["related_links"].append(item)
            else:
                zones["list_items"].append(item)

        elif not line.startswith("#") and len(line) > 30:
            zones["body_paragraphs"].append(line)

    return zones

# ---------------------------------------------------------------------------
# Rule-based keyword extraction
# ---------------------------------------------------------------------------

def extract_keywords(markdown: str) -> list[dict]:
    """Extract keyword suggestions from markdown structure."""
    zones  = parse_markdown_zones(markdown)
    result = []

    # Priority 1: H1 — canonical service name
    for text in zones["h1"]:
        if is_valid_phrase(text):
            result.append({"text": normalise(text), "type": "keyword", "weight": 10.0})

    # Priority 2: Related links — pre-curated by content editors
    for text in zones["related_links"]:
        if is_valid_phrase(text):
            result.append({"text": normalise(text), "type": "keyword", "weight": 9.0})

    # Priority 3: H2 / H3 headings
    for text in zones["h2"]:
        if is_valid_phrase(text):
            result.append({"text": normalise(text), "type": "keyword", "weight": 7.0})

    # Priority 4: Short list items
    for text in zones["list_items"]:
        if is_valid_phrase(text):
            result.append({"text": normalise(text), "type": "keyword", "weight": 5.0})

    return result

# ---------------------------------------------------------------------------
# LLM question generation
# ---------------------------------------------------------------------------

def extract_headings(markdown: str) -> list[str]:
    """Extract H1 + H2 + H3 headings only — the LLM input boundary."""
    headings = []
    for line in markdown.splitlines():
        line = line.strip()
        if line.startswith(("# ", "## ", "### ")):
            text = re.sub(r"^#+\s+", "", line).strip()
            if text.lower() not in BOILERPLATE_HEADINGS:
                headings.append(text)
    return headings


def extract_questions_llm(markdown: str) -> list[dict]:
    """
    Send headings-only to Azure OpenAI and generate natural question suggestions.
    Headings are 50–150 tokens per document — cheap to process.
    """
    headings = extract_headings(markdown)
    if not headings:
        return []

    prompt = (
        "The following are headings from an NSW Government service page:\n\n"
        + "\n".join(f"- {h}" for h in headings)
        + "\n\nGenerate 3 to 5 natural questions (4 to 12 words each) that a citizen "
        "or customer care agent might type to find this service. "
        'Respond with JSON only in this format: {"questions": ["...", "..."]}'
    )

    try:
        response = _openai_client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=300,
        )
        data     = json.loads(response.choices[0].message.content)
        questions = data.get("questions", [])
    except Exception as exc:
        log.warning("LLM question generation failed: %s", exc)
        return []

    result = []
    for q in questions:
        if isinstance(q, str) and is_valid_phrase(q):
            result.append({"text": normalise(q), "type": "question", "weight": 7.0})

    return result

# ---------------------------------------------------------------------------
# Normalise + deduplicate
# ---------------------------------------------------------------------------

def normalise(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s\-]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def phrase_id(text: str) -> str:
    return hashlib.sha256(normalise(text).encode()).hexdigest()[:16]


def is_valid_phrase(text: str) -> bool:
    words = text.split()
    return 2 <= len(words) <= 12


def deduplicate(suggestions: list[dict]) -> list[dict]:
    """Keep highest-weight suggestion on hash collision."""
    seen: dict[str, dict] = {}
    for s in suggestions:
        key = phrase_id(s["text"])
        if key not in seen or s["weight"] > seen[key]["weight"]:
            seen[key] = {**s, "id": key}
    return list(seen.values())

# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------

def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def get_changed_files(data_dir: Path, manifest: dict) -> list[Path]:
    """Return markdown files whose content has changed since last run."""
    changed = []
    for path in sorted(data_dir.glob("**/*.md")):
        if manifest.get(str(path)) != _file_hash(path):
            changed.append(path)
    return changed


def update_manifest(manifest: dict, paths: list[Path]) -> dict:
    for path in paths:
        manifest[str(path)] = _file_hash(path)
    return manifest

# ---------------------------------------------------------------------------
# Azure AI Search upsert
# ---------------------------------------------------------------------------

def upsert_to_index(suggestions: list[dict]) -> None:
    """Batch upsert suggestions into search-suggestions-index."""
    if not suggestions:
        return

    client     = SearchClient(AZURE_SEARCH_ENDPOINT, SUGGESTIONS_INDEX_NAME, _search_credential)
    batch_size = 100

    for i in range(0, len(suggestions), batch_size):
        batch = suggestions[i : i + batch_size]
        result = client.upload_documents(documents=batch)
        failed = [r for r in result if not r.succeeded]
        if failed:
            log.warning("%d documents failed to index in batch %d", len(failed), i // batch_size)

    log.info("Upserted %d suggestions to %s", len(suggestions), SUGGESTIONS_INDEX_NAME)

# ---------------------------------------------------------------------------
# Save suggestions.json for Azure Blob
# ---------------------------------------------------------------------------

def save_suggestions_json(suggestions: list[dict]) -> None:
    """Write suggestions.json to output dir for Azure Blob upload."""
    SUGGESTIONS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "keywords":  [s for s in suggestions if s["type"] == "keyword"],
        "questions": [s for s in suggestions if s["type"] == "question"],
    }
    out_path = SUGGESTIONS_OUTPUT_DIR / "suggestions.json"
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info(
        "Saved suggestions.json — %d keywords, %d questions",
        len(output["keywords"]),
        len(output["questions"]),
    )

# ---------------------------------------------------------------------------
# Per-document processing
# ---------------------------------------------------------------------------

def process_document(markdown: str) -> list[dict]:
    """Extract and merge keyword + question suggestions from one markdown file."""
    keywords  = extract_keywords(markdown)
    questions = extract_questions_llm(markdown)
    return deduplicate(keywords + questions)

# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------

def run_pipeline() -> None:
    log.info("Starting suggestions pipeline — data dir: %s", DATA_DIR)

    create_suggestions_index()

    manifest      = load_manifest()
    changed_files = get_changed_files(DATA_DIR, manifest)

    if not changed_files:
        log.info("No changed files detected — nothing to process")
        return

    log.info("%d file(s) changed — processing", len(changed_files))

    all_suggestions: list[dict] = []

    for path in changed_files:
        log.info("Processing: %s", path.name)
        try:
            markdown    = path.read_text(encoding="utf-8")
            suggestions = process_document(markdown)
            all_suggestions.extend(suggestions)
            log.info("  → %d suggestions extracted", len(suggestions))
        except Exception as exc:
            log.error("Failed to process %s: %s", path.name, exc)

    if all_suggestions:
        all_suggestions = deduplicate(all_suggestions)
        upsert_to_index(all_suggestions)
        save_suggestions_json(all_suggestions)

    save_manifest(update_manifest(manifest, changed_files))
    log.info("Pipeline complete — %d total suggestions", len(all_suggestions))


if __name__ == "__main__":
    run_pipeline()
