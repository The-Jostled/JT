import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  // `attack` is both a global data file (_data/attack.json, the tactic matrix)
  // and a per-writeup front matter list of technique IDs. With deep merge on,
  // Eleventy would blend the list into the matrix object; off, front matter
  // simply replaces it on that page.
  eleventyConfig.setDataDeepMerge(false);

  const md = markdownIt({ html: true, linkify: true, typographer: true }).use(
    markdownItAnchor,
    { permalink: false, tabIndex: false }
  );
  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });

  // Collections, newest first
  const byDateDesc = (a, b) => b.date - a.date;
  eleventyConfig.addCollection("writeups", (api) =>
    api.getFilteredByGlob("src/writeups/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("projects", (api) =>
    api.getFilteredByGlob("src/projects/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("blog", (api) =>
    api.getFilteredByGlob("src/blog/*.md").sort(byDateDesc)
  );

  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());
  eleventyConfig.addFilter("head", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  // How many items in a collection list an ATT&CK technique ID in front matter
  eleventyConfig.addFilter("attackCount", (items, id) =>
    (items || []).filter((i) => (i.data.attack || []).includes(id)).length
  );

  // Distinct front matter values for a key, for building filter chips.
  // Difficulty sorts by rank; everything else alphabetically.
  eleventyConfig.addFilter("uniqueValues", (items, key) => {
    const rank = ["Very Easy", "Easy", "Medium", "Hard", "Insane"];
    const values = [...new Set((items || []).map((i) => i.data[key]).filter(Boolean))];
    return values.sort((a, b) =>
      key === "difficulty"
        ? rank.indexOf(a) - rank.indexOf(b)
        : String(a).localeCompare(String(b))
    );
  });

  // Greedy word-wrap for SVG labels (SVG text does not wrap on its own)
  eleventyConfig.addFilter("wrapLabel", (text, max = 20) => {
    const lines = [];
    let line = "";
    for (const word of String(text || "").split(/\s+/).filter(Boolean)) {
      if (line && (line + " " + word).length > max) {
        lines.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) lines.push(line);
    return lines;
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    // Set via env for project-page deployments; empty for user site (cyfhr.github.io)
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
