// ─── Guestbook: public notes, moderated before anyone sees them ───
//
// Routes:
//   GET  /api/guestbook/config   → { open, siteKey }  (is it accepting notes?)
//   GET  /api/guestbook          → approved notes, newest first
//   POST /api/guestbook          → submit { name, message, token } (Turnstile token)
//   GET  /api/guestbook/admin    → pending / approved / rejected   (admin only)
//   POST /api/guestbook/admin    → { action: approve|reject|delete|block, id }  (admin only)
//   GET  /admin/guestbook        → the review page                 (admin only; the Worker runs
//                                   before static assets for /admin/*, so the file is never served directly)
//
// Layers, in order: Turnstile bot check → block list → rate limit → hard rules
// (length, links, emails, phone numbers) → spam phrases → AI screening (Llama Guard,
// when the AI binding exists) → pending queue. Nothing is public until approved.
//
// Storage (the existing KV namespace, under gb:):
//   gb:p:<id>        pending note (one key each, so concurrent submits never collide)
//   gb:approved      the public list (written only by the admin, so no races)
//   gb:r:<id>        auto-rejected or rejected note, kept 30 days for a look, then gone
//   gb:rate:<hash>   submissions this hour from one visitor
//   gb:block:<hash>  blocked visitor
// Visitors are identified by a salted SHA-256 of their IP; the raw IP is never stored.
//
// Config (all optional; missing pieces fail closed):
//   TURNSTILE_SITE_KEY (var) + TURNSTILE_SECRET (secret)  → guestbook accepts notes
//   AI binding                                             → AI screening
//   GUESTBOOK_EMAIL send_email binding + NOTIFY_FROM (var) → email when a note waits
//   ACCESS_TEAM_DOMAIN + ACCESS_AUD (vars)                 → admin via Cloudflare Access
//   ADMIN_TOKEN (secret)                                   → admin via bearer token instead

const MAX_NAME = 40;
const MAX_MESSAGE = 500;
const RATE_LIMIT = 3; // notes per visitor per hour
const RATE_WINDOW_SECONDS = 3600;
const REJECTED_TTL_SECONDS = 30 * 24 * 3600;
const MAX_APPROVED = 200;
const AI_MODEL = '@cf/meta/llama-guard-3-8b';

// Common spam; abuse is caught by the AI screen and, failing that, by review
const SPAM_PHRASES = ['crypto', 'bitcoin', 'casino', 'viagra', 'cialis', 'forex', 'seo service', 'backlink', 'escort', 'onlyfans', 'telegram @', 'whatsapp +'];

// ─── Helpers ───

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function visitorHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return sha256(`${env.GUESTBOOK_SALT || 'mubbie.dev guestbook'}:${ip}`);
}

// Newest first when KV lists keys in lexicographic order
function newId(now) {
  return `${String(9_999_999_999_999 - now).padStart(13, '0')}-${crypto.randomUUID().slice(0, 8)}`;
}

function clean(text) {
  // drop control characters except newlines; collapse runs of blank lines
  return String(text ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// The hard rules. Returns a reason string, or null when the note may proceed.
export function ruleViolation(name, message) {
  if (!name) return 'name-required';
  if (!message) return 'message-required';
  if (name.length > MAX_NAME) return 'name-too-long';
  if (message.length > MAX_MESSAGE) return 'message-too-long';
  const both = `${name}\n${message}`;
  // emails first: "a@b.co" also looks like a link, but the email message is the useful one
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(both)) return 'emails-not-allowed';
  if (/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|dev|xyz|ru|cn|info|biz|co|me|ly)\b/i.test(both)) return 'links-not-allowed';
  if (/(\+?\d[\d\s().-]{8,}\d)/.test(both)) return 'phone-numbers-not-allowed';
  return null;
}

const RULE_MESSAGES = {
  'name-required': 'Add a name (a nickname is fine).',
  'message-required': 'Write a note first.',
  'name-too-long': `Keep the name under ${MAX_NAME} characters.`,
  'message-too-long': `Keep the note under ${MAX_MESSAGE} characters.`,
  'links-not-allowed': 'No links, please. It keeps the spam out.',
  'emails-not-allowed': 'No email addresses, please. Keep everyone\'s info private.',
  'phone-numbers-not-allowed': 'No phone numbers, please. Keep everyone\'s info private.',
};

async function verifyTurnstile(token, request, env) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// Llama Guard answers "safe", or "unsafe" plus category codes (e.g. "unsafe\nS10").
// If the model is unavailable the note still goes to review, so nothing slips through.
async function aiScreen(text, env) {
  if (!env.AI) return { checked: false };
  try {
    const out = await env.AI.run(AI_MODEL, { messages: [{ role: 'user', content: text }] });
    const verdict = String(out?.response ?? '').trim().toLowerCase();
    if (verdict.startsWith('unsafe')) return { checked: true, unsafe: true, categories: verdict.split(/\s+/).slice(1).join(',') };
    return { checked: true, unsafe: false };
  } catch {
    return { checked: false };
  }
}

async function notify(note, env) {
  if (!env.GUESTBOOK_EMAIL || !env.NOTIFY_FROM) return;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const raw = [
      `From: mubbie.dev guestbook <${env.NOTIFY_FROM}>`,
      'To: guestbook-owner',
      `Subject: New guestbook note from ${note.name.replace(/[\r\n]/g, ' ')}`,
      `Message-ID: <${note.id}@mubbie.dev>`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      `${note.name} wrote:`,
      '',
      note.message,
      '',
      'Review it: https://mubbie.dev/admin/guestbook',
    ].join('\r\n');
    await env.GUESTBOOK_EMAIL.send(new EmailMessage(env.NOTIFY_FROM, undefined, raw));
  } catch {
    // a failed email never blocks a submission; the note is safely queued
  }
}

// ─── Admin auth: Cloudflare Access JWT, or a bearer token ───

let accessKeys = null;
let accessKeysFetched = 0;

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyAccessJwt(token, env) {
  try {
    const [h, p, sig] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD) || payload.exp < now) return false;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;

    if (!accessKeys || Date.now() - accessKeysFetched > 3600_000) {
      const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
      accessKeys = (await res.json()).keys || [];
      accessKeysFetched = Date.now();
    }
    const jwk = accessKeys.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

export async function isAdmin(request, env) {
  if (env.ADMIN_TOKEN) {
    const given = new TextEncoder().encode(request.headers.get('Authorization') || '');
    const expected = new TextEncoder().encode(`Bearer ${env.ADMIN_TOKEN}`);
    if (given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected)) return true;
  }
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (jwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return verifyAccessJwt(jwt, env);
  return false;
}

// ─── KV access ───

async function readApproved(kv) {
  const list = await kv.get('gb:approved', 'json');
  return Array.isArray(list) ? list : [];
}

async function listByPrefix(kv, prefix) {
  const notes = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) {
      const note = await kv.get(k.name, 'json');
      if (note) notes.push(note);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return notes;
}

// ─── Handlers ───

export async function handleGuestbook(request, env, ctx) {
  const url = new URL(request.url);
  const kv = env.POSTS_CACHE;
  if (!kv) return json({ error: 'unavailable' }, 503);

  if (url.pathname === '/api/guestbook/config') {
    return json({ open: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET), siteKey: env.TURNSTILE_SITE_KEY || null });
  }

  if (url.pathname === '/api/guestbook/admin') {
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    return handleAdmin(request, env, kv);
  }

  if (url.pathname !== '/api/guestbook') return json({ error: 'not-found' }, 404);

  if (request.method === 'GET') {
    const notes = (await readApproved(kv)).map(({ name, message, createdAt }) => ({ name, message, createdAt }));
    return json(notes, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  // Closed until the bot check is configured
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET) return json({ error: 'closed', message: 'The guestbook opens soon.' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  const name = clean(body.name).replace(/\n/g, ' ');
  const message = clean(body.message);

  if (!(await verifyTurnstile(body.token, request, env))) {
    return json({ error: 'bot-check-failed', message: 'Couldn\'t verify you\'re human. Try again?' }, 403);
  }

  const who = await visitorHash(request, env);
  if (await kv.get(`gb:block:${who}`)) {
    // don't tell a blocked visitor; their notes just never appear
    return json({ ok: true, message: 'Thanks! Notes appear after a quick review.' });
  }

  const rateKey = `gb:rate:${who}`;
  const count = parseInt((await kv.get(rateKey)) || '0', 10);
  if (count >= RATE_LIMIT) return json({ error: 'rate-limited', message: 'That\'s a lot of notes. Try again in an hour.' }, 429);
  await kv.put(rateKey, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS });

  const violation = ruleViolation(name, message);
  if (violation) return json({ error: violation, message: RULE_MESSAGES[violation] }, 400);

  const now = Date.now();
  const note = { id: newId(now), name, message, createdAt: new Date(now).toISOString(), visitor: who };

  // Spam phrases and AI-flagged notes go straight to the rejected pile (30 days, then gone).
  // The visitor sees the same thanks either way, so trolls learn nothing.
  const spam = SPAM_PHRASES.find((p) => `${name} ${message}`.toLowerCase().includes(p));
  const ai = spam ? { checked: false } : await aiScreen(`${name}: ${message}`, env);
  if (spam || ai.unsafe) {
    note.rejectedFor = spam ? `spam: ${spam}` : `ai: ${ai.categories || 'unsafe'}`;
    await kv.put(`gb:r:${note.id}`, JSON.stringify(note), { expirationTtl: REJECTED_TTL_SECONDS });
  } else {
    note.aiChecked = ai.checked;
    await kv.put(`gb:p:${note.id}`, JSON.stringify(note));
    ctx.waitUntil(notify(note, env));
  }
  return json({ ok: true, message: 'Thanks! Notes appear after a quick review.' });
}

async function handleAdmin(request, env, kv) {
  if (request.method === 'GET') {
    const [pending, approved, rejected] = await Promise.all([
      listByPrefix(kv, 'gb:p:'),
      readApproved(kv),
      listByPrefix(kv, 'gb:r:'),
    ]);
    return json({ pending, approved, rejected, aiScreening: Boolean(env.AI), emailAlerts: Boolean(env.GUESTBOOK_EMAIL && env.NOTIFY_FROM) });
  }
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  const { action, id } = body;
  if (!/^[\w-]{1,40}$/.test(String(id || ''))) return json({ error: 'bad-id' }, 400);

  const pendingKey = `gb:p:${id}`;
  const rejectedKey = `gb:r:${id}`;
  const note = (await kv.get(pendingKey, 'json')) || (await kv.get(rejectedKey, 'json'));
  const approved = await readApproved(kv);

  if (action === 'approve') {
    if (!note) return json({ error: 'not-found' }, 404);
    const published = { ...note };
    delete published.rejectedFor;
    const next = [published, ...approved.filter((n) => n.id !== id)].slice(0, MAX_APPROVED);
    await kv.put('gb:approved', JSON.stringify(next));
    await kv.delete(pendingKey);
    await kv.delete(rejectedKey);
    return json({ ok: true });
  }
  if (action === 'reject') {
    if (!note) return json({ error: 'not-found' }, 404);
    await kv.put(rejectedKey, JSON.stringify({ ...note, rejectedFor: 'you' }), { expirationTtl: REJECTED_TTL_SECONDS });
    await kv.delete(pendingKey);
    return json({ ok: true });
  }
  if (action === 'delete') {
    // remove a published note (or purge one from any pile)
    await kv.put('gb:approved', JSON.stringify(approved.filter((n) => n.id !== id)));
    await kv.delete(pendingKey);
    await kv.delete(rejectedKey);
    return json({ ok: true });
  }
  if (action === 'block') {
    const target = note || approved.find((n) => n.id === id);
    if (!target?.visitor) return json({ error: 'not-found' }, 404);
    await kv.put(`gb:block:${target.visitor}`, '1');
    await kv.put(rejectedKey, JSON.stringify({ ...target, rejectedFor: 'blocked' }), { expirationTtl: REJECTED_TTL_SECONDS });
    await kv.delete(pendingKey);
    await kv.put('gb:approved', JSON.stringify(approved.filter((n) => n.id !== id)));
    return json({ ok: true });
  }
  return json({ error: 'unknown-action' }, 400);
}

// The review page holds no data (the admin API does). With Cloudflare Access configured,
// only signed-in admins may load it. In token-only mode a browser can't send the token
// on a plain visit, so the page loads and asks for it; every API call still checks.
export async function handleAdminPage(request, env) {
  const accessOn = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  if (!accessOn && !env.ADMIN_TOKEN) {
    return new Response('The guestbook admin is not configured yet.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (accessOn && !(await isAdmin(request, env))) {
    return new Response('Not authorized. Sign in through Cloudflare Access.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const res = await env.ASSETS.fetch(new Request(new URL('/admin/guestbook', request.url), request));
  // Replace (not add to) the asset's caching: an admin page must never be cached anywhere
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}
