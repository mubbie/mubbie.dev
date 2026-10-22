// ─── Worker: serves assets + /api/posts ───
//
// Routes:
//   /api/posts       → cached Substack posts (same-origin proxy; Substack sends no CORS)
//   *                → static assets via env.ASSETS
//
// Caching: KV shared across all visitors (free-tier friendly), plus short
// browser/CDN caching on successful responses only.
//
// Forcing a refresh: GET /api/posts?refresh=1 with header
// `Authorization: Bearer <REFRESH_TOKEN>` (set via `wrangler secret put REFRESH_TOKEN`).
// Without a valid token the param is ignored, so the public can't bypass the cache.

const STALE_GRACE_SECONDS = 24 * 60 * 60; // 24 hours: serve stale if upstream is down

// Substack posts proxy config
const SUBSTACK_BASE = 'https://notebook.mubbie.dev/api/v1/posts';
const POSTS_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes
const POSTS_MAX_LIMIT = 20;
const UPSTREAM_TIMEOUT_MS = 5000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/posts') {
      return handlePosts(request, env, ctx);
    }

    if (url.pathname === '/api/xkcd') {
      return handleXkcd(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'not-found' }, {}, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

// ─── Substack posts ───
// Substack's public posts API works server-to-server but returns no CORS headers,
// so browsers can't call it directly. We proxy it here and cache in KV, serving
// stale on error so a Substack hiccup doesn't blank the page.
async function handlePosts(request, env, ctx) {
  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1' && isAuthorized(request, env);

  // Clamp limit to a sane range; default 4 (the writing list's needs).
  const rawLimit = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(POSTS_MAX_LIMIT, Math.max(1, rawLimit))
    : 4;

  const cacheKey = `posts-v2-${limit}`;

  // 1. KV cache lookup
  let cached = null;
  if (!force && env.POSTS_CACHE) {
    try {
      const { value, metadata } = await env.POSTS_CACHE.getWithMetadata(cacheKey, 'json');
      if (value && metadata && Date.now() - metadata.fetchedAt < POSTS_CACHE_TTL_SECONDS * 1000) {
        return jsonResponse(value, { 'X-Cache': 'HIT-KV' });
      }
      if (value) cached = { value };
    } catch (e) {
      // KV read failure → fall through to upstream
    }
  }

  // 2. Upstream call to Substack
  try {
    const data = await fetchFromSubstack(limit);
    if (env.POSTS_CACHE) {
      ctx.waitUntil(
        env.POSTS_CACHE.put(cacheKey, JSON.stringify(data), {
          expirationTtl: POSTS_CACHE_TTL_SECONDS + STALE_GRACE_SECONDS,
          metadata: { fetchedAt: Date.now() },
        }),
      );
    }
    return jsonResponse(data, { 'X-Cache': force ? 'BYPASS' : 'MISS' });
  } catch (err) {
    // 3. Stale-while-error: serve last good KV value if we have one
    if (cached && cached.value) {
      return jsonResponse(cached.value, {
        'X-Cache': 'STALE',
        'X-Upstream-Error': err.message.slice(0, 120),
      });
    }
    // 4. Hard failure: client falls back to its "could not load posts" message
    return jsonResponse(
      { error: 'upstream-unavailable', message: err.message.slice(0, 200) },
      { 'X-Cache': 'MISS' },
      502,
    );
  }
}

async function fetchFromSubstack(limit) {
  const res = await fetch(`${SUBSTACK_BASE}?limit=${limit}`, {
    headers: {
      'User-Agent': 'mubbie.dev writing list',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`substack ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error('substack: unexpected response shape');
  }
  // Keep only what the site uses; full posts (body_html etc.) run to ~500 KB
  return body.map((p) => ({
    title: p.title,
    slug: p.slug,
    canonical_url: p.canonical_url,
    post_date: p.post_date,
    wordcount: p.wordcount,
  }));
}

// ─── xkcd (terminal `curl xkcd`) ───
// xkcd's JSON API sends no CORS headers either. Proxy it: no num → latest comic,
// ?num=N → that specific comic. Comics are immutable, so cache them hard.
async function handleXkcd(request) {
  const num = new URL(request.url).searchParams.get('num');
  const upstream = num
    ? `https://xkcd.com/${parseInt(num, 10)}/info.0.json`
    : 'https://xkcd.com/info.0.json';

  if (num && !Number.isFinite(parseInt(num, 10))) {
    return jsonResponse({ error: 'bad-num' }, {}, 400);
  }

  try {
    const res = await fetch(upstream, {
      headers: { 'User-Agent': 'mubbie.dev terminal xkcd' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`xkcd ${res.status}`);
    const data = await res.json();
    // Specific comics never change; the "latest" pointer changes a few times a week.
    const maxAge = num ? 86400 : 3600;
    return jsonResponse(data, { 'Cache-Control': `public, max-age=${maxAge}` });
  } catch (err) {
    return jsonResponse(
      { error: 'upstream-unavailable', message: err.message.slice(0, 200) },
      {},
      502,
    );
  }
}

function isAuthorized(request, env) {
  const token = env.REFRESH_TOKEN;
  if (!token) return false;
  const enc = new TextEncoder();
  const given = enc.encode(request.headers.get('Authorization') || '');
  const expected = enc.encode(`Bearer ${token}`);
  // Constant-time compare (lengths must match first)
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}

function jsonResponse(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Never let a transient error get cached by browsers or the CDN
      'Cache-Control': status === 200 ? 'public, max-age=600' : 'no-store',
      ...extraHeaders,
    },
  });
}
