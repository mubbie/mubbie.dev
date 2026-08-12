// ─── Worker: serves assets + /api/posts ───
//
// Routes:
//   /api/posts       → cached Substack posts (same-origin proxy; Substack sends no CORS)
//   *                → static assets via env.ASSETS
//
// Caching layers (defense in depth + free-tier friendly):
//   - KV: shared across all visitors
//   - Client localStorage: set on the client side

const STALE_GRACE_SECONDS = 24 * 60 * 60; // 24 hours: serve stale if upstream is down

// Substack posts proxy config
const SUBSTACK_BASE = 'https://notebook.mubbie.dev/api/v1/posts';
const POSTS_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes
const POSTS_MAX_LIMIT = 20;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/posts') {
      return handlePosts(request, env, ctx);
    }

    if (url.pathname === '/api/xkcd') {
      return handleXkcd(request);
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
  const force = url.searchParams.get('refresh') === '1';

  // Clamp limit to a sane range; default 4 (the writing list's needs).
  const rawLimit = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(POSTS_MAX_LIMIT, Math.max(1, rawLimit))
    : 4;

  const cacheKey = `posts-v1-${limit}`;

  // 1. KV cache lookup
  let cached = null;
  if (!force && env.WC_CACHE) {
    try {
      const { value, metadata } = await env.WC_CACHE.getWithMetadata(cacheKey, 'json');
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
    if (env.WC_CACHE) {
      ctx.waitUntil(
        env.WC_CACHE.put(cacheKey, JSON.stringify(data), {
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
  });
  if (!res.ok) {
    throw new Error(`substack ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error('substack: unexpected response shape');
  }
  return body;
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

function jsonResponse(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      ...extraHeaders,
    },
  });
}
