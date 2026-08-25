---
title: "Writing a Markdown Post"
description: "Frontmatter fields, code blocks, and other Markdown conventions this blog supports."
pubDate: 2026-08-10
tags: ["meta", "writing"]
---

Every post is a Markdown (or MDX) file in `src/content/blog/`. The frontmatter
schema is enforced by `src/content.config.ts`:

```yaml
---
title: "Post title"
description: "One or two sentences for previews, RSS, and SEO."
pubDate: 2026-08-10
updatedDate: 2026-08-12 # optional
tags: ["tag-one", "tag-two"]
draft: false # optional, defaults to false
---
```

Code blocks get Astro's built-in Shiki syntax highlighting for free:

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

Anything else — headings, lists, blockquotes, tables, images — is styled by
`@tailwindcss/typography` via the `.prose` class in the post layout, with a
few brand-color tweaks in `src/styles/global.css`.
