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
