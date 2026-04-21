/**
 * Latency benchmark for MiniSearch autocomplete.
 * Runs each query N times and reports p50/p95/p99 and mean.
 */
import { autocomplete, suggest } from './search.js';

const ITERATIONS = 1_000;

const queries = [
  'driv',
  'renew licence',
  'fine',
  'how do I renew my driver licence',
  'working with children',
  'licanse',          // fuzzy typo
  'cost of living',
  'vehicle registration',
  'birth certificate',
  'what documents do I need',
];

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function benchmark(label, fn) {
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    label,
    mean: (times.reduce((s, v) => s + v, 0) / times.length).toFixed(3),
    p50: percentile(times, 50).toFixed(3),
    p95: percentile(times, 95).toFixed(3),
    p99: percentile(times, 99).toFixed(3),
    max: times[times.length - 1].toFixed(3),
  };
}

console.log(`\n=== MiniSearch Latency Benchmark (${ITERATIONS.toLocaleString()} iterations each) ===\n`);
console.log(`${'Query'.padEnd(42)} ${'mean'.padStart(7)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'p99'.padStart(7)} ${'max'.padStart(7)}`);
console.log('-'.repeat(80));

for (const q of queries) {
  const row = benchmark(q, () => autocomplete(q, { limit: 8 }));
  console.log(
    `${row.label.padEnd(42)} ${(row.mean + 'ms').padStart(7)} ${(row.p50 + 'ms').padStart(7)} ${(row.p95 + 'ms').padStart(7)} ${(row.p99 + 'ms').padStart(7)} ${(row.max + 'ms').padStart(7)}`
  );
}

// autoSuggest separately
console.log('\n--- autoSuggest ---');
for (const q of ['driv', 'renew', 'cost of']) {
  const row = benchmark(`suggest: "${q}"`, () => suggest(q, 5));
  console.log(
    `${row.label.padEnd(42)} ${(row.mean + 'ms').padStart(7)} ${(row.p50 + 'ms').padStart(7)} ${(row.p95 + 'ms').padStart(7)} ${(row.p99 + 'ms').padStart(7)} ${(row.max + 'ms').padStart(7)}`
  );
}

console.log('\n100ms budget check: all p95 values should be well under 1ms (no network, in-process).\n');
