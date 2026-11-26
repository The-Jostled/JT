export default {
  layout: "post.njk",
  section: "projects",
  eleventyComputed: {
    permalink: (data) =>
      data.page.fileSlug === "projects" || data.page.fileSlug === "index" ? "/projects/" : `/projects/${data.page.fileSlug}/`,
  },
};
