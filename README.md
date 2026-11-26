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

# Optional — each one switches on a component (see below)
attack: [T1190, T1059.004, T1552.001]
ports: ["22/ssh", "80/http"]
cves:
  - { id: CVE-2023-43208, severity: Critical }   # Critical | High | Medium | Low
tools: [nmap, curl, hashcat]
attackPath:
  - label: "Short step name"
    anchor: "reconnaissance"       # id of the heading this step links to
  - label: "Next step"
    anchor: "initial-access-%E2%80%94-cve-2023-43208"
---
```

Projects and blog posts only need `title`, `date`, `summary` and optionally `tags`.

### Optional writeup fields

| Field | What it does |
|---|---|
| `attackPath` | Ordered `{ label, anchor }` steps. Renders the clickable step diagram above the prose (left-to-right, stacked under 40rem) and highlights the step you are reading. Defense writeups get the same component titled "Investigation path". Keep the text version of the path in the Markdown too. |
| `attack` | MITRE ATT&CK Enterprise technique IDs. Feeds the heatmap and its filter on `/writeups/`. |
| `ports` | `"port/service"` strings, shown in the "At a glance" box. |
| `cves` | `{ id, severity }` objects. Each ID links to NVD; take the severity from the NVD record. |
| `tools` | Tool names, shown in the "At a glance" box. |

Notes:

- **Anchors.** `anchor` is the `id` markdown-it-anchor gives the heading (`h2` or `h3`). It is the lowercased heading with spaces as hyphens and everything else percent-encoded, so `## Initial access — CVE-2023-43208` becomes `initial-access-%E2%80%94-cve-2023-43208`. Don't guess: run `npm run build` and copy it from the page, e.g. `grep -o '<h[23] id="[^"]*"' _site/writeups/<slug>/index.html`. Quote the value in YAML.
- **New ATT&CK techniques.** A technique only appears in the heatmap if it is also listed, with its name, under its tactic in `src/_data/attack.json`. That file holds the 14 Enterprise tactics and only the techniques the site uses, each under one primary tactic. Use real IDs from [attack.mitre.org](https://attack.mitre.org/).
- **`attack` is two things.** It is the global data file above and the per-writeup list. `eleventy.config.js` turns data deep-merge off so the front matter list replaces the global on that page instead of blending with it. Don't turn deep-merge back on without renaming one of them.
- Platform, OS and Difficulty filter chips on `/writeups/` are generated from the existing `platform`, `os` and `difficulty` fields; nothing extra to maintain.

### About-page timeline

`src/about.md` has a `timeline` list in its front matter, rendered by `src/_includes/timeline.njk`:

```yaml
timeline:
  - year: "Fall 2026"        # optional — leave it out if there is no date
    label: "NHTI — Networking and Cybersecurity Operations A.S."
    description: "One line."
```

### Adding a diagram

Diagrams are inline SVG so they pick up the site's CSS variables and work in dark mode.

1. **Reusable diagram:** create `src/_includes/diagrams/<name>.svg.njk` containing just the `<svg>`. Use the shared classes from the "Diagrams" block in `src/css/style.css` (`d-svg`, `d-box`, `d-title`, `d-sub`, `d-line`, `d-head`) rather than hard-coded colours, give it a `<title>` and `<desc>`, and leave the background transparent. **No blank lines inside the file**, or Markdown will break the SVG apart.
2. Markdown files are not run through Nunjucks by default (the writeups are full of `{{ }}` in code samples). To include a diagram from a Markdown page, add `templateEngineOverride: njk,md` to that page's front matter, then:

   ```html
   <figure class="diagram">
   <div class="d-scroll">
   {% include "diagrams/<name>.svg.njk" %}
   </div>
   <figcaption>One-line caption.</figcaption>
   </figure>
   ```

   Only do this on pages whose code blocks contain no `{{` or `{%`.
3. **One-off diagram in a writeup:** paste the `<svg>` straight into the Markdown (again, no blank lines). The Helix gauge is an example; `data-run-once` on the `<figure>` makes `site.js` play its CSS animation a single time when it scrolls into view.

Rules the existing diagrams follow: only the colour variables in `:root` (`--attack` and `--defend` are the two semantic ones), animations run once and sit inside `@media (prefers-reduced-motion: no-preference)` with the final state as the default, and no flags, hashes or key material in labels.

### Before publishing a writeup

- Confirm the machine/Sherlock is **retired** (HTB only permits writeups for retired content).
- No flags, no password hashes, no key material. Use `<redacted>` or describe what was found.
- Replace lab-specific IDs (NiFi processor IDs, target IPs) with placeholders where they add nothing.
- Convert Obsidian syntax: `[[#Heading]]` → plain headings, `> [!tip]` callouts → normal blockquotes, `![[image.png]]` → `![alt](/img/image.png)` with the file copied to `src/img/`.

## Deployment

First time only, in the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that the workflow in `.github/workflows/pages.yml` handles it.

The repo name must be `cyfhr.github.io` for the site to live at the root URL. If you deploy it under a different repo name, set `PATH_PREFIX=/repo-name/` in the workflow's build step.

## Site settings

Name, handle, tagline and profile links live in `src/_data/site.json`. The nav and footer are in `src/_includes/base.njk`. Styles are in `src/css/style.css` (light/dark follow the system preference). All behaviour is in one dependency-free file, `src/js/site.js`, loaded with `defer`; every page is complete without it.
