# mubbie.dev

Personal website. Deployed to [mubbie.dev](https://mubbie.dev) via Cloudflare Workers.

## Development

```sh
npm install
npm run dev          # http://localhost:8787
```

For local dev, copy `.dev.vars.example` to `.dev.vars`. In production the posts
refresh token is a Worker secret: `npx wrangler secret put REFRESH_TOKEN`.

Deploy with `npm run deploy`. Content lives in `public/data/*.json` (currently, tools,
races, bucket list, fortunes); edit those, no code changes needed.

## Layout

```
public/                 the site (static, no build step)
  index.html, styles.css
  js/main.js            entry: theme, sections, then the terminal (loaded separately)
  js/sections.js        fetches public/data/*.json and renders each section
  js/terminal/          the terminal
    index.js            wires it together
    executor.js         runs a line: !-history, ; && ||, pipes, $?
    input.js            keys, caret, Ctrl+R, Tab, hints
    router.js           where output goes (screen or the next pipe stage)
    commands/           the commands, by theme (files, search, builtins, web, editors, fun)
    commands.js         command list, help, man pages, hints
  js/guestbook.js       signing the guestbook (opened from the terminal)
  admin/guestbook.html  the review page (served only through the Worker, after auth)
workers/                the Cloudflare Worker
  index.js              router
  posts.js              /api/posts (Substack) and /api/xkcd proxies
  guestbook.js          guestbook API and moderation
  access.js             Cloudflare Access sign-in check
  http.js               shared response helpers
tests/                  worker unit, integration, and Playwright browser tests
```

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
Nothing is public until approved at `/admin/guestbook`. Each note is its own KV key
(`gb:p:` pending, `gb:a:` published, `gb:r:` rejected), so no two writes ever collide.

Spam and abuse checks, in order: Cloudflare Turnstile → block list → 3 notes/hour per
visitor → no links, emails or phone numbers → spam phrases → Llama Guard (Workers AI) →
the pending queue. Visitors are stored as a salted hash, never a raw IP. The code is in
`workers/guestbook.js`.

Setup (everything is optional and fails closed):

1. **Accept notes:** a Turnstile widget for `mubbie.dev` (its site key is in
   `wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`), plus two secrets:
   `npx wrangler secret put TURNSTILE_SECRET` and `npx wrangler secret put GUESTBOOK_SALT`
   (any long random string; it keeps the stored visitor hashes from being reversed).
   Until all three are set the guestbook says "opens soon".
2. **Review notes:** on, via Cloudflare Access. The Zero Trust app "mubbie.dev guestbook admin"
   guards `mubbie.dev/admin/*` and `mubbie.dev/api/guestbook/admin*`, allowing only the owner's
   email; the Worker also checks the sign-in against `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`
   (vars). An `ADMIN_TOKEN` secret works too, but Access sits in front, so it isn't needed.
3. **Email alerts:** on. Alerts go from `NOTIFY_FROM` to `NOTIFY_TO` (vars in `wrangler.jsonc`) through the `send_email` binding. Email Routing must stay on for mubbie.dev, with the destination verified.

Locally, `.dev.vars.example` has Cloudflare's Turnstile test keys, which always pass.
