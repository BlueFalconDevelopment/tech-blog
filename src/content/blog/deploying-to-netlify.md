---
title: "Deploying to Netlify"
description: "Build settings, the contact form, and what to check before going live."
pubDate: 2026-08-20
tags: ["deployment", "netlify"]
---

This site is set up to deploy to Netlify with zero extra configuration
beyond the `netlify.toml` already in the repo:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Netlify auto-detects Astro and runs `npm run build`, which also triggers the
`postbuild` script (`pagefind --site dist`) to build the search index before
the site goes live.

The [contact page](/contact) uses Netlify Forms, so submissions just show up
in the Netlify dashboard — no server or third-party form service needed.

Before your first real deploy, update:

1. `site` in `astro.config.mjs` and `SITE_URL` in `src/consts.ts` to your real
   domain.
2. `GISCUS_*` constants in `src/consts.ts` once you've enabled
   [giscus](https://giscus.app/) on a public repo.
