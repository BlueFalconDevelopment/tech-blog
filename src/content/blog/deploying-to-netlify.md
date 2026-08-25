---
title: "Ship It: Netlify Deploy Log"
description: "Getting this thing live, the contact form that needed zero backend, and the three places a domain has to match or everything quietly breaks."
pubDate: 2026-08-20
tags: ["deployment", "netlify"]
---

```text
--[ SHIP IT :: NETLIFY DEPLOY LOG ]-----------------------------
```

Deploy config for this thing is embarrassingly small. `netlify.toml`, whole
file:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Push it, connect the repo, done. Netlify figures out it's Astro on its own.
`npm run build` also kicks off a `postbuild` step that runs Pagefind over the
finished HTML to build the search index — so the search box actually works
in production and not just as a "search only works after a real build"
apology message in dev.

The contact page was the part I expected to be annoying and wasn't. No
backend, no form service, no API key to leak into a public repo by accident.
Just a plain HTML form with `data-netlify="true"` on it and a hidden
honeypot field, and Netlify's build step finds it in the rendered output and
starts collecting submissions. That's the entire integration.

The part that actually bit me: I've got the site's domain hardcoded in three
different places — `site` in `astro.config.mjs`, `SITE_URL` in
`src/consts.ts`, and the `Sitemap:` line in `robots.txt` — because none of
them read from each other. Updated one, forgot the other two, and RSS links
and OG images were quietly pointing at the wrong domain for longer than I'd
like to admit. Nothing errored. It just silently generated broken links.
Learned to grep for the old domain across all three before calling a deploy
done.

```text
--[ BEFORE YOU DEPLOY, FOR REAL ]--------------------------------
  [ ] astro.config.mjs  -> site
  [ ] src/consts.ts     -> SITE_URL
  [ ] public/robots.txt -> Sitemap: line
  (all three, same domain, every time)
------------------------------------------------------------------
```

Comments run on [giscus](https://giscus.app), backed by a public repo with
GitHub Discussions turned on — had to install the giscus GitHub App on that
repo separately from just enabling Discussions, or the widget sits there
showing an error instead of a comment box. Easy to miss, took me a minute to
figure out why it wasn't loading.
