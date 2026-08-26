---
title: "Amber on Amber: Building the Archive"
description: "Sixteen cheat sheets, a search box, and the moment I realized this site already had the exact aesthetic I was about to bolt on top of it."
pubDate: 2026-08-26
tags: ["tools", "claude-code"]
---

```text
--[ THE ARCHIVE :: BUILD LOG ]------------------------------------
```

Started dumb-simple: I wanted cheat sheets for the stuff I actually touch
day to day — Kali, bash, Ubuntu, the Contabo box, Minecraft server OP
commands, Python, Blender, networking commands, git, Docker, SSH/rsync,
tmux, systemd, cron. Had Claude Code look each one up instead of trusting
whatever it already "knew," because half of that list drifts constantly —
Ubuntu's LTS number, Docker's `docker compose` vs `docker-compose` split,
Minecraft's own command set — and a cheat sheet that's confidently wrong is
worse than no cheat sheet. Sixteen `.txt` files landed in a folder.

```text
--[ WHAT'S IN IT ]--------------------------------------------------
  [x] kali · bash · ubuntu · contabo vps
  [x] python · blender · networking
  [x] git · docker · ssh/sftp/rsync
  [x] tmux & screen · systemd · cron
  [x] minecraft op commands
----------------------------------------------------------------------
```

Sixteen flat text files in a folder isn't reference material, though, it's
a junk drawer. Finding one command meant opening files and reading until I
hit the right one. So I had it built into an actual tool — one page,
click a subject to jump to it, grep-style search across all sixteen at
once, results highlighted live as I type. Went with a deliberately extra
90s-hacker skin for it — amber monochrome, scanlines, blinking cursor — and
called it Amber Archive.

Then I went to bolt it onto this site and found out I didn't need to bolt
anything. `global.css` already has this sitting at the top:

```text
/*
 * Amber-phosphor terminal theme. Single theme, no light mode — this is a
 * deliberate aesthetic choice (mid-90s CRT terminal), not an oversight.
 */
```

Same palette. Same scanline overlay. Same blinking cursor class. I'd built
a second copy of a theme this site already had, independently, without
either side knowing about the other. So instead of embedding the artifact
as-is, I rebuilt it as a real page and pointed it at the tokens that were
already there — `--color-term-fg-bright`, the existing `.cursor-blink`
class, the existing scrollbar and scanline rules — instead of shipping a
duplicate.

The only actual code change to the site itself was one new prop on the
shared layout, because the archive needed more than the usual reading
column:

```astro
interface Props {
  // ...existing props...
  /** Widen main beyond the default max-w-3xl reading column, for
   * tool/dashboard-style pages (e.g. the archive) that need more than a
   * single prose column. */
  fullBleed?: boolean;
}
```

The sixteen cheat sheets themselves live in `src/data/archive/` as
pre-rendered HTML fragments — generated straight from the source `.txt`
files by a script, then dropped into the page with `?raw` imports and
Astro's `set:html`. One gotcha there worth remembering: content injected
through `set:html` never gets Astro's scoped-style hashing, since that only
applies to markup the compiler actually sees in the template. So all of the
archive's CSS had to go in a `<style is:global>` block instead of the usual
scoped one — otherwise every rule in it would've silently matched nothing.

No browser attached in the environment I was working in, so "does it
actually look right" wasn't a check I could run directly. What I ran
instead: `astro check` (clean), a full production build plus the Pagefind
postbuild step (also clean, 16 sections indexed), and — because neither of
those actually proves the HTML itself isn't broken — a pass through
Python's `HTMLParser` over the built page just to confirm every tag that
opened also closed. Said as much at the time: that's structural correctness,
not "I looked at it and it's fine."

It's live at `/archive` now, in the nav between Tags and Search. Small
side effect I didn't plan for: Pagefind indexes it like any other page, so
searching this site for something like "docker" now turns up cheat sheet
lines sitting right next to actual blog posts. Last touch was the page
heading itself, which no longer just says "Archive" — it says
"BlueFalconDevelopment Archive ┌∩┐(◣ _ ◢)┌∩┐", because apparently that's
where the bar for restraint landed today.
