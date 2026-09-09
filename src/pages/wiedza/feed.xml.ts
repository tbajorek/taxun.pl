import type { APIRoute } from 'astro';
import { site } from '../../data/site';
import { getPostAuthor, getSortedPosts } from '../../lib/blog';

export const GET: APIRoute = async () => {
  const posts = await getSortedPosts();
  const items = posts
    .map((p) => {
      const url = `${site.url}/wiedza/${p.id}`;
      const author = getPostAuthor(p);
      return `
    <item>
      <title><![CDATA[${p.data.title}]]></title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${p.data.pubDate.toUTCString()}</pubDate>
      <description><![CDATA[${p.data.description}]]></description>
      <category>${p.data.category}</category>
      <dc:creator><![CDATA[${author.name}]]></dc:creator>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${site.name} - Wiedza</title>
    <link>${site.url}/wiedza</link>
    <description>Praktyczna wiedza podatkowa i księgowa</description>
    <language>pl-PL</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
