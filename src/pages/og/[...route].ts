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
    bgGradient: [[7, 5, 2]],
    border: { color: [255, 179, 0], width: 4 },
    font: {
      title: {
        size: 64,
        lineHeight: 1.2,
        color: [255, 213, 79],
        families: ["monospace"],
      },
      description: {
        size: 32,
        color: [255, 179, 0],
        families: ["monospace"],
      },
    },
    padding: 80,
  }),
});
