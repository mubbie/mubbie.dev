// Worker unit tests: mocked Substack/xkcd upstreams + in-memory KV. No network.
// Run: npm test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';

// Workers-only extension of Web Crypto; polyfill for Node
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

const { default: worker } = await import('../workers/index.js');

const POST = {
  title: 'T', slug: 's', canonical_url: 'https://x/p/s', post_date: '2026-01-01',
  wordcount: 500, body_html: 'x'.repeat(10_000), audience: 'everyone',
};
const ASSETS = { fetch: async () => new Response('asset') };

function makeKV() {
  const store = new Map();
  return {
    store,
    async getWithMetadata(key) {
      const e = store.get(key);
      return e ? { value: JSON.parse(e.value), metadata: e.metadata } : { value: null, metadata: null };
    },
    async put(key, value, opts) {
      store.set(key, { value, metadata: opts.metadata, ttl: opts.expirationTtl });
    },
  };
}

// Upstream mock: tests assign `upstream = async (url, init) => Response`
let upstream;
let upstreamCalls;
globalThis.fetch = async (url, init) => {
  upstreamCalls.push({ url: String(url), init });
  return upstream(String(url), init);
};

beforeEach(() => {
  upstreamCalls = [];
  upstream = async () => { throw new Error('unexpected upstream call'); };
});

async function call(path, env, headers = {}) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const res = await worker.fetch(new Request(`http://test${path}`, { headers }), env, ctx);
  await Promise.all(pending);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body };
}

const tooManyRequests = async () => new Response('', { status: 429, statusText: 'Too Many Requests' });

// ─── /api/posts ───

test('posts: cache miss fetches 20 from Substack, trims fields, writes KV', async () => {
  const KV = makeKV();
  upstream = async () => Response.json([POST]);
  const { res, body } = await call('/api/posts?limit=1', { POSTS_CACHE: KV, ASSETS });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Cache'), 'MISS');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=600');
  assert.deepEqual(body, [{ title: 'T', slug: 's', canonical_url: 'https://x/p/s', post_date: '2026-01-01', wordcount: 500 }]);
  assert.equal(new URL(upstreamCalls[0].url).searchParams.get('limit'), '20');
  assert.ok(upstreamCalls[0].init.signal instanceof AbortSignal, 'upstream fetch has a timeout signal');

  const entry = KV.store.get('posts-v3');
  assert.ok(entry, 'written to KV');
  assert.equal(entry.ttl, 30 * 60 + 24 * 3600);
});

test('posts: fresh KV hit skips Substack; every limit is a slice of one entry', async () => {
  const KV = makeKV();
  const many = Array.from({ length: 20 }, (_, i) => ({ ...POST, title: `P${i}` }));
  upstream = async () => Response.json(many);
  const env = { POSTS_CACHE: KV, ASSETS };

  const a = await call('/api/posts?limit=4', env);
  const b = await call('/api/posts?limit=1', env);
  const c = await call('/api/posts?limit=20', env);

  assert.equal(upstreamCalls.length, 1);
  assert.equal(b.res.headers.get('X-Cache'), 'HIT-KV');
  assert.equal(a.body.length, 4);
  assert.equal(b.body.length, 1);
  assert.equal(b.body[0].title, 'P0');
  assert.equal(c.body.length, 20);
});

test('posts: limit is clamped and defaults to 4', async () => {
  const many = Array.from({ length: 20 }, () => POST);
  upstream = async () => Response.json(many);
  const env = { POSTS_CACHE: makeKV(), ASSETS };
  for (const [q, n] of [['', 4], ['?limit=abc', 4], ['?limit=-5', 1], ['?limit=0', 1], ['?limit=999', 20]]) {
    const { body } = await call(`/api/posts${q}`, env);
    assert.equal(body.length, n, `limit query "${q}"`);
  }
});

test('posts: expired entry is refetched', async () => {
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS };
  upstream = async () => Response.json([POST]);
  await call('/api/posts', env);
  KV.store.get('posts-v3').metadata.fetchedAt = Date.now() - 31 * 60 * 1000;

  upstream = async () => Response.json([{ ...POST, title: 'NEW' }]);
  const { res, body } = await call('/api/posts', env);
  assert.equal(res.headers.get('X-Cache'), 'MISS');
  assert.equal(body[0].title, 'NEW');
});

test('posts: expired entry + Substack failure serves stale', async () => {
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS };
  upstream = async () => Response.json([POST, POST]);
  await call('/api/posts', env);
  KV.store.get('posts-v3').metadata.fetchedAt = 0;

  upstream = tooManyRequests;
  const { res, body } = await call('/api/posts?limit=1', env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Cache'), 'STALE');
  assert.match(res.headers.get('X-Upstream-Error'), /429/);
  assert.equal(body.length, 1);
});

test('posts: no cache + Substack failure → 502, never cached', async () => {
  upstream = async () => { throw new Error('network down'); };
  const { res, body } = await call('/api/posts', { POSTS_CACHE: makeKV(), ASSETS });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(body.error, 'upstream-unavailable');
});

test('posts: unexpected Substack shape → 502', async () => {
  upstream = async () => Response.json({ not: 'an array' });
  const { res } = await call('/api/posts', { POSTS_CACHE: makeKV(), ASSETS });
  assert.equal(res.status, 502);
});

test('posts: hung Substack is aborted after ~5s', { timeout: 10_000 }, async () => {
  upstream = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const keepAlive = setInterval(() => {}, 1000); // Node unrefs AbortSignal.timeout timers
  const t0 = Date.now();
  const { res } = await call('/api/posts', { POSTS_CACHE: makeKV(), ASSETS });
  clearInterval(keepAlive);
  const ms = Date.now() - t0;
  assert.equal(res.status, 502);
  assert.ok(ms >= 4500 && ms < 8000, `aborted after ${ms}ms`);
});

test('posts: works without a KV binding', async () => {
  upstream = async () => Response.json([POST]);
  const { res } = await call('/api/posts', { ASSETS });
  assert.equal(res.status, 200);
});

// ─── ?refresh=1 token gating ───

test('refresh: only a valid REFRESH_TOKEN bypasses the cache', async () => {
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS, REFRESH_TOKEN: 'secret123' };
  upstream = async () => Response.json([POST]);
  await call('/api/posts', env);
  assert.equal(upstreamCalls.length, 1);

  const none = await call('/api/posts?refresh=1', env);
  const wrong = await call('/api/posts?refresh=1', env, { Authorization: 'Bearer nope' });
  const prefix = await call('/api/posts?refresh=1', env, { Authorization: 'Bearer secret12' });
  assert.equal(none.res.headers.get('X-Cache'), 'HIT-KV');
  assert.equal(wrong.res.headers.get('X-Cache'), 'HIT-KV');
  assert.equal(prefix.res.headers.get('X-Cache'), 'HIT-KV');
  assert.equal(upstreamCalls.length, 1);

  const ok = await call('/api/posts?refresh=1', env, { Authorization: 'Bearer secret123' });
  assert.equal(ok.res.headers.get('X-Cache'), 'BYPASS');
  assert.equal(upstreamCalls.length, 2);
});

test('refresh: disabled when no secret is configured', async () => {
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS };
  upstream = async () => Response.json([POST]);
  await call('/api/posts', env);
  const r = await call('/api/posts?refresh=1', env, { Authorization: 'Bearer undefined' });
  assert.equal(r.res.headers.get('X-Cache'), 'HIT-KV');
});

test('refresh: forced refresh still falls back to stale if Substack fails', async () => {
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS, REFRESH_TOKEN: 'secret123' };
  upstream = async () => Response.json([POST]);
  await call('/api/posts', env);

  upstream = tooManyRequests;
  const { res, body } = await call('/api/posts?refresh=1&limit=1', env, { Authorization: 'Bearer secret123' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Cache'), 'STALE');
  assert.equal(body.length, 1);
});

// ─── /api/xkcd ───

test('xkcd: latest and specific comics, cached appropriately', async () => {
  upstream = async (url) => Response.json({ num: url.includes('/353/') ? 353 : 3000, img: 'https://imgs.xkcd.com/x.png' });
  const latest = await call('/api/xkcd', { ASSETS });
  assert.equal(latest.body.num, 3000);
  assert.equal(latest.res.headers.get('Cache-Control'), 'public, max-age=3600');
  assert.equal(upstreamCalls[0].url, 'https://xkcd.com/info.0.json');

  const one = await call('/api/xkcd?num=353', { ASSETS });
  assert.equal(one.body.num, 353);
  assert.equal(one.res.headers.get('Cache-Control'), 'public, max-age=86400');
  assert.ok(upstreamCalls[1].init.signal instanceof AbortSignal);
});

test('xkcd: bad num → 400, missing comic → 502, neither cached', async () => {
  const bad = await call('/api/xkcd?num=abc', { ASSETS });
  assert.equal(bad.res.status, 400);
  assert.equal(bad.res.headers.get('Cache-Control'), 'no-store');

  upstream = async () => new Response('', { status: 404 });
  const missing = await call('/api/xkcd?num=404', { ASSETS });
  assert.equal(missing.res.status, 502);
  assert.equal(missing.res.headers.get('Cache-Control'), 'no-store');
});

// ─── routing ───

test('routing: unknown /api → JSON 404; everything else → static assets', async () => {
  const api = await call('/api/anything', { ASSETS });
  assert.equal(api.res.status, 404);
  assert.match(api.res.headers.get('Content-Type'), /^application\/json/);
  assert.equal(api.res.headers.get('Cache-Control'), 'no-store');

  const page = await call('/index.html', { ASSETS });
  assert.equal(page.body, 'asset');
});
