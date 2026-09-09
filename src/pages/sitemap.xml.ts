import type { APIRoute } from 'astro';
import { industries, site } from '../data/site';
import {
  authorPath,
  blogPath,
  categoryPath,
  collectCategories,
  countPostsByAuthor,
  getSortedPosts,
  lastPageOf,
  paginatedPosts,
  pickFeatured,
  POSTS_PER_PAGE,
} from '../lib/blog';
import { team } from '../data/team';

const STATIC = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/ksiegowosc', priority: 0.9, changefreq: 'monthly' },
  { path: '/ksiegowosc-online', priority: 0.9, changefreq: 'monthly' },
  { path: '/biuro-rachunkowe-krakow', priority: 0.8, changefreq: 'monthly' },
  { path: '/kadry-place', priority: 0.9, changefreq: 'monthly' },
  // Podstrony branżowe - lista pochodzi z konfiguracji menu (src/data/site.ts).
  ...industries.map((i) => ({ path: i.href, priority: 0.9, changefreq: 'monthly' })),
  { path: '/cennik', priority: 0.9, changefreq: 'monthly' },
  { path: '/wycena', priority: 0.9, changefreq: 'monthly' },
  { path: '/o-nas', priority: 0.8, changefreq: 'monthly' },
  { path: '/kontakt', priority: 0.8, changefreq: 'monthly' },
  { path: '/wiedza', priority: 0.8, changefreq: 'weekly' },
  { path: '/slownik', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory', priority: 0.8, changefreq: 'monthly' },
  { path: '/kalkulatory/skladka-zdrowotna', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/ryczalt-vs-liniowy', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/wynagrodzenie-brutto-netto-2026', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/auta-w-leasingu', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/zakupow-na-firme', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/zasilku-chorobowego', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/zasilku-macierzynskiego', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/odsetek-podatkowych', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/podrozy-sluzbowej', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/limitu-kasy-fiskalnej', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/umow-zlecenie', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/umow-o-dzielo', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/kilometrowki', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/amortyzacji', priority: 0.7, changefreq: 'monthly' },
  { path: '/kalkulatory/emisji-co2', priority: 0.7, changefreq: 'monthly' },
  { path: '/polityka-prywatnosci', priority: 0.3, changefreq: 'yearly' },
  { path: '/regulamin', priority: 0.3, changefreq: 'yearly' },
];

export const GET: APIRoute = async () => {
  const posts = await getSortedPosts();
  const now = new Date().toISOString();
  const entries: string[] = [];

  const push = (path: string, lastmod: string, changefreq: string, priority: number) => {
    entries.push(
      `  <url><loc>${site.url}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
    );
  };

  for (const s of STATIC) {
    entries.push(
      `  <url><loc>${site.url}${s.path}</loc><lastmod>${now}</lastmod><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`
    );
  }
  for (const p of posts) {
    const lastmod = (p.data.updatedDate ?? p.data.pubDate).toISOString();
    push(`/wiedza/${p.id}`, lastmod, 'monthly', 0.7);
  }

  // Kolejne strony listy artykułów (/wiedza to strona 1, jest już w STATIC).
  const rest = paginatedPosts(posts, pickFeatured(posts));
  const lastListPage = lastPageOf(rest.length, POSTS_PER_PAGE);
  for (let page = 2; page <= lastListPage; page += 1) {
    push(blogPath(page), now, 'weekly', 0.5);
  }

  // Archiwa kategorii wraz z paginacją.
  for (const category of collectCategories(posts)) {
    const pages = lastPageOf(category.count, POSTS_PER_PAGE);
    for (let page = 1; page <= pages; page += 1) {
      push(categoryPath(category.name, page), now, 'weekly', page === 1 ? 0.6 : 0.4);
    }
  }

  // Archiwa autorów - tylko osoby, które mają opublikowane artykuły.
  for (const member of team) {
    const count = countPostsByAuthor(posts, member.id);
    if (!count) continue;
    const pages = lastPageOf(count, POSTS_PER_PAGE);
    for (let page = 1; page <= pages; page += 1) {
      push(authorPath(member.id, page), now, 'weekly', page === 1 ? 0.6 : 0.4);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
