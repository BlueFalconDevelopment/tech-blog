# Tech Blog

An [Astro](https://astro.build) blog: Markdown/MDX posts, Tailwind CSS v4,
manual dark mode, tags, RSS, sitemap, auto-generated OG images,
[Pagefind](https://pagefind.app) search, a Netlify Forms contact page, and
[giscus](https://giscus.app) comments. Deploys to Netlify.

## Project structure

```text
src/
├── content/blog/       Markdown/MDX posts
├── content.config.ts   Post frontmatter schema
├── components/         Header, Footer, ThemeToggle, PostCard, TagBadge, Giscus
├── layouts/
│   ├── BaseLayout.astro    HTML shell, SEO/OG meta, dark mode boot script
│   └── BlogPost.astro      Post header, tags, comments
├── pages/
│   ├── index.astro         Homepage (latest 5 posts)
│   ├── blog/index.astro    All posts
│   ├── blog/[...slug].astro
│   ├── tags/index.astro, tags/[tag].astro
│   ├── contact.astro       Netlify Forms
│   ├── search.astro        Pagefind UI
│   ├── rss.xml.ts
│   └── og/[...route].ts    Generates /og/<slug>.png per post
└── consts.ts            Site title/description/URL, nav, giscus config
```

## Commands

| Command           | Action                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `npm install`       | Install dependencies                                              |
| `npm run dev`       | Start the dev server at `localhost:4321`                          |
| `npm run build`     | Build to `./dist/`, then run Pagefind's `postbuild` indexing step |
| `npm run preview`   | Serve the production build locally (needed to test search)        |
| `npx astro check`   | Type-check the project                                             |

**Search only works after a full build.** Pagefind indexes the files in
`dist/` as a post-build step, so `npm run dev` will show the "search only
works in production" message — run `npm run build && npm run preview` to try
it.

## Writing a post

Add a `.md` or `.mdx` file to `src/content/blog/`:

```yaml
---
title: "Post title"
description: "One or two sentences for previews, RSS, and SEO."
pubDate: 2026-08-25
updatedDate: 2026-08-27 # optional
tags: ["tag-one", "tag-two"]
draft: false # optional, defaults to false
---
Post content here.
```

Three sample posts are included in `src/content/blog/` — delete them when
you're ready to publish real content.

## Before your first deploy

1. **Domain** — set `site` in `astro.config.mjs`, `SITE_URL` in
   `src/consts.ts`, and the `Sitemap:` line in `public/robots.txt` to your
   real domain (all three need to match).
2. **Comments** — enable [giscus](https://giscus.app) on a public GitHub repo
   with Discussions turned on, then fill in `GISCUS_REPO`, `GISCUS_REPO_ID`,
   `GISCUS_CATEGORY`, and `GISCUS_CATEGORY_ID` in `src/consts.ts`. Comments
   are hidden automatically until these are set.
3. **Site metadata** — update `SITE_TITLE`, `SITE_DESCRIPTION`, and `AUTHOR`
   in `src/consts.ts`.

## Deploying to Netlify

`netlify.toml` is already configured:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Push to a Git repo and connect it in the Netlify dashboard, or use the
Netlify CLI. The `postbuild` script builds the Pagefind search index as part
of `npm run build`, so no extra Netlify plugin is needed.

The [contact page](src/pages/contact.astro) uses
[Netlify Forms](https://docs.netlify.com/manage/forms/setup/) — form
submissions appear in the Netlify dashboard automatically, no backend
required.
