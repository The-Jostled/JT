# cyfhr.github.io

Portfolio and writeups for Joshua Thomas (cyfhr). Static site built with [Eleventy](https://www.11ty.dev/), deployed to GitHub Pages on every push to `main`.

## Local preview

```bash
npm install
npm run serve      # http://localhost:8080, rebuilds on save
npm run build      # output in _site/
```

## Adding content

Everything is Markdown with a short front matter block. Drop a file in the right folder and push.

| Folder | What goes there | Layout |
|---|---|---|
| `src/writeups/` | HTB machines, Sherlocks, THM rooms — **retired targets only** | post |
| `src/projects/` | Things you built | post |
| `src/blog/` | Longer-form notes | post |

Writeup front matter:

```yaml
---
title: "HTB Example — one-line hook"
date: 2026-05-16
platform: Hack The Box           # or "Hack The Box Sherlock", "TryHackMe"
difficulty: Medium
os: Linux
category: Offense                 # Offense or Defense (controls which group it lands in)
summary: "One or two sentences shown on the index cards."
tags: [tag1, tag2]
---
```

Projects and blog posts only need `title`, `date`, `summary` and optionally `tags`.

### Before publishing a writeup

- Confirm the machine/Sherlock is **retired** (HTB only permits writeups for retired content).
- No flags, no password hashes, no key material. Use `<redacted>` or describe what was found.
- Replace lab-specific IDs (NiFi processor IDs, target IPs) with placeholders where they add nothing.
- Convert Obsidian syntax: `[[#Heading]]` → plain headings, `> [!tip]` callouts → normal blockquotes, `![[image.png]]` → `![alt](/img/image.png)` with the file copied to `src/img/`.

## Deployment

First time only, in the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that the workflow in `.github/workflows/pages.yml` handles it.

The repo name must be `cyfhr.github.io` for the site to live at the root URL. If you deploy it under a different repo name, set `PATH_PREFIX=/repo-name/` in the workflow's build step.

## Site settings

Name, handle, tagline and profile links live in `src/_data/site.json`. The nav and footer are in `src/_includes/base.njk`. Styles are in `src/css/style.css` (light/dark follow the system preference).
