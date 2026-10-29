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
// Storage (the existing KV namespace, under gb:). One key per note, so no two writes ever
// touch the same key and a stale KV read can't drop a note:
//   gb:p:<id>        pending note
//   gb:a:<id>        published note
//   gb:r:<id>        auto-rejected or rejected note, kept 30 days for a look, then gone
//   gb:rate:<hash>   submissions this hour from one visitor
//   gb:block:<hash>  blocked visitor
// Ids sort newest first. Visitors are identified by a salted SHA-256 of their IP; the raw
// IP is never stored.
//
// Config (missing pieces fail closed):
//   TURNSTILE_SITE_KEY (var) + TURNSTILE_SECRET + GUESTBOOK_SALT (secrets) → accepts notes
//   AI binding                                              → AI screening
//   GUESTBOOK_EMAIL send_email binding + NOTIFY_FROM, NOTIFY_TO (vars) → email when a note waits
//   ACCESS_TEAM_DOMAIN + ACCESS_AUD (vars)                  → admin via Cloudflare Access
//   ADMIN_TOKEN (secret)                                    → admin via bearer token (local dev)

import { json, methodNotAllowed, text, bearerMatches } from './http.js';
import { verifyAccessJwt } from './access.js';

const MAX_NAME = 40;
const MAX_MESSAGE = 500;
const RATE_LIMIT = 3; // notes per visitor per hour
const RATE_WINDOW_SECONDS = 3600;
const REJECTED_TTL_SECONDS = 30 * 24 * 3600;
const MAX_PUBLISHED = 200; // shown publicly, newest first
const MAX_ADMIN_LIST = 200; // per pile on the review page, so a spam wave can't break it
const MAX_BODY_BYTES = 16 * 1024; // a note is ~2 KB at most; refuse anything bigger unread
const KV_BULK_GET = 100; // KV's limit for one bulk get
const AI_MODEL = '@cf/meta/llama-guard-3-8b';
const SITE_ORIGIN = 'https://mubbie.dev';
const THANKS = 'Thanks! Notes appear after a quick review.';

// Common spam; abuse is caught by the AI screen and, failing that, by review
const SPAM_PHRASES = ['crypto', 'bitcoin', 'casino', 'viagra', 'cialis', 'forex', 'seo service', 'backlink', 'escort', 'onlyfans', 'telegram @', 'whatsapp +'];

const RULE_MESSAGES = {
  'name-required': 'Add a name (a nickname is fine).',
  'message-required': 'Write a note first.',
  'name-too-long': `Keep the name under ${MAX_NAME} characters.`,
  'message-too-long': `Keep the note under ${MAX_MESSAGE} characters.`,
  'links-not-allowed': 'No links, please. It keeps the spam out.',
  'emails-not-allowed': 'No email addresses, please. Keep everyone\'s info private.',
  'phone-numbers-not-allowed': 'No phone numbers, please. Keep everyone\'s info private.',
};

const isOpen = (env) => Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.GUESTBOOK_SALT);

// ─── Text checks ───

async function sha256(input) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function visitorHash(request, env) {
  return sha256(`${env.GUESTBOOK_SALT}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
}

// Newest first when KV lists keys in lexicographic order
function newId(now) {
  return `${String(9_999_999_999_999 - now).padStart(13, '0')}-${crypto.randomUUID().slice(0, 8)}`;
}

// Drop control characters (except newlines), invisible characters (zero-width spaces,
// joiners, BOM), and bidi overrides that can make text display reversed (name spoofing).
// Then collapse runs of blank lines.
function clean(input) {
  return String(input)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
    .replace(/[​-‏‪-‮⁠-⁩﻿­]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Characters, as people count them: an emoji is one, not two
const charCount = (s) => [...s].length;

// The hard rules. Returns a reason code, or null when the note may proceed.
function ruleViolation(name, message) {
  if (!name) return 'name-required';
  if (!message) return 'message-required';
  if (charCount(name) > MAX_NAME) return 'name-too-long';
  if (charCount(message) > MAX_MESSAGE) return 'message-too-long';
  // Fold lookalikes first, so "ｗｗｗ．spam．com" (full-width) reads as www.spam.com
  const both = `${name}\n${message}`.normalize('NFKC');
  // emails first: "a@b.co" also looks like a link, but the email message is the useful one
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(both)) return 'emails-not-allowed';
  if (/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|dev|xyz|ru|cn|info|biz|co|me|ly)\b/i.test(both)) return 'links-not-allowed';
  if (/(\+?\d[\d\s().-]{8,}\d)/.test(both)) return 'phone-numbers-not-allowed';
  return null;
}

const spamPhrase = (name, message) => SPAM_PHRASES.find((p) => `${name} ${message}`.normalize('NFKC').toLowerCase().includes(p));

async function verifyTurnstile(token, request, env) {
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    return (await res.json()).success === true;
  } catch {
    return false;
  }
}

// Llama Guard says "safe", or "unsafe" plus category codes ("unsafe\nS10"). Depending on the
// API version the answer is that text, or an object { safe, categories }; accept both.
// If the model is unavailable the note still goes to review, so nothing slips through.
async function aiScreen(input, env) {
  if (!env.AI) return { checked: false };
  try {
    const { response } = await env.AI.run(AI_MODEL, { messages: [{ role: 'user', content: input }] });
    if (response && typeof response === 'object') {
      return response.safe === false
        ? { checked: true, unsafe: true, categories: [].concat(response.categories || []).join(',') }
        : { checked: true, unsafe: false };
    }
    const verdict = String(response ?? '').trim();
    if (/^unsafe/i.test(verdict)) return { checked: true, unsafe: true, categories: verdict.split(/\s+/).slice(1).join(',') };
    return { checked: true, unsafe: false };
  } catch (err) {
    console.error('ai screen failed:', err);
    return { checked: false };
  }
}

// ─── Email alert ───

// Header text as RFC 2047 UTF-8, so a name like "Zoë 😀" survives the subject line
const encodeHeader = (s) => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;

// The alert as a raw MIME message (exported for tests)
export function alertEmail(note, env) {
  return [
    `From: mubbie.dev guestbook <${env.NOTIFY_FROM}>`,
    `To: <${env.NOTIFY_TO}>`,
    `Subject: ${encodeHeader(`New guestbook note from ${note.name}`)}`,
    `Date: ${new Date(note.createdAt).toUTCString()}`,
    `Message-ID: <${note.id}@mubbie.dev>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    `${note.name} wrote:`,
    '',
    note.message.replace(/\r?\n/g, '\r\n'),
    '',
    'Review it: https://mubbie.dev/admin/guestbook',
  ].join('\r\n');
}

async function notify(note, env) {
  if (!env.GUESTBOOK_EMAIL || !env.NOTIFY_FROM || !env.NOTIFY_TO) return;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    // the recipient must match the binding's verified destination_address
    await env.GUESTBOOK_EMAIL.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, alertEmail(note, env)));
  } catch (err) {
    // a failed email never blocks a submission; the note is safely queued
    console.error('guestbook alert failed:', err);
  }
}

// ─── Storage ───

// Notes under a prefix, newest first, read in bulk (one KV call per 100 keys, not per note)
async function listNotes(kv, prefix, max) {
  const names = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: Math.min(1000, max - names.length) });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && names.length < max);

  const notes = [];
  for (let i = 0; i < names.length; i += KV_BULK_GET) {
    const batch = await kv.get(names.slice(i, i + KV_BULK_GET), 'json');
    // a key listed but already deleted (KV lists lag) comes back null; skip it
    for (const name of names.slice(i, i + KV_BULK_GET)) if (batch.get(name)) notes.push(batch.get(name));
  }
  return notes;
}

const publicNote = ({ name, message, createdAt }) => ({ name, message, createdAt });

// ─── Admin auth ───

async function isAdmin(request, env) {
  if (bearerMatches(request, env.ADMIN_TOKEN)) return true;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  return Boolean(jwt) && verifyAccessJwt(jwt, env);
}

// ─── Handlers ───

export async function handleGuestbook(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const kv = env.POSTS_CACHE;
  if (!kv) return json({ error: 'unavailable' }, 503);

  if (pathname === '/api/guestbook/config') {
    return json({ open: isOpen(env), siteKey: env.TURNSTILE_SITE_KEY || null });
  }
  if (pathname === '/api/guestbook/admin') {
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    return handleAdmin(request, env, kv);
  }
  if (pathname !== '/api/guestbook') return json({ error: 'not-found' }, 404);

  if (request.method === 'GET') {
    const notes = await listNotes(kv, 'gb:a:', MAX_PUBLISHED);
    return json(notes.map(publicNote), 200, { 'Cache-Control': 'public, max-age=60' });
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST');
  return submitNote(request, env, ctx, kv);
}

async function submitNote(request, env, ctx, kv) {
  // Closed until the bot check (and the salt that keeps visitor ids private) is configured
  if (!isOpen(env)) return json({ error: 'closed', message: 'The guestbook opens soon.' }, 503);

  // Refuse oversized bodies before reading them
  if (parseInt(request.headers.get('Content-Length') || '0', 10) > MAX_BODY_BYTES) return json({ error: 'too-large' }, 413);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'too-large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  // A JSON object with string fields, nothing else ("null", arrays, numbers, objects)
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof (body.name ?? '') !== 'string' || typeof (body.message ?? '') !== 'string') {
    return json({ error: 'bad-request' }, 400);
  }
  const name = clean(body.name ?? '').replace(/\n/g, ' ');
  const message = clean(body.message ?? '');

  if (typeof body.token !== 'string' || !body.token || !(await verifyTurnstile(body.token, request, env))) {
    return json({ error: 'bot-check-failed', message: 'Couldn\'t verify you\'re human. Try again?' }, 403);
  }

  const who = await visitorHash(request, env);
  // don't tell a blocked visitor; their notes just never appear
  if (await kv.get(`gb:block:${who}`)) return json({ ok: true, message: THANKS });

  // KV counters are best effort under concurrency; each attempt also costs a fresh Turnstile pass
  const rateKey = `gb:rate:${who}`;
  const count = parseInt((await kv.get(rateKey)) || '0', 10);
  if (count >= RATE_LIMIT) return json({ error: 'rate-limited', message: 'That\'s a lot of notes. Try again in an hour.' }, 429);

  // A note that breaks the rules doesn't use up one of your tries
  const violation = ruleViolation(name, message);
  if (violation) return json({ error: violation, message: RULE_MESSAGES[violation] }, 400);
  await kv.put(rateKey, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS });

  const now = Date.now();
  const note = { id: newId(now), name, message, createdAt: new Date(now).toISOString(), visitor: who };

  // Spam phrases and AI-flagged notes go straight to the rejected pile (30 days, then gone).
  // The visitor sees the same thanks either way, so trolls learn nothing.
  const spam = spamPhrase(name, message);
  const ai = spam ? { checked: false } : await aiScreen(`${name}: ${message}`, env);
  if (spam || ai.unsafe) {
    note.rejectedFor = spam ? `spam: ${spam}` : `ai: ${ai.categories || 'unsafe'}`;
    await kv.put(`gb:r:${note.id}`, JSON.stringify(note), { expirationTtl: REJECTED_TTL_SECONDS });
  } else {
    note.aiChecked = ai.checked;
    await kv.put(`gb:p:${note.id}`, JSON.stringify(note));
    ctx.waitUntil(notify(note, env));
  }
  return json({ ok: true, message: THANKS });
}

const ADMIN_ACTIONS = {
  async approve(kv, id, note) {
    if (!note) return json({ error: 'not-found' }, 404);
    const { rejectedFor, ...published } = note;
    await kv.put(`gb:a:${id}`, JSON.stringify(published));
    await Promise.all([kv.delete(`gb:p:${id}`), kv.delete(`gb:r:${id}`)]);
    return json({ ok: true });
  },
  async reject(kv, id, note) {
    if (!note) return json({ error: 'not-found' }, 404);
    await kv.put(`gb:r:${id}`, JSON.stringify({ ...note, rejectedFor: 'you' }), { expirationTtl: REJECTED_TTL_SECONDS });
    await Promise.all([kv.delete(`gb:p:${id}`), kv.delete(`gb:a:${id}`)]);
    return json({ ok: true });
  },
  // remove a note from every pile
  async delete(kv, id) {
    await Promise.all(['p', 'a', 'r'].map((pile) => kv.delete(`gb:${pile}:${id}`)));
    return json({ ok: true });
  },
  // hide the note and everything its sender writes from now on
  async block(kv, id, note) {
    if (!note?.visitor) return json({ error: 'not-found' }, 404);
    await kv.put(`gb:block:${note.visitor}`, '1');
    await kv.put(`gb:r:${id}`, JSON.stringify({ ...note, rejectedFor: 'blocked' }), { expirationTtl: REJECTED_TTL_SECONDS });
    await Promise.all([kv.delete(`gb:p:${id}`), kv.delete(`gb:a:${id}`)]);
    return json({ ok: true });
  },
};

async function handleAdmin(request, env, kv) {
  if (request.method === 'GET') {
    const [pending, approved, rejected] = await Promise.all(
      ['gb:p:', 'gb:a:', 'gb:r:'].map((prefix) => listNotes(kv, prefix, MAX_ADMIN_LIST)),
    );
    return json({ pending, approved, rejected, aiScreening: Boolean(env.AI), emailAlerts: Boolean(env.GUESTBOOK_EMAIL && env.NOTIFY_FROM && env.NOTIFY_TO) });
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST');

  // Only the review page may change things: JSON from this site, never a cross-site form post
  const origin = request.headers.get('Origin');
  if (origin && origin !== SITE_ORIGIN && origin !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'json-required' }, 415);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  const { action, id } = body && typeof body === 'object' ? body : {};
  if (!/^[\w-]{1,40}$/.test(String(id || ''))) return json({ error: 'bad-id' }, 400);
  if (!Object.hasOwn(ADMIN_ACTIONS, action)) return json({ error: 'unknown-action' }, 400);

  const note = (await kv.get(`gb:p:${id}`, 'json')) || (await kv.get(`gb:r:${id}`, 'json')) || (await kv.get(`gb:a:${id}`, 'json'));
  return ADMIN_ACTIONS[action](kv, id, note);
}

// The review page holds no data (the admin API does). With Cloudflare Access configured,
// only signed-in admins may load it. In token-only mode (local dev) a browser can't send
// the token on a plain visit, so the page loads and asks for it; every API call still checks.
export async function handleAdminPage(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
  const accessOn = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  if (!accessOn && !env.ADMIN_TOKEN) return text('The guestbook admin is not configured yet.', 401);
  if (accessOn && !(await isAdmin(request, env))) return text('Not authorized. Sign in through Cloudflare Access.', 401);

  const res = await env.ASSETS.fetch(new Request(new URL('/admin/guestbook', request.url), { method: request.method, headers: request.headers }));
  // Replace (not add to) the asset's caching: an admin page must never be cached anywhere
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}
