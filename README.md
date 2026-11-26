# JT — portfolio site

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
featured: true                     # show this one large on the home page
attackPath:
  - label: "Short step name"
    anchor: "reconnaissance"       # id of the heading this step links to
    access: "None"                 # who you are after this step
    technique: "T1190"             # one ATT&CK ID, must be in _data/attack.json
    command: "the one command that mattered"
    detect: "What a defender would see."      # offense writeups
  - label: "Next step"
    anchor: "initial-access-%E2%80%94-cve-2023-43208"
    finding: "What this step established."    # defense writeups, instead of access/detect
---
```

Projects and blog posts only need `title`, `date`, `summary` and optionally `tags`.

### Optional writeup fields

| Field | What it does |
|---|---|
| `attackPath` | Ordered steps. `label` and `anchor` are required and draw the step diagram above the prose (left-to-right, stacked under 40rem). The optional `access`, `technique`, `command`, `detect` and `finding` fill the panel that opens when a step is selected; leave any of them out and that row is skipped. Selecting follows the section you are reading, and a slim bar at the top of the page shows the step and access level once the diagram has scrolled away. Defense writeups get the same component titled "Investigation path". Keep the text version of the path in the Markdown too. |
| `featured` | `true` on one writeup puts it in the large slot on the home page with its diagram. With none marked, the newest is used. |
| `category` | `Offense` or `Defense`. Besides grouping, it sets the colour identity: `--attack` red for offense, `--defend` blue for defense, on cards, pills and the step diagram. |
| `attack` | MITRE ATT&CK Enterprise technique IDs. Feeds the heatmap and its filter on `/writeups/`. |
| `ports` | `"port/service"` strings, shown in the "At a glance" box. |
| `cves` | `{ id, severity }` objects. Each ID links to NVD; take the severity from the NVD record. |
| `tools` | Tool names, shown in the "At a glance" box. |

Notes:

- **Keep secrets out of `command`.** It is shown on the page. Use `<key>`, `...` or a placeholder, the same as in the prose.
- **`detect` lines are claims.** Only write what you have seen or can cite; "offline, nothing visible on the target" is a valid answer.
- **Anchors.** `anchor` is the `id` markdown-it-anchor gives the heading (`h2` or `h3`). It is the lowercased heading with spaces as hyphens and everything else percent-encoded, so `## Initial access — CVE-2023-43208` becomes `initial-access-%E2%80%94-cve-2023-43208`. Don't guess: run `npm run build` and copy it from the page, e.g. `grep -o '<h[23] id="[^"]*"' _site/writeups/<slug>/index.html`. Quote the value in YAML.
- **New ATT&CK techniques.** A technique only appears in the heatmap if it is also listed, with its name, under its tactic in `src/_data/attack.json`. That file holds the 14 Enterprise tactics and only the techniques the site uses, each under one primary tactic. Use real IDs from [attack.mitre.org](https://attack.mitre.org/).
- **`attack` is two things.** It is the global data file above and the per-writeup list. `eleventy.config.js` turns data deep-merge off so the front matter list replaces the global on that page instead of blending with it. Don't turn deep-merge back on without renaming one of them.
- Platform, OS and Difficulty filter chips on `/writeups/` are generated from the existing `platform`, `os` and `difficulty` fields; nothing extra to maintain.

### Home page

- **Proof strip.** The four numbers are counted from the writeups at build time (writeups, distinct `attack` IDs, distinct `cves`). Only "Certification earned" is typed by hand, in `src/index.njk`.
- **Now line.** `now` in `src/_data/site.json`. Delete the key to hide it.
- **One attack, both chairs.** `src/_data/chairs.json`: each entry has `title`, `attack` (what you do), `defend` (what it leaves behind), and `source` + `url` for the writeup or project it comes from. Keep it to things you have actually done and observed.

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

The workflow works out the base path itself: a repo called `JT` is served at `https://<user>.github.io/JT/`, and a repo called `<user>.github.io` is served at the root. Nothing to edit when the repo is renamed.

That works because every internal link is written root-relative (`/writeups/…`) and the Eleventy HTML base plugin adds the prefix at build time. So:

- Write links as `/writeups/htb-example/`, in templates and in Markdown. Don't add the `url` filter; with the plugin on, it would prefix twice.
- To test a prefixed build locally: `PATH_PREFIX=/JT/ npm run build` (in Git Bash on Windows, put `MSYS_NO_PATHCONV=1` in front, or it rewrites the path).

## Site settings

Name, handle, tagline and profile links live in `src/_data/site.json`. The nav and footer are in `src/_includes/base.njk`. Styles are in `src/css/style.css`.

- **Theme.** Light/dark follows the system preference until the visitor uses the header toggle, which is remembered in `localStorage`. The dark palette is written twice in `style.css` and `prism.css` (once for the system preference, once for the toggle); change both together.
- **JavaScript.** All behaviour is in one dependency-free file, `src/js/site.js`, loaded with `defer`; every page is complete without it. The single exception is a one-line inline script in `base.njk` that applies a saved theme before first paint.
- **Search.** `/` or the header button. The index is `search.json`, generated by `src/search.njk` from titles, summaries, tags, tools, CVE IDs and technique IDs, so new content is searchable with no extra work.
- **Homelab replay.** The exercise buttons under the homelab diagram are plain HTML in `src/projects/purple-team-homelab.md`: `data-seq` lists the edges to light (`kali-dc`, `kali-meta`, `dc-wazuh`) and `data-result` is the line shown at the end.
