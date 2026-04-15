# mubbie.dev

Personal homepage. Deployed to [mubbie.dev](https://mubbie.dev) via Cloudflare Pages.

## Structure

```
├── index.html    # Page structure
├── styles.css    # All styling
├── main.js       # Scroll reveal animation
└── README.md
```

## Local Preview

Open `index.html` in a browser.

Or use a local server:

```bash
# Python
python3 -m http.server 3000

# Node
npx serve .
```

Then open `http://localhost:3000`.

## Deploy to Cloudflare Pages

### First-Time Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages**
2. Click **Connect to Git** and select the `mubbie/mubbie.dev` repo
3. Build settings:
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**
5. After deploy, go to **Custom domains** → **Add** → enter `mubbie.dev`
   - Cloudflare auto-configures DNS since the domain is already on Cloudflare

### Every Update After That

Just push to `main`. Cloudflare Pages auto-deploys on every push.

```bash
git add .
git commit -m "Update projects"
git push
```

Live in ~30 seconds.

## DNS Records (for reference)

These should already be configured in Cloudflare DNS:

| Type  | Name       | Target                                  | Proxy  |
|-------|------------|-----------------------------------------|--------|
| CNAME | `gx`       | `microsoft-3cde2778.mintlify.app`       | DNS only |
| CNAME | `notebook` | *(from Substack custom domain setup)*   | DNS only |

The root domain (`mubbie.dev`) is handled automatically by Cloudflare Pages.
