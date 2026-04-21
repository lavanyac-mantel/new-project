import MiniSearch from 'minisearch';
import { services, faqs } from './data/services.js';

// Fields indexed for full-text search; storedFields are returned in results
const FIELDS_TO_INDEX = ['title', 'description', 'keywords', 'category', 'agency'];
const STORED_FIELDS = ['title', 'description', 'category', 'agency', 'url'];

// Boost title and keywords heavily — these carry the strongest intent signal
const BOOST = { title: 3, keywords: 2, category: 1.5, agency: 1, description: 1 };

// Queries with these lead words (or > 4 tokens) are treated as questions
const QUESTION_PREFIXES = /^(who|what|where|when|why|how|can|is|are|do|does|will|should)\b/i;

function buildIndex() {
  const index = new MiniSearch({
    idField: 'id',
    fields: FIELDS_TO_INDEX,
    storeFields: STORED_FIELDS,
    searchOptions: {
      boost: BOOST,
      fuzzy: 0.2,        // ~1 edit distance on short terms
      prefix: true,      // prefix match drives autocomplete
      combineWith: 'OR', // surface partial matches
    },
  });

  index.addAll([...services, ...faqs]);
  return index;
}

// Singleton — built once at startup, queries are sub-millisecond thereafter
const index = buildIndex();

// Question titles for prefix-based question autocomplete
const questionTitles = faqs.map(q => q.title);

/**
 * Autocomplete query entry point.
 *
 * @param {string} query  - Raw user input
 * @param {object} opts
 * @param {number} opts.limit     - Max results (default 8)
 * @param {string} opts.category  - Optional category filter
 * @returns {{ type: 'keyword'|'question', results: object[], durationMs: number }}
 */
export function autocomplete(query, { limit = 8, category } = {}) {
  const start = performance.now();
  const q = query.trim().toLowerCase();

  if (!q) return { type: 'keyword', results: [], durationMs: 0 };

  const isQuestion = QUESTION_PREFIXES.test(q) || q.split(/\s+/).length > 4;

  const filter = category
    ? (result) => result.category.toLowerCase() === category.toLowerCase()
    : undefined;

  const raw = index.search(q, { filter });

  // For question intent, prefer FAQs (id starts with 'q'); for keyword intent prefer services
  const sorted = isQuestion
    ? [...raw].sort((a, b) => (b.id.startsWith('q') ? 1 : 0) - (a.id.startsWith('q') ? 1 : 0))
    : raw;

  const results = sorted.slice(0, limit).map(({ id, title, description, category, agency, url, score }) => ({
    id,
    title,
    description,
    category,
    agency,
    url,
    score: Math.round(score * 100) / 100,
  }));

  return {
    type: isQuestion ? 'question' : 'keyword',
    results,
    durationMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

/**
 * Return both question title completions and keyword completions for a partial query.
 *
 * @param {string} partial
 * @param {number} limit - Applied independently to each type
 * @returns {{ questions: string[], keywords: string[] }}
 */
export function suggest(partial, limit = 5) {
  const q = partial.trim().toLowerCase();
  if (!q) return { questions: [], keywords: [] };

  const questions = QUESTION_PREFIXES.test(q)
    ? questionTitles.filter(title => title.toLowerCase().startsWith(q)).slice(0, limit)
    : [];

  const keywords = index
    .autoSuggest(q, { fuzzy: 0.2, prefix: true })
    .slice(0, limit)
    .map((s) => s.suggestion);

  return { questions, keywords };
}
