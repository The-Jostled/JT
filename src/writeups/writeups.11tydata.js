export default {
  layout: "post.njk",
  section: "writeups",
  eleventyComputed: {
    permalink: (data) =>
      data.page.fileSlug === "writeups" || data.page.fileSlug === "index" ? "/writeups/" : `/writeups/${data.page.fileSlug}/`,
  },
};
