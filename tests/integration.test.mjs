// Integration tests against a running server (real Substack/xkcd upstreams).
// Run: npm run dev   (in another terminal), then: npm run test:integration
// Or against production: BASE_URL=https://mubbie.dev npm run test:integration

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const isLocal = /localhost|127\.0\.0\.1/.test(BASE);

// Local runs read the dev token from .dev.vars; production token is never needed here.
const devVars = new URL('../.dev.vars', import.meta.url);
const TOKEN = isLocal && existsSync(devVars)
  ? (readFileSync(devVars, 'utf8').match(/^REFRESH_TOKEN=(.+)$/m) || [])[1]
  : null;

const get = (path, headers = {}) => fetch(BASE + path, { headers, redirect: 'manual' });

before(async () => {
  try {
    await get('/');
  } catch {
    throw new Error(`No server at ${BASE}. Start one with: npm run dev`);
  }
});

test('posts: trimmed, small, cacheable JSON', async () => {
  const res = await get('/api/posts?limit=4');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=600');
  const text = await res.text();
  assert.ok(text.length < 5000, `payload ${text.length} bytes`);
  const posts = JSON.parse(text);
  assert.equal(posts.length, 4);
  for (const p of posts) {
    assert.deepEqual(Object.keys(p).sort(), ['canonical_url', 'post_date', 'slug', 'title', 'wordcount']);
  }
});

test('posts: second request is served from KV (or stale)', async () => {
  await get('/api/posts?limit=4');
  const res = await get('/api/posts?limit=1');
  assert.ok(['HIT-KV', 'STALE'].includes(res.headers.get('x-cache')), res.headers.get('x-cache'));
  assert.equal((await res.json()).length, 1);
});

test('refresh: ignored without a valid token', async () => {
  for (const headers of [{}, { Authorization: 'Bearer wrong-token' }]) {
    const res = await get('/api/posts?refresh=1', headers);
    assert.notEqual(res.headers.get('x-cache'), 'BYPASS');
  }
});

test('refresh: valid dev token bypasses the cache', { skip: !TOKEN && 'no local REFRESH_TOKEN in .dev.vars' }, async () => {
  const res = await get('/api/posts?refresh=1', { Authorization: `Bearer ${TOKEN}` });
  // STALE is fine too: it means the token worked but Substack refused (rate limit)
  assert.ok(['BYPASS', 'STALE'].includes(res.headers.get('x-cache')), res.headers.get('x-cache'));
});

test('xkcd: latest + specific comic', async () => {
  const latest = await get('/api/xkcd');
  assert.equal(latest.status, 200);
  const l = await latest.json();
  assert.ok(l.num > 0 && l.img.startsWith('https://'));

  const one = await (await get('/api/xkcd?num=353')).json();
  assert.equal(one.num, 353);
});

test('xkcd: errors are not cacheable', async () => {
  for (const [path, status] of [['/api/xkcd?num=abc', 400], ['/api/xkcd?num=0', 502]]) {
    const res = await get(path);
    assert.equal(res.status, status, path);
    assert.equal(res.headers.get('cache-control'), 'no-store', path);
  }
});

test('unknown /api route → JSON 404', async () => {
  const res = await get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /^application\/json/);
});

test('static assets are served', async () => {
  const paths = [
    '/', '/styles.css', '/favicon.svg', '/icons.svg', '/og-image.png',
    '/data/races.json', '/data/bucketlist.json', '/data/currently.json', '/data/fortunes.json',
    '/js/main.js', '/js/terminal/index.js',
  ];
  for (const p of paths) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
  }
});

test('data files are valid JSON with the expected shape', async () => {
  const races = await (await get('/data/races.json')).json();
  assert.ok(races.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.name && r.url));
  assert.deepEqual(races.map((r) => r.date), [...races.map((r) => r.date)].sort(), 'races sorted by date');

  const bucket = await (await get('/data/bucketlist.json')).json();
  assert.ok(bucket.every((b) => typeof b.item === 'string' && typeof b.done === 'boolean'));

  const now = await (await get('/data/currently.json')).json();
  assert.ok(now.every((n) => n.icon && n.label && n.value));
});

test('nested missing page → styled 404', async () => {
  const res = await get('/no/such/page');
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /href="\/styles\.css"/);
});
