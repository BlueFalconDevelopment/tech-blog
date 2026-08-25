# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`. Same pattern for preview: `astro preview --background`, `astro preview stop`.

## Commands

- `npm run dev` — dev server at `localhost:4321`
- `npm run build` — `astro build`, then the `postbuild` script runs `pagefind --site dist` to build the search index
- `npm run preview` — serve the production build (`dist/`) locally
- `npx astro check` — type-check `.astro` files and content collection schemas (not wired to a package.json script)

There is no lint or test suite configured in this repo.

**Search only works against a real build.** Pagefind indexes `dist/` as a post-build step, so `npm run dev` has no search index — verify search changes with `npm run build && npm run preview`, not `dev`.

## Architecture

Static Astro site (Tailwind CSS v4 + TypeScript), deployed to Netlify (`netlify.toml`: `npm run build` → publish `dist`).

**Tailwind v4 is configured entirely in CSS** (`src/styles/global.css`), not a `tailwind.config.js`:
- `@import "tailwindcss"` + `@plugin "@tailwindcss/typography"`
- `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` — this redefines the `dark:` variant to key off an `data-theme` attribute on `<html>` instead of `prefers-color-scheme`, so it works with the manual toggle below.

**Dark mode**: `src/layouts/BaseLayout.astro` has a blocking inline `<script>` in `<head>` that sets `document.documentElement.dataset.theme` from `localStorage` (falling back to system preference) before first paint, to avoid a flash of the wrong theme. `src/components/ThemeToggle.astro` flips the attribute and persists the choice on click.

**Content**: posts are Markdown/MDX files in `src/content/blog/`, loaded via the glob loader in `src/content.config.ts` (schema: `title`, `description`, `pubDate`, `updatedDate?`, `heroImage?`, `heroImageAlt?`, `tags[]`, `draft`). Routing:
- `src/pages/blog/[...slug].astro` — post pages, one per collection entry (`post.id` as the slug)
- `src/pages/tags/[tag].astro` — derives its tag list from `getStaticPaths` over all posts' `tags[]`, no separate tag registry
- `src/pages/index.astro` / `src/pages/blog/index.astro` — latest 5 vs. all posts, both filter out `draft: true`

**Layouts**: `BaseLayout.astro` is the HTML shell (SEO/OG/canonical meta, dark-mode script, `Header`/`Footer`). `BlogPost.astro` wraps it for posts specifically — sets `ogImage` to `/og/<post.id>.png`, passes `article:*` meta, renders tags and `Giscus` after the content.

**OG images**: `src/pages/og/[...route].ts` uses `astro-og-canvas`'s `OGImageRoute` to generate one PNG per blog post (keyed by `post.id`) plus an `index` entry used as the site-wide fallback (`BaseLayout`'s default `ogImage` is `/og/index.png`).

**Search**: Pagefind indexing is scoped to `<main data-pagefind-body>` in `BaseLayout.astro` (rather than indexing full pages including nav/footer). `src/pages/search.astro` loads the Pagefind default UI (`/pagefind/pagefind-ui.js`), which only exists after the `postbuild` step has run.

**Comments**: `src/components/Giscus.astro` renders nothing unless `GISCUS_REPO`, `GISCUS_REPO_ID`, and `GISCUS_CATEGORY_ID` are all set in `src/consts.ts` — comments are dormant by default until giscus is configured on a real repo.

**Contact form**: `src/pages/contact.astro` is a static Netlify Forms form (`data-netlify="true"` + hidden honeypot) with no backend or client JS — Netlify's build step detects it directly in the rendered HTML.

**Site config**: `src/consts.ts` holds title/description/author, nav links, and the giscus ids. `SITE_URL` there must stay in sync with `site` in `astro.config.mjs` and the `Sitemap:` line in `public/robots.txt` — all three are used for absolute-URL generation (RSS, sitemap, canonical/OG tags) and aren't derived from a single source.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
