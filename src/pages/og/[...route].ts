import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { SITE_TITLE, SITE_DESCRIPTION } from "../../consts";

const posts = await getCollection("blog", ({ data }) => !data.draft);

const pages = Object.fromEntries(
  posts.map((post) => [
    post.id,
    { title: post.data.title, description: post.data.description },
  ]),
);

// `index` covers the homepage / any page that doesn't pass its own ogImage.
pages.index = { title: SITE_TITLE, description: SITE_DESCRIPTION };

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[15, 23, 42]],
    border: { color: [56, 189, 248], width: 4 },
    font: {
      title: { size: 64, lineHeight: 1.2, families: ["sans-serif"] },
      description: { size: 32, families: ["sans-serif"] },
    },
    padding: 80,
  }),
});
