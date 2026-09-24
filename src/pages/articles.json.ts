import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { ledeOf } from '../lib/inline.mjs';

export const GET: APIRoute = async () => {
  const all = await getCollection('articles');
  // A portal is a page like any other: it is searched by name, listed in the
  // editor and titled from its own file. Its slug carries the prefix the link
  // syntax uses, so [[portal:nichirin]] and this agree on one spelling.
  const portals = await getCollection('portals');
  return new Response(
    JSON.stringify([
      ...all.map((e) => ({
        slug: e.id,
        title: e.data.title,
        type: e.data.type,
        icon: e.data.icon ?? null,
        lede: ledeOf(e.body),
      })),
      ...portals.map((e) => ({
        slug: 'portal:' + e.id,
        title: e.data.title,
        type: 'portal',
        icon: null,
        lede: ledeOf(e.body),
      })),
    ]),
    { headers: { 'content-type': 'application/json' } }
  );
};
