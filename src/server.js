import http from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { autocomplete, suggest } from './search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, 'public/index.html'));

const PORT = process.env.PORT || 3000;

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseQuery(url) {
  return Object.fromEntries(new URL(url, 'http://localhost').searchParams);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost`);
  const params = parseQuery(req.url);

  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(indexHtml);
  }

  if (pathname === '/autocomplete') {
    const q = params.q ?? '';
    const limit = parseInt(params.limit ?? '8', 10);
    const category = params.category ?? undefined;

    if (!q) return json(res, 400, { error: 'Missing query parameter: q' });
    return json(res, 200, autocomplete(q, { limit, category }));
  }

  if (pathname === '/suggest') {
    const q = params.q ?? '';
    const limit = parseInt(params.limit ?? '5', 10);

    if (!q) return json(res, 400, { error: 'Missing query parameter: q' });
    return json(res, 200, suggest(q, limit));
  }

  if (pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }

  json(res, 404, {
    error: 'Not found',
    endpoints: [
      'GET /autocomplete?q=<query>[&limit=8][&category=Transport]',
      'GET /suggest?q=<partial>[&limit=5]',
      'GET /health',
    ],
  });
});

server.listen(PORT, () => {
  console.log(`Service NSW autocomplete server running on http://localhost:${PORT}`);
  console.log(`  /autocomplete?q=renew`);
  console.log(`  /suggest?q=driv`);
});
