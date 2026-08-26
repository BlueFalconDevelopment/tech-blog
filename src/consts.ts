// Site-wide constants. Update these for your own blog.

export const SITE_TITLE = "Blue Falcon Development Blog";
export const SITE_DESCRIPTION =
  "Notes and write-ups on software engineering, infrastructure, and whatever else I'm building.";

// Used to build absolute URLs for RSS, sitemap, canonical links, and OG images.
// Must match the `site` value in astro.config.mjs and the `Sitemap:` line in
// public/robots.txt. Swap for a custom domain if one gets attached later.
export const SITE_URL = "https://tech-blog-bluefalcon.netlify.app";

export const AUTHOR = "Your Name";

// Backed by github.com/BlueFalconDevelopment/tech-blog (public, Discussions
// enabled, giscus GitHub App installed).
export const GISCUS_REPO = "BlueFalconDevelopment/tech-blog";
export const GISCUS_REPO_ID = "R_kgDOUEH2gA";
export const GISCUS_CATEGORY = "Announcements";
export const GISCUS_CATEGORY_ID = "DIC_kwDOUEH2gM4DELcX";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/tags", label: "Tags" },
  { href: "/archive", label: "Archive" },
  { href: "/search", label: "Search" },
  { href: "/contact", label: "Contact" },
] as const;
