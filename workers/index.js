// ─── Worker entry: routes API and admin paths, everything else is a static asset ───
//
//   /api/posts       cached Substack posts             (posts.js)
//   /api/xkcd        xkcd proxy for the terminal       (posts.js)
//   /api/guestbook*  guestbook notes and moderation    (guestbook.js)
//   /admin/guestbook the review page, behind Access    (guestbook.js)
//   *                static assets via env.ASSETS
//
// wrangler.jsonc sends /api/* and /admin/* here before the asset handler.

import { json, text } from './http.js';
import { handlePosts, handleXkcd } from './posts.js';
import { handleGuestbook, handleAdminPage } from './guestbook.js';

async function route(request, env, ctx) {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/posts') return handlePosts(request, env, ctx);
  if (pathname === '/api/xkcd') return handleXkcd(request);
  if (pathname === '/api/guestbook' || pathname.startsWith('/api/guestbook/')) return handleGuestbook(request, env, ctx);
  if (pathname.startsWith('/api/')) return json({ error: 'not-found' }, 404);

  if (pathname.startsWith('/admin/')) {
    if (/^\/admin\/guestbook(\.html|\/)?$/.test(pathname)) return handleAdminPage(request, env);
    return text('Not found', 404);
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      // A KV or platform failure answers in the API's own format, never a Cloudflare error page
      console.error('unhandled error:', err);
      const { pathname } = new URL(request.url);
      return pathname.startsWith('/api/') ? json({ error: 'server-error' }, 500) : text('Something went wrong.', 500);
    }
  },
};
