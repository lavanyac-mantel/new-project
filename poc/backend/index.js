import { autocomplete, suggest } from './search.js';

const demos = [
  // Keyword completion
  { label: 'Keyword: "driv"',                  query: 'driv' },
  { label: 'Keyword: "renew lic"',             query: 'renew lic' },
  { label: 'Keyword: "fine"',                  query: 'fine' },
  { label: 'Keyword: "working with children"', query: 'working with children' },
  { label: 'Keyword: "cost of liv"',           query: 'cost of liv' },
  // Fuzzy — deliberate typo
  { label: 'Fuzzy: "licanse" (typo)',          query: 'licanse' },
  { label: 'Fuzzy: "registraton" (typo)',      query: 'registraton' },
  // Question completion
  { label: 'Question: "how do I renew"',       query: 'how do I renew' },
  { label: 'Question: "what documents"',       query: 'what documents' },
  { label: 'Question: "how long does a wwcc"', query: 'how long does a wwcc' },
  // Category filter
  { label: 'Category filter: "licence" in Transport', query: 'licence', opts: { category: 'Transport' } },
];

console.log('=== MiniSearch Autocomplete Demo — Service NSW ===\n');

for (const { label, query, opts = {} } of demos) {
  const { type, results, durationMs } = autocomplete(query, { limit: 5, ...opts });
  const suggestions = suggest(query, 3);

  console.log(`[${label}]`);
  console.log(`  Intent type : ${type}`);
  console.log(`  Suggestions : ${suggestions.join(' | ') || '(none)'}`);
  console.log(`  Results (${results.length}):`);
  for (const r of results) {
    console.log(`    • [${r.category}] ${r.title}  (score: ${r.score})`);
  }
  console.log(`  Duration    : ${durationMs}ms\n`);
}
