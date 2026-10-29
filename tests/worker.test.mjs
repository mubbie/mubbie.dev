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
    async get(key, type) {
      const e = store.get(key);
      if (!e) return null;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async put(key, value, opts = {}) {
      store.set(key, { value, metadata: opts.metadata, ttl: opts.expirationTtl });
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix }) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name }));
      return { keys, list_complete: true };
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

async function call(path, env, headers = {}, init = {}) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const res = await worker.fetch(new Request(`http://test${path}`, { headers, ...init }), env, ctx);
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

// ─── /api/guestbook ───

const GB_OPEN = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET: 'secret' };
const turnstileOk = async (url) => (url.includes('turnstile') ? Response.json({ success: true }) : Response.json({}));
const post = (env, body, headers = {}) => call('/api/guestbook', env, { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers }, { method: 'POST', body: JSON.stringify(body) });
const NOTE = { name: 'Ada', message: 'love the dock', token: 't' };

test('guestbook: closed (fails closed) until both Turnstile keys are set', async () => {
  const KV = makeKV();
  const cfg = await call('/api/guestbook/config', { POSTS_CACHE: KV, ASSETS });
  assert.deepEqual(cfg.body, { open: false, siteKey: null });
  const res = await post({ POSTS_CACHE: KV, ASSETS, TURNSTILE_SITE_KEY: 'site' }, NOTE);
  assert.equal(res.res.status, 503);
  assert.equal(res.body.error, 'closed');
  assert.equal(upstreamCalls.length, 0, 'no bot check attempted while closed');

  const open = await call('/api/guestbook/config', { POSTS_CACHE: KV, ASSETS, ...GB_OPEN });
  assert.deepEqual(open.body, { open: true, siteKey: 'site' });
});

test('guestbook: a failed bot check is refused before anything is stored', async () => {
  const KV = makeKV();
  upstream = async () => Response.json({ success: false });
  const res = await post({ POSTS_CACHE: KV, ASSETS, ...GB_OPEN }, NOTE);
  assert.equal(res.res.status, 403);
  assert.equal(KV.store.size, 0);
  const sent = upstreamCalls[0];
  assert.match(sent.url, /turnstile\/v0\/siteverify/);
  assert.equal(sent.init.body.get('secret'), 'secret');
  assert.equal(sent.init.body.get('remoteip'), '203.0.113.7');
});

test('guestbook: hard rules reject links, emails, phone numbers, empty and oversized notes', async () => {
  upstream = turnstileOk;
  const cases = [
    [{ message: 'see https://spam.example' }, 'links-not-allowed'],
    [{ message: 'visit www.spam.biz now' }, 'links-not-allowed'],
    [{ message: 'buy at cheap-pills.com' }, 'links-not-allowed'],
    [{ message: 'mail me: a@b.co' }, 'emails-not-allowed'],
    [{ message: 'call +1 (206) 555-0100' }, 'phone-numbers-not-allowed'],
    [{ name: '' }, 'name-required'],
    [{ message: '   ' }, 'message-required'],
    [{ name: 'x'.repeat(41) }, 'name-too-long'],
    [{ message: 'x'.repeat(501) }, 'message-too-long'],
  ];
  for (const [patch, error] of cases) {
    const KV = makeKV();
    const res = await post({ POSTS_CACHE: KV, ASSETS, ...GB_OPEN }, { ...NOTE, ...patch });
    assert.equal(res.res.status, 400, JSON.stringify(patch));
    assert.equal(res.body.error, error);
    assert.ok(![...KV.store.keys()].some((k) => k.startsWith('gb:p:')), 'nothing queued');
  }
});

test('guestbook: a good note waits in the pending queue; the public list shows only approved', async () => {
  upstream = turnstileOk;
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS, ...GB_OPEN };
  const res = await post(env, { ...NOTE, message: 'line one\n\n\n\nline two' });
  assert.equal(res.res.status, 200);
  assert.equal(res.body.ok, true);
  const pendingKeys = [...KV.store.keys()].filter((k) => k.startsWith('gb:p:'));
  assert.equal(pendingKeys.length, 1);
  const stored = JSON.parse(KV.store.get(pendingKeys[0]).value);
  assert.equal(stored.message, 'line one\n\nline two', 'runs of blank lines collapse');
  assert.match(stored.visitor, /^[0-9a-f]{64}$/, 'visitor is a hash');
  assert.ok(!JSON.stringify(stored).includes('203.0.113.7'), 'raw IP never stored');

  const pub = await call('/api/guestbook', env);
  assert.deepEqual(pub.body, [], 'nothing public before approval');
});

test('guestbook: rate limited to 3 notes an hour per visitor', async () => {
  upstream = turnstileOk;
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS, ...GB_OPEN };
  for (let i = 0; i < 3; i++) assert.equal((await post(env, NOTE)).res.status, 200);
  const fourth = await post(env, NOTE);
  assert.equal(fourth.res.status, 429);
  const other = await post(env, NOTE, { 'CF-Connecting-IP': '198.51.100.9' });
  assert.equal(other.res.status, 200, 'a different visitor is unaffected');
  const rate = [...KV.store.entries()].find(([k]) => k.startsWith('gb:rate:'));
  assert.equal(rate[1].ttl, 3600);
});

test('guestbook: spam and AI-flagged notes are set aside quietly; AI outages still queue for review', async () => {
  upstream = turnstileOk;
  // spam phrase
  let KV = makeKV();
  let res = await post({ POSTS_CACHE: KV, ASSETS, ...GB_OPEN }, { ...NOTE, message: 'great crypto opportunity' });
  assert.equal(res.res.status, 200, 'same thanks either way');
  assert.equal([...KV.store.keys()].filter((k) => k.startsWith('gb:p:')).length, 0);
  const rejected = [...KV.store.entries()].find(([k]) => k.startsWith('gb:r:'));
  assert.match(JSON.parse(rejected[1].value).rejectedFor, /^spam/);
  assert.equal(rejected[1].ttl, 30 * 24 * 3600);

  // AI says unsafe
  KV = makeKV();
  const AI = { run: async (model, input) => { assert.match(model, /llama-guard/); assert.match(input.messages[0].content, /Ada: /); return { response: 'unsafe\nS10' }; } };
  res = await post({ POSTS_CACHE: KV, ASSETS, AI, ...GB_OPEN }, NOTE);
  assert.equal(res.res.status, 200);
  const flagged = [...KV.store.entries()].find(([k]) => k.startsWith('gb:r:'));
  assert.match(JSON.parse(flagged[1].value).rejectedFor, /ai: s10/);

  // AI says safe
  KV = makeKV();
  await post({ POSTS_CACHE: KV, ASSETS, AI: { run: async () => ({ response: 'safe' }) }, ...GB_OPEN }, NOTE);
  const safe = [...KV.store.entries()].find(([k]) => k.startsWith('gb:p:'));
  assert.equal(JSON.parse(safe[1].value).aiChecked, true);

  // AI down: still queued, marked unchecked
  KV = makeKV();
  await post({ POSTS_CACHE: KV, ASSETS, AI: { run: async () => { throw new Error('down'); } }, ...GB_OPEN }, NOTE);
  const queued = [...KV.store.entries()].find(([k]) => k.startsWith('gb:p:'));
  assert.equal(JSON.parse(queued[1].value).aiChecked, false);
});

test('guestbook admin: locked without auth; a valid token approves, deletes, and blocks', async () => {
  upstream = turnstileOk;
  const KV = makeKV();
  const env = { POSTS_CACHE: KV, ASSETS, ...GB_OPEN, ADMIN_TOKEN: 'sesame' };
  const admin = (body, token = 'sesame') => call('/api/guestbook/admin', env,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body ? { method: 'POST', body: JSON.stringify(body) } : {});

  assert.equal((await call('/api/guestbook/admin', env)).res.status, 401);
  assert.equal((await admin(null, 'wrong')).res.status, 401);

  await post(env, NOTE);
  const { body: queue } = await admin(null);
  assert.equal(queue.pending.length, 1);
  const id = queue.pending[0].id;

  assert.equal((await admin({ action: 'approve', id })).res.status, 200);
  const pub = await call('/api/guestbook', env);
  assert.deepEqual(Object.keys(pub.body[0]).sort(), ['createdAt', 'message', 'name'], 'public notes carry no visitor hash or id');
  assert.equal(pub.body[0].message, 'love the dock');
  assert.equal(pub.res.headers.get('Cache-Control'), 'public, max-age=60');

  assert.equal((await admin({ action: 'block', id })).res.status, 200);
  assert.deepEqual((await call('/api/guestbook', env)).body, [], 'blocking also unpublishes');
  const again = await post(env, { ...NOTE, message: 'i am back' });
  assert.equal(again.res.status, 200, 'blocked visitors get the usual thanks');
  assert.equal((await admin(null)).body.pending.length, 0, '…but nothing is queued');

  assert.equal((await admin({ action: 'approve', id: '../../etc' })).res.status, 400, 'ids are validated');
  assert.equal((await admin({ action: 'nuke', id })).res.status, 400);
});

test('guestbook admin page: off unless configured; Access mode requires a valid Access token', async () => {
  const KV = makeKV();
  assert.equal((await call('/admin/guestbook', { POSTS_CACHE: KV, ASSETS })).res.status, 401, 'nothing configured → locked');
  // token mode: the page loads (it asks for the token); the API still checks it
  assert.equal((await call('/admin/guestbook', { POSTS_CACHE: KV, ASSETS, ADMIN_TOKEN: 'x' })).body, 'asset');
  assert.equal((await call('/admin/elsewhere', { POSTS_CACHE: KV, ASSETS, ADMIN_TOKEN: 'x' })).res.status, 404);
  // the asset's own caching header is replaced, not appended to
  const cachedAssets = { fetch: async () => new Response('asset', { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } }) };
  const page = await call('/admin/guestbook', { POSTS_CACHE: KV, ASSETS: cachedAssets, ADMIN_TOKEN: 'x' });
  assert.equal(page.res.headers.get('Cache-Control'), 'no-store');
});

test('guestbook admin: Cloudflare Access JWTs are verified (signature, audience, issuer, expiry)', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256' };
  const team = 'mubbie.cloudflareaccess.com';
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sign = async (payload, key = keys.privateKey) => {
    const head = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(payload)}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
    return `${head}.${Buffer.from(sig).toString('base64url')}`;
  };
  upstream = async (url) => (url.includes('/cdn-cgi/access/certs') ? Response.json({ keys: [jwk] }) : Response.json({}));
  const env = { POSTS_CACHE: makeKV(), ASSETS, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'aud-123' };
  const now = Math.floor(Date.now() / 1000);
  const good = { aud: ['aud-123'], iss: `https://${team}`, exp: now + 600, email: 'me@example.com' };
  const asAdmin = async (jwt) => (await call('/api/guestbook/admin', env, jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {})).res.status;

  assert.equal(await asAdmin(await sign(good)), 200);
  assert.equal(await asAdmin(null), 401);
  assert.equal(await asAdmin(await sign({ ...good, aud: ['someone-else'] })), 401, 'wrong audience');
  assert.equal(await asAdmin(await sign({ ...good, iss: 'https://evil.example' })), 401, 'wrong issuer');
  assert.equal(await asAdmin(await sign({ ...good, exp: now - 1 })), 401, 'expired');
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  assert.equal(await asAdmin(await sign(good, other.privateKey)), 401, 'forged signature');
  assert.equal((await call('/admin/guestbook', env, { 'Cf-Access-Jwt-Assertion': await sign(good) })).body, 'asset', 'page loads for a signed-in admin');
  assert.equal((await call('/admin/guestbook', env)).res.status, 401, 'page refused without Access');
});
