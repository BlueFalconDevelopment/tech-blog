// Site-wide constants. Update these for your own blog.

export const SITE_TITLE = "Tech Blog";
export const SITE_DESCRIPTION =
  "Notes and write-ups on software engineering, infrastructure, and whatever else I'm building.";

// Used to build absolute URLs for RSS, sitemap, canonical links, and OG images.
// Must match the `site` value in astro.config.mjs and the `Sitemap:` line in
// public/robots.txt. This is a placeholder Netlify subdomain — once the site
// is deployed, swap it for the real *.netlify.app URL (or a custom domain).
export const SITE_URL = "https://tech-blog.netlify.app";

export const AUTHOR = "Your Name";

// Backed by github.com/BlueFalconDevelopment/tech-blog (public, Discussions
// enabled). Still requires installing the giscus GitHub App on that repo at
// https://github.com/apps/giscus before comments will actually load/post —
// that step needs your own GitHub login, so it isn't done yet.
export const GISCUS_REPO = "BlueFalconDevelopment/tech-blog";
export const GISCUS_REPO_ID = "R_kgDOUEH2gA";
export const GISCUS_CATEGORY = "Announcements";
export const GISCUS_CATEGORY_ID = "DIC_kwDOUEH2gM4DELcX";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/tags", label: "Tags" },
  { href: "/search", label: "Search" },
  { href: "/contact", label: "Contact" },
] as const;
