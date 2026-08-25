// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Must match SITE_URL in src/consts.ts — required for RSS, sitemap, and
  // canonical/OG URLs to resolve correctly. Placeholder Netlify subdomain
  // until the site is deployed; swap for the real URL once known.
  site: 'https://tech-blog.netlify.app',

  vite: {
    plugins: [tailwindcss()]
  },

  // 'css-variables' hands code-block colors to CSS (--shiki-* vars in
  // global.css) instead of hardcoding a light/dark theme's colors inline.
  markdown: {
    shikiConfig: {
      theme: 'css-variables'
    }
  },

  integrations: [mdx(), sitemap()]
});