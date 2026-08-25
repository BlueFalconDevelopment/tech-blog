---
title: "Hello, World (Yes, Another One)"
description: "Why I finally stopped losing my homelab disasters to Discord scrollback and built this thing instead."
pubDate: 2026-08-01
tags: ["meta"]
---

```text
################################################################
#                                                              #
#   H E L L O   W O R L D                                      #
#   -- transmission initiated --                               #
#                                                              #
################################################################
```

Okay so. I've broken and fixed enough dumb shit over the years — homelab boxes that
fall over at 2 AM, hardware I had no business opening up, side projects that
went nowhere fast — that at some point I got tired of the whole story living
in Discord scrollback nobody will ever scroll back to. So: a blog. I know,
groundbreaking.

I didn't want a CMS. I've run WordPress before. I've watched WordPress get
owned by a plugin nobody updated since 2014. I did not want a login page for
some rando to brute-force at 3 AM while I'm asleep and the box is doing
absolutely nothing to defend itself. So the whole thing is just Markdown
files in a git repo, built to static HTML, and shipped to a CDN. If it all
catches fire, the recovery plan is `git clone` and redeploy. That's it.
That's the whole disaster-recovery plan and I'm delighted about it.

Went with [Astro](https://astro.build) for the actual build. No database to
babysit, no runtime to patch, no "sorry the site's down because a dependency
three levels deep pushed a breaking change." Just files in, HTML out.

Getting it wired up wasn't entirely friction-free — hit an "unsupported engine"
warning from npm because the box I was setting up on didn't even have Node
installed, had to go install it before anything would run. Then spent longer
than I'd like to admit fighting Tailwind v4's config, because as of v4 it's
not a `tailwind.config.js` file anymore, it's all just directives sitting in
a CSS file. Took a minute to stop looking for a config file that doesn't
exist anymore.

Anyway. Here's what's actually running under the hood:

```text
--[ WHAT'S HERE ]-------------------------------------------
  [x] tags, sorted into their own pages automatically
  [x] rss feed, because feed readers aren't dead, you're dead
  [x] full-text search, built at deploy time, no third party
      service reading my traffic
  [x] dark mode that isn't just "respect the OS setting" —
      an actual toggle, remembered
  [x] auto-generated social preview images per post
  [x] comments, backed by github discussions, not some ad
      network's comment widget
--------------------------------------------------------------
```

Delete this post whenever real content shows up. Or don't. It's my blog, I
can leave a slightly unhinged readme file up here forever if I want.
