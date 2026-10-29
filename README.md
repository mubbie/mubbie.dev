# mubbie.dev

Personal website. Deployed to [mubbie.dev](https://mubbie.dev) via Cloudflare Workers.

## Development

```sh
npm install
npm run dev          # http://localhost:8787
```

For local dev, copy `.dev.vars.example` to `.dev.vars`. In production the posts
refresh token is a Worker secret: `npx wrangler secret put REFRESH_TOKEN`.

## Tests

```sh
npm test                    # worker unit tests (mocked upstreams, no network)
npm run test:integration    # against a running server (start `npm run dev` first)
npm run test:browser        # Playwright: desktop Chrome/Safari/Firefox + iPhone/Android
```

- `BASE_URL=https://mubbie.dev npm run test:integration` runs the integration
  checks against production.
- First time only, install the browser engines with `npx playwright install chromium webkit firefox`.

## Guestbook

A terminal easter egg: nothing on the page or in `help` mentions it. Visitors who find it
read notes with `guestbook` and leave one with `guestbook sign` (or `emacs guestbook`).
Nothing is public until approved at `/admin/guestbook`.

Spam and abuse checks, in order: Cloudflare Turnstile → block list → 3 notes/hour per
visitor → no links, emails or phone numbers → spam phrases → Llama Guard (Workers AI) →
the pending queue. Visitors are stored as a salted hash, never a raw IP. The code is in
`workers/guestbook.js`.

Setup (everything is optional and fails closed):

1. **Accept notes:** create a Turnstile widget for `mubbie.dev` in the Cloudflare dashboard.
   Put its site key in `wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`, then
   `npx wrangler secret put TURNSTILE_SECRET`. Until both are set the guestbook says
   "opens soon".
2. **Review notes:** protect `mubbie.dev/admin/*` and `mubbie.dev/api/guestbook/admin*` with a
   Cloudflare Access application (email one-time code), and add `ACCESS_TEAM_DOMAIN`
   (e.g. `you.cloudflareaccess.com`) and `ACCESS_AUD` (the application's audience tag) to
   `vars`. Or, simpler: `npx wrangler secret put ADMIN_TOKEN` and paste it on the review page.
3. **Email alerts:** on. Alerts go from `NOTIFY_FROM` to `NOTIFY_TO` (vars in `wrangler.jsonc`) through the `send_email` binding. Email Routing must stay on for mubbie.dev, with the destination verified.

Locally, `.dev.vars.example` has Cloudflare's Turnstile test keys, which always pass.
