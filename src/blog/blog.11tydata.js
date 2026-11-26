export default {
  layout: "post.njk",
  section: "blog",
  eleventyComputed: {
    permalink: (data) =>
      data.page.fileSlug === "blog" || data.page.fileSlug === "index" ? "/blog/" : `/blog/${data.page.fileSlug}/`,
  },
};
