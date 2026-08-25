---
title: "Post Format, or: How I Broke My Own Build in Five Minutes"
description: "The frontmatter schema, code blocks, and the Zod error I walked straight into on day one."
pubDate: 2026-08-10
tags: ["meta", "writing"]
---

```text
--[ POST FORMAT :: READ ME FIRST ]-----------------------------
```

First real thing I did after getting the site up was write a post, and the
build immediately yelled at me. Turns out I'd defined a schema for post
frontmatter (`src/content.config.ts`) and then just... didn't follow it.
Zod does not care that I was in a hurry. Here's the frontmatter block that
actually passes:

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

Copy that whole block, drop it at the top of a new `.md` file in
`src/content/blog/`, fill in the blanks. `title`, `description`, and
`pubDate` are the only ones it'll actually reject a build over — everything
else has a sane default.

Code blocks were the easy part — Astro ships Shiki syntax highlighting for
free, no plugin, no config:

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

One thing I'm deliberately doing: keeping runnable snippets in their own
clean fenced block, nothing else mixed in — no `$` prompt glued to the front
of a command, no inline commentary breaking it up. If it's meant to be
copy-pasted, it needs to survive being copy-pasted. Terminal-session
screenshots with prompts and output are for showing what happened, not for
snippets I actually want someone to run.

Everything else — headings, lists, blockquotes, tables — gets styled by
`@tailwindcss/typography`'s `.prose` class, which the post layout wraps
around the rendered content. I get to write Markdown and not think about it.
