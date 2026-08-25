// Site-wide constants. Update these for your own blog.

export const SITE_TITLE = "Tech Blog";
export const SITE_DESCRIPTION =
  "Notes and write-ups on software engineering, infrastructure, and whatever else I'm building.";

// Used to build absolute URLs for RSS, sitemap, canonical links, and OG images.
// Must match the `site` value in astro.config.mjs.
export const SITE_URL = "https://example.com";

export const AUTHOR = "Your Name";

// Fill these in at https://giscus.app after enabling the giscus app on a
// PUBLIC repo with GitHub Discussions turned on. Leave GISCUS_REPO empty to
// hide comments entirely.
export const GISCUS_REPO = ""; // e.g. "yourname/your-blog"
export const GISCUS_REPO_ID = "";
export const GISCUS_CATEGORY = "Comments";
export const GISCUS_CATEGORY_ID = "";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/tags", label: "Tags" },
  { href: "/search", label: "Search" },
  { href: "/contact", label: "Contact" },
] as const;
