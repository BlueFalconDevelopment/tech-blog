// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Must match SITE_URL in src/consts.ts — required for RSS, sitemap, and
  // canonical/OG URLs to resolve correctly. Update this to your real domain.
  site: 'https://example.com',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [mdx(), sitemap()]
});