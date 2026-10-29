// ─── Same-origin proxies for APIs that send no CORS headers ───
//
//   GET /api/posts?limit=N   latest Substack posts (KV-cached, stale on upstream error)
//   GET /api/xkcd[?num=N]    an xkcd comic, for the terminal's `curl xkcd`
//
// Forcing a posts refresh: GET /api/posts?refresh=1 with `Authorization: Bearer <REFRESH_TOKEN>`.
// Without a valid token the param is ignored, so the public can't bypass the cache.

import { json, bearerMatches } from './http.js';

const SUBSTACK_BASE = 'https://notebook.mubbie.dev/api/v1/posts';
const POSTS_CACHE_KEY = 'posts-v3';
const POSTS_CACHE_TTL_SECONDS = 30 * 60;
const STALE_GRACE_SECONDS = 24 * 60 * 60; // serve stale this long if Substack is down
const POSTS_MAX_LIMIT = 20;
const POSTS_DEFAULT_LIMIT = 4; // the writing list's needs
const UPSTREAM_TIMEOUT_MS = 5000;
const PUBLIC_CACHE = 'public, max-age=600';

// Upstream failures carry a short code for headers and logs; raw error text stays in logs.
class UpstreamError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const errorCode = (err) => (err instanceof UpstreamError ? err.code : 'network');

async function fetchUpstream(url, userAgent) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new UpstreamError(`http-${res.status}`);
  return res.json();
}

async function fetchPosts() {
  const body = await fetchUpstream(`${SUBSTACK_BASE}?limit=${POSTS_MAX_LIMIT}`, 'mubbie.dev writing list');
  if (!Array.isArray(body)) throw new UpstreamError('bad-shape');
  // Keep only what the site uses; full posts (body_html etc.) run to ~500 KB
  return body.map(({ title, slug, canonical_url, post_date, wordcount }) => ({ title, slug, canonical_url, post_date, wordcount }));
}

// One cache entry holds the latest POSTS_MAX_LIMIT posts; every ?limit is a slice of it.
// Fewer Substack calls (it rate-limits) and one shared stale fallback.
export async function handlePosts(request, env, ctx) {
  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1' && bearerMatches(request, env.REFRESH_TOKEN);
  const rawLimit = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(POSTS_MAX_LIMIT, Math.max(1, rawLimit)) : POSTS_DEFAULT_LIMIT;
  const kv = env.POSTS_CACHE;

  // Always read KV, so a forced refresh still has a stale fallback if Substack fails
  let stale = null;
  if (kv) {
    try {
      const { value, metadata } = await kv.getWithMetadata(POSTS_CACHE_KEY, 'json');
      if (!force && value && metadata && Date.now() - metadata.fetchedAt < POSTS_CACHE_TTL_SECONDS * 1000) {
        return json(value.slice(0, limit), 200, { 'Cache-Control': PUBLIC_CACHE, 'X-Cache': 'HIT-KV' });
      }
      stale = value;
    } catch {
      // KV read failure: fall through to upstream
    }
  }

  try {
    const posts = await fetchPosts();
    if (kv) {
      ctx.waitUntil(kv.put(POSTS_CACHE_KEY, JSON.stringify(posts), {
        expirationTtl: POSTS_CACHE_TTL_SECONDS + STALE_GRACE_SECONDS,
        metadata: { fetchedAt: Date.now() },
      }));
    }
    return json(posts.slice(0, limit), 200, { 'Cache-Control': PUBLIC_CACHE, 'X-Cache': force ? 'BYPASS' : 'MISS' });
  } catch (err) {
    console.error('posts upstream failed:', err);
    if (stale) {
      return json(stale.slice(0, limit), 200, { 'Cache-Control': PUBLIC_CACHE, 'X-Cache': 'STALE', 'X-Upstream-Error': errorCode(err) });
    }
    // The client falls back to its "could not load posts" message
    return json({ error: 'upstream-unavailable' }, 502, { 'X-Cache': 'MISS' });
  }
}

// No num → latest comic; ?num=N → that comic. Comics never change, so cache them hard.
export async function handleXkcd(request) {
  const num = new URL(request.url).searchParams.get('num');
  if (num !== null && !/^[1-9]\d{0,5}$/.test(num)) return json({ error: 'bad-num' }, 400);
  const upstream = num ? `https://xkcd.com/${num}/info.0.json` : 'https://xkcd.com/info.0.json';
  try {
    const comic = await fetchUpstream(upstream, 'mubbie.dev terminal xkcd');
    // the "latest" pointer changes a few times a week
    return json(comic, 200, { 'Cache-Control': `public, max-age=${num ? 86400 : 3600}` });
  } catch (err) {
    console.error('xkcd upstream failed:', err);
    return json({ error: 'upstream-unavailable' }, 502);
  }
}
